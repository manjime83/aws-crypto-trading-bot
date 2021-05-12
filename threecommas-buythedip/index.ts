import { Handler } from "aws-lambda";
const threeCommasAPI = require("3commas-api-node");
import Binance, { CandleChartInterval } from "binance-api-node";
import { RSI, CrossUp } from "technicalindicators";

const { APIKEY, SECRET, RSI_PERIOD, RSI_OVERSOLD } = process.env;
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
  error_description: string;
  error: string;
}

const isOversold = async (symbol: string) => {
  const candles = await binance.candles({ symbol, interval: CandleChartInterval.FIVE_MINUTES });
  const rsi = RSI.calculate({ values: candles.map((candle) => +candle.close), period: +RSI_PERIOD! });
  const crossUp = CrossUp.calculate({ lineA: rsi, lineB: new Array(rsi.length).fill(+RSI_OVERSOLD!) });
  return crossUp[crossUp.length - 1];
};

const TEN_MINUTES = 10 * 60 * 1000;

const buyTheDip = async ({ id: deal_id, to_currency, from_currency }: DealType) => {
  const safetyOrders: [SafetyOrderType] = await api.getDealSafetyOrders(deal_id);
  const lastFilledSafetyOrder = safetyOrders
    .filter((so) => ["Base", "Safety", "Manual Safety"].includes(so.deal_order_type) && so.status_string === "Filled")
    .reduce((prev, curr) => (Date.parse(prev.updated_at) > Date.parse(curr.updated_at) ? prev : curr));

  if (Date.now() - Date.parse(lastFilledSafetyOrder.updated_at) > TEN_MINUTES) {
    const symbol = to_currency.concat(from_currency);
    if (await isOversold(symbol)) {
      const order = await api.dealAddFunds({
        quantity: +lastFilledSafetyOrder.quantity,
        is_market: true,
        response_type: "market_order",
        deal_id,
      });
      return { ...order, deal_id, to_currency, from_currency } as ResponseType;
    }
  }

  return undefined;
};

export const handler: Handler<{}> = async () => {
  const deals: [DealType] = await api.getDeals({ scope: "active" });
  if (Array.isArray(deals) && deals.length > 0) {
    const orders = await Promise.all(
      deals.filter((deal) => +deal.actual_profit_percentage < 0).map((deal) => buyTheDip(deal))
    );
    orders
      .filter((order) => order !== undefined)
      .forEach((order) => {
        if (order!.order_id) {
          console.info(
            `Manual safety order placed (${order!.order_id}). Rate: ${order!.average_price} ${order!.to_currency.concat(
              order!.from_currency
            )}, Amount: ${order!.quantity} ${order!.to_currency}, Volume: ${order!.total} ${
              order!.from_currency
            }. https://3commas.io/deals/${order!.deal_id}`
          );
        } else {
          console.info(
            `Error placing safety order (${order!.to_currency.concat(order!.from_currency)}). ${
              order!.error_description
            }. https://3commas.io/deals/${order!.deal_id}`
          );
        }
      });
  }
};

/* CloudWatch Logs Insights query
filter @message like /3commas.io/
| fields @timestamp, @message
| sort @timestamp desc
| limit 100
*/
