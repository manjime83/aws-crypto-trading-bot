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

const buyTheDip = async (deal: DealType) => {
  const dealSafetyOrders: [OrderType] = await api.getDealSafetyOrders(deal.id);
  if (!dealSafetyOrders) return undefined;

  const deviation = new Big(deal.martingale_step_coefficient).eq(1)
    ? new Big(deal.safety_order_step_percentage)
    : new Big(deal.safety_order_step_percentage)
        .times(new Big(deal.martingale_step_coefficient).pow(deal.completed_manual_safety_orders_count).minus(1))
        .div(new Big(deal.martingale_step_coefficient).minus(1));
  const nextStepOrderPrice = new Big(deal.base_order_average_price).times(new Big(100).minus(deviation).div(100));
  console.debug(deal.to_currency.concat(deal.from_currency), deviation.toString(), nextStepOrderPrice.toString());

  if (nextStepOrderPrice.lt(new Big(deal.current_price))) return undefined;

  if (!(await oversold(deal.to_currency.concat(deal.from_currency)))) return undefined;

  const totalQuantity = dealSafetyOrders
    .filter((order) => ["Base", "Manual Safety"].includes(order.deal_order_type) && order.status_string === "Filled")
    .reduce((prev, curr) => prev.add(new Big(curr.quantity)), new Big("0"));

  const order = await api.dealAddFunds({
    quantity: totalQuantity.toNumber(),
    is_market: true,
    response_type: "market_order",
    deal_id: deal.id,
  });

  return { deal, order } as SafetyOrderType;
};

export const handler: Handler<{}> = async () => {
  const deals: [DealType] = await api.getDeals({ scope: "active" });

  if (deals) {
    const orders = await Promise.all(
      deals
        .filter(
          (deal) =>
            +deal.actual_profit_percentage < 0 && +deal.completed_manual_safety_orders_count < +deal.max_safety_orders
        )
        .map((deal) => buyTheDip(deal))
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
