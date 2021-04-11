import { EventBridgeHandler } from "aws-lambda";
import * as AWS from "aws-sdk";
import * as ccxt from "ccxt";

const sm = new AWS.SecretsManager();
const ses = new AWS.SESV2(); // cambiar ses por SNS

let coldstart = true;
let config: { apiKey: string; secret: string };

export const handler: EventBridgeHandler<"Scheduled Event", {}, string> = async () => {
  if (coldstart) {
    coldstart = false;

    const { SecretString: secretString = "{}" } = await sm
      .getSecretValue({ SecretId: process.env.BINANCE_SECRET! })
      .promise();
    config = JSON.parse(secretString);
  }

  const exchange = new ccxt.binance({ verbose: false, ...config });
  const markets = await exchange.loadMarkets();

  const {
    INVESTMENT_BASE_ASSET: baseAsset = "BTC",
    INVESTMENT_QUOTE_ASSET: quoteAsset = "USDT",
    INVESTMENT_QUOTE_ORDER_QTY: quoteOrderQty = "10",
  } = process.env;

  const symbol = baseAsset.trim() + "/" + quoteAsset.trim();

  const { close: price = 0, percentage } = await exchange.fetchTicker(symbol);
  const {
    precision: { base: basePrecision, quote: quotePrecision, amount: amountPrecision, price: pricePrecision },
  } = markets[symbol];

  let result: string;
  try {
    const amount = precise(+quoteOrderQty / price, amountPrecision);
    await exchange.createMarketBuyOrder(symbol, amount);
    result = `SUCCESS: Bought ${amount} ${baseAsset} with ${precise(amount * price, pricePrecision)} ${quoteAsset}`;
  } catch (err) {
    result = "ERROR: " + err.message;
  }

  const {
    [baseAsset]: baseAssetBalance,
    [quoteAsset]: quoteAssetBalance,
    BNB: bnbBalance,
  } = await exchange.fetchFreeBalance();

  const { close: bnbPrice = 0 } = await exchange.fetchTicker("BNB/USDT");
  const {
    precision: { base: bnbPrecision },
  } = markets["BNB/USDT"];

  const balance = baseAssetBalance * price + quoteAssetBalance + bnbBalance * bnbPrice;

  try {
    const textData = `1 ${baseAsset} = ${price} ${quoteAsset}
24h Change: ${percentage}%
  
${result}

${baseAsset}: ${precise(baseAssetBalance, basePrecision)} ≈ ${precise(
      baseAssetBalance * price,
      pricePrecision
    )} ${quoteAsset}
${quoteAsset}: ${precise(quoteAssetBalance, quotePrecision)} ≈ ${precise(
      quoteAssetBalance,
      pricePrecision
    )} ${quoteAsset}
BNB: ${precise(bnbBalance, bnbPrecision)} ≈ ${precise(bnbBalance * bnbPrice, pricePrecision)} ${quoteAsset}
Total balance: ${precise(balance, pricePrecision)} ${quoteAsset}`;

    console.info(textData);

    await ses
      .sendEmail({
        FromEmailAddress: process.env.NOTIFICATION_FROM_EMAIL,
        Destination: { ToAddresses: [process.env.NOTIFICATION_TO_EMAIL!] },
        Content: {
          Simple: {
            Subject: {
              Data: `[trading-bot] ${result}`,
            },
            Body: {
              Text: {
                Data: textData,
              },
            },
          },
        },
      })
      .promise();
  } catch (err) {
    console.error(err);
  }

  return result;
};

const precise = (number: number, precision: number): number => {
  const p = Math.pow(10, precision);
  return Math.ceil(number * p) / p;
};
