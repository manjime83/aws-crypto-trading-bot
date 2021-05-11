import { Handler } from "aws-lambda";
const threeCommasAPI = require("3commas-api-node");
import Binance, { CandleChartInterval } from "binance-api-node";
import { RSI, CrossUp } from "technicalindicators";

const { APIKEY, SECRET, TEST_MODE, RSI_PERIOD, RSI_OVERSOLD } = process.env;
const api = new threeCommasAPI({ apiKey: APIKEY!, apiSecret: SECRET! });
const binance = Binance();

interface DealType {
  id: number;
  from_currency: string;
  to_currency: string;
  actual_profit_percentage: string;
}

interface SafetyOrderType {
  order_id: string;
  deal_order_type: string;
  status_string: string;
  updated_at: string;
  quantity: string;
  total: string;
  average_price: string;
}

interface ResponseType extends SafetyOrderType {
  deal_id: string;
  from_currency: string;
  to_currency: string;
}

const isOversold = async (symbol: string) => {
  const candles = await binance.candles({ symbol, interval: CandleChartInterval.ONE_MINUTE });
  const rsi = RSI.calculate({ values: candles.map((candle) => +candle.close), period: +RSI_PERIOD! });
  const crossUp = CrossUp.calculate({ lineA: rsi, lineB: new Array(rsi.length).fill(+RSI_OVERSOLD!) });
  return crossUp[crossUp.length - 1];
};

const buyTheDip = async ({ id: deal_id, to_currency, from_currency, actual_profit_percentage }: DealType) => {
  const symbol = to_currency.concat(from_currency);
  const oversold = (await isOversold(symbol)) || TEST_MODE! === "true";
  if (oversold && +actual_profit_percentage < 0) {
    const dealSafetyOrders: [SafetyOrderType] = await api.getDealSafetyOrders(deal_id);
    const lastFilledSafetyOrder = dealSafetyOrders
      .filter((so) => ["Base", "Safety", "Manual Safety"].includes(so.deal_order_type) && so.status_string === "Filled")
      .reduce((previousValue, currentValue) =>
        new Date(previousValue.updated_at) > new Date(currentValue.updated_at) ? previousValue : currentValue
      );
    const order = await api.dealAddFunds({
      quantity: +lastFilledSafetyOrder.quantity,
      is_market: true,
      response_type: "market_order",
      deal_id,
    });
    return { ...order, deal_id, to_currency, from_currency } as ResponseType;
  } else {
    return undefined;
  }
};

export const handler: Handler<{}> = async () => {
  const deals: [DealType] = await api.getDeals({ scope: "active" });
  if (Array.isArray(deals) && deals.length > 0) {
    const orders = await Promise.all((TEST_MODE! === "true" ? deals.slice(-1) : deals).map((deal) => buyTheDip(deal)));
    orders
      .filter((order) => order !== undefined)
      .forEach((order) =>
        console.info(
          `Manual safety order placed (${order!.order_id}). Market Rate: ${
            order!.average_price
          } ${order!.to_currency.concat(order!.from_currency)}, Amount: ${order!.quantity} ${
            order!.to_currency
          }, Volume: ${order!.total} ${order!.from_currency}. https://3commas.io/deals/${order!.deal_id}`
        )
      );
  }
};

/* CloudWatch Logs Insights query
filter @message like /3commas.io/
| fields @timestamp, @message
| sort @timestamp desc
| limit 100
*/
