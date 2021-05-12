import { Handler } from "aws-lambda";
const threeCommasAPI = require("3commas-api-node");
import Binance, { CandleChartInterval } from "binance-api-node";
import { RSI, CrossUp } from "technicalindicators";
// import Big from "big.js";

import { DealType, OrderType, SafetyOrderType } from "./types";

const { APIKEY, SECRET, RSI_PERIOD, RSI_OVERSOLD } = process.env;
const api = new threeCommasAPI({ apiKey: APIKEY!, apiSecret: SECRET! });
const binance = Binance();

const isOversold = async (symbol: string) => {
  const candles = await binance.candles({ symbol, interval: CandleChartInterval.FIVE_MINUTES });
  const rsi = RSI.calculate({ values: candles.map((candle) => +candle.close), period: +RSI_PERIOD! });
  const crossUp = CrossUp.calculate({ lineA: rsi, lineB: new Array(rsi.length).fill(+RSI_OVERSOLD!) });
  // console.debug(symbol, JSON.stringify(rsi.slice(-10)), JSON.stringify(crossUp.slice(-10)));
  return crossUp[crossUp.length - 1];
};

const TEN_MINUTES = 10 * 60 * 1000;

const buyTheDip = async (deal: DealType) => {
  const dealSafetyOrders: [OrderType] = await api.getDealSafetyOrders(deal.id);

  if (dealSafetyOrders) {
    const lastFilledSafetyOrder = dealSafetyOrders
      .filter((so) => ["Base", "Manual Safety"].includes(so.deal_order_type) && so.status_string === "Filled")
      .reduce((prev, curr) => (Date.parse(prev.updated_at) > Date.parse(curr.updated_at) ? prev : curr));

    console.info(deal, lastFilledSafetyOrder);

    if (Date.now() - Date.parse(lastFilledSafetyOrder.updated_at) > TEN_MINUTES) {
      const symbol = deal.to_currency.concat(deal.from_currency);
      if (await isOversold(symbol)) {
        const order = await api.dealAddFunds({
          quantity: +lastFilledSafetyOrder.quantity,
          is_market: true,
          response_type: "market_order",
          deal_id: deal.id,
        });
        return { deal, order } as SafetyOrderType;
      }
    }
  }

  return undefined;
};

export const handler: Handler<{}> = async () => {
  const deals: [DealType] = await api.getDeals({ scope: "active" });

  if (deals) {
    const orders = await Promise.all(
      deals.filter((deal) => +deal.actual_profit_percentage < 0).map((deal) => buyTheDip(deal))
    );

    (orders.filter((order) => order !== undefined) as [SafetyOrderType]).forEach(({ deal, order }) => {
      if (order.order_id) {
        console.info(
          `Manual safety order placed (${order.order_id}). Rate: ${order.average_price} ${deal.to_currency.concat(
            deal.from_currency
          )}, Amount: ${order.quantity} ${deal.to_currency}, Volume: ${order.total} ${
            deal.from_currency
          }. https://3commas.io/deals/${deal.id}`
        );
      } else {
        console.error(
          `Error placing safety order (${deal.to_currency.concat(deal.from_currency)}). ${
            order.error_description
          }. https://3commas.io/deals/${deal.id}`
        );
      }
    });
  }
};

// CloudWatch Logs Insights Query: filter @message like /3commas.io/ | fields @message | sort @timestamp desc | limit 100
