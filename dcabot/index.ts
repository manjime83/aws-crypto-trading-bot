import { Handler } from "aws-lambda";
import axios from "axios";
import Binance, { ErrorCodes, SymbolPriceFilter, SymbolLotSizeFilter } from "binance-api-node";
import { Decimal } from "decimal.js";
import * as AWS from "aws-sdk";

const sm = new AWS.SecretsManager();
const dc = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

const { SECRET_ARN, TABLE_NAME, TOPIC_ARN } = process.env;

const binancePromise = (async () => {
  const { SecretString: secretString = "{}" } = await sm.getSecretValue({ SecretId: SECRET_ARN! }).promise();
  const { key: apiKey, secret: apiSecret } = JSON.parse(secretString);
  return Binance({ apiKey, apiSecret });
})();

interface SymbolConfig {
  symbol: string;
  price: number;
  baseAsset: string;
  quoteAsset: string;
  priceTickSize: number;
  lotStepSize: number;
  quoteOrderQty: number;
  takeProfit: number;
  accumulationOrders: number;
  martingale: number;
  interrupt: boolean;
}

const dca = async ({
  symbol,
  price,
  baseAsset,
  quoteAsset,
  priceTickSize,
  lotStepSize,
  quoteOrderQty,
  takeProfit,
  accumulationOrders,
  martingale,
  interrupt,
}: SymbolConfig) => {
  const binance = await binancePromise;

  let { Item = { executedQty: 0, takeProfitOrderId: 0, cummulativeQuoteQty: 0, numOrders: 0, symbol } } = await dc
    .get({ TableName: TABLE_NAME!, Key: { symbol } })
    .promise();

  if (Item.takeProfitOrderId) {
    try {
      const takeProfitOrder = await binance.getOrder({ symbol, orderId: Item.takeProfitOrderId });
      if (takeProfitOrder.status !== "NEW") {
        // TODO: if CANCELLED reset all
        await sns
          .publish({
            TopicArn: TOPIC_ARN,
            Subject: `Orden cerrada ${takeProfitOrder.status}`,
            Message: `Se vendio ${takeProfitOrder.executedQty} ${baseAsset} en ${
              takeProfitOrder.cummulativeQuoteQty
            } ${quoteAsset}, La ganancia fue de ${new Decimal(takeProfitOrder.cummulativeQuoteQty).minus(
              Item.cummulativeQuoteQty
            )} ${quoteAsset} \n ${JSON.stringify(takeProfitOrder)}`,
          })
          .promise();

        if (interrupt) {
          console.log(symbol, `bot is interrpted and will not start new trades`);
          await dc.delete({ TableName: TABLE_NAME!, Key: { symbol } }).promise();
          return;
        }

        Item = { executedQty: 0, takeProfitOrderId: 0, cummulativeQuoteQty: 0, numOrders: 0, symbol };
      }
    } catch (error) {
      if (error.code === ErrorCodes.NO_SUCH_ORDER) {
        Item = { executedQty: 0, takeProfitOrderId: 0, cummulativeQuoteQty: 0, numOrders: 0, symbol };
      } else {
        console.error(symbol, error.code, error.message);
        await sns
          .publish({
            TopicArn: TOPIC_ARN,
            Subject: symbol + " " + error.message,
            Message: symbol + " " + error.message,
          })
          .promise();
      }
    }
  } else {
    if (interrupt) {
      console.log(symbol, `bot is interrpted and will not start new trades`);
      return;
    }
  }

  if (accumulationOrders <= Item.numOrders) {
    const averagePrice = new Decimal(Item.cummulativeQuoteQty).div(Item.executedQty).toNearest(priceTickSize);
    if (averagePrice.gt(price)) {
      quoteOrderQty = new Decimal(quoteOrderQty).times(martingale).toNearest(priceTickSize).toNumber();
      console.log(
        symbol,
        "accumulation period has expired and current price is below average, applying martingale. current price:",
        price,
        symbol + ",",
        "average price:",
        averagePrice,
        symbol + ",",
        "new quoteOrderQty:",
        quoteOrderQty,
        quoteAsset
      );
    } else {
      console.log(
        symbol,
        "accumulation period has expired and current price is above average, hold the position. current price:",
        price,
        symbol + ",",
        "average price:",
        averagePrice,
        symbol
      );
      return;
    }
  }

  try {
    const order = await binance.order({ symbol, side: "BUY", type: "MARKET", quoteOrderQty: quoteOrderQty.toString() });
    console.log(
      symbol,
      `market order executed: ${order.executedQty} ${baseAsset} bought with ${order.cummulativeQuoteQty} ${quoteAsset}`
    );

    if (Object.keys(order).length > 0) {
      Item.numOrders += 1;
      Item.executedQty = new Decimal(order.executedQty).plus(Item.executedQty).toNumber();
      Item.cummulativeQuoteQty = new Decimal(order.cummulativeQuoteQty).plus(Item.cummulativeQuoteQty).toNumber();
    }

    const targetPrice = new Decimal(Item.cummulativeQuoteQty)
      .div(Item.executedQty)
      .times(new Decimal(takeProfit).div(100).plus(1))
      .toNearest(priceTickSize)
      .toString();
    const quantity = new Decimal(Item.executedQty).toNearest(lotStepSize).toString();

    if (Item.takeProfitOrderId) await binance.cancelOrder({ symbol, orderId: Item.takeProfitOrderId });
    const takeProfitOrder = await binance.order({ symbol, side: "SELL", type: "LIMIT", price: targetPrice, quantity });
    console.log(symbol, `take profit order placed: sell ${quantity} ${baseAsset} at ${targetPrice} ${symbol}`);
    Item.takeProfitOrderId = takeProfitOrder.orderId;

    await dc.put({ TableName: TABLE_NAME!, Item }).promise();
  } catch (error) {
    console.error(symbol, error.code, error.message);
    await sns
      .publish({
        TopicArn: TOPIC_ARN,
        Subject: symbol + " " + error.message,
        Message: symbol + " " + error.message,
      })
      .promise();
  }
};

export const handler: Handler<{
  configUrl: string;
}> = async (event) => {
  const input: {
    [symbol: string]: {
      quoteOrderQty: number;
      takeProfit: number;
      accumulationOrders: number;
      martingale: number;
      interrupt: boolean;
    };
  } = (await axios.get(event.configUrl)).data;

  const binance = await binancePromise;

  const [exchangeInfo, prices] = await Promise.all([binance.exchangeInfo(), binance.prices()]);
  const symbols = exchangeInfo.symbols.filter(({ symbol }) => Object.keys(input).includes(symbol));
  const configs = symbols.map(({ symbol, baseAsset, quoteAsset, filters }) => {
    const { tickSize } = filters.find((filter) => filter.filterType === "PRICE_FILTER") as SymbolPriceFilter;
    const { stepSize } = filters.find((filter) => filter.filterType === "LOT_SIZE") as SymbolLotSizeFilter;
    const { quoteOrderQty, takeProfit, accumulationOrders, martingale, interrupt } = input[symbol];
    return {
      symbol,
      price: +prices[symbol],
      baseAsset,
      quoteAsset,
      priceTickSize: +tickSize,
      lotStepSize: +stepSize,
      quoteOrderQty,
      takeProfit,
      accumulationOrders,
      martingale,
      interrupt,
    } as SymbolConfig;
  });

  console.log(JSON.stringify(configs));

  for (const config of configs) {
    await dca(config);
  }
};
