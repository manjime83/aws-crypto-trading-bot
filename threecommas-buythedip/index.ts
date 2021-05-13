import { Handler } from "aws-lambda";
const threecommas_api_node_1 = require("3commas-api-node");
import Binance, { CandleChartInterval } from "binance-api-node";
import { RSI, CrossUp } from "technicalindicators";
import Big from "big.js";

import { DealType, OrderType, SafetyOrderType } from "./types";

const { APIKEY, SECRET, RSI_PERIOD, RSI_OVERSOLD } = process.env;
const api = new threecommas_api_node_1({ apiKey: APIKEY!, apiSecret: SECRET! });
const binance = Binance();

const oversold = async (symbol: string) => {
  try {
    const candles = await binance.candles({ symbol, interval: CandleChartInterval.FIVE_MINUTES });
    const rsi = RSI.calculate({ values: candles.map((candle) => +candle.close), period: +RSI_PERIOD! });
    const crossUp = CrossUp.calculate({ lineA: rsi, lineB: new Array(rsi.length).fill(+RSI_OVERSOLD!) });
    return crossUp[crossUp.length - 1];
  } catch (e) {
    console.error(e.message);
    return false;
  }
};

const COOLDOWN_PERIOD = 10 * 60 * 1000;

const buyTheDip = async (deal: DealType) => {
  const dealSafetyOrders: [OrderType] = await api.getDealSafetyOrders(deal.id);

  if (dealSafetyOrders) {
    const filledOrders = dealSafetyOrders.filter(
      (order) => ["Base", "Manual Safety"].includes(order.deal_order_type) && order.status_string === "Filled"
    );
    const lastOrder = filledOrders.reduce((prev, curr) =>
      Date.parse(prev.updated_at) > Date.parse(curr.updated_at) ? prev : curr
    );

    if (
      +lastOrder.average_price > +deal.current_price &&
      Date.now() - Date.parse(lastOrder.updated_at) > COOLDOWN_PERIOD &&
      (await oversold(deal.to_currency.concat(deal.from_currency)))
    ) {
      const totalQuantity = filledOrders.reduce((prev, curr) => prev.add(new Big(curr.quantity)), new Big("0"));
      const order = await api.dealAddFunds({
        quantity: totalQuantity.toNumber(),
        is_market: true,
        response_type: "market_order",
        deal_id: deal.id,
      });

      return { deal, order } as SafetyOrderType;
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
