import { Handler } from "aws-lambda";
const threecommas_api_node_1 = require("3commas-api-node");
import Binance, { CandleChartInterval } from "binance-api-node";
import { RSI, CrossUp } from "technicalindicators";
import Decimal from "decimal.js";

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

const TEN_MINUTES = 10 * 60 * 1000;

const buyTheDip = async (deal: DealType) => {
  const orders = (await api.getDealSafetyOrders(deal.id)) as [OrderType];
  if (!orders) return undefined;

  const manualOrders = orders.filter(
    ({ deal_order_type, status_string }) =>
      ["Base", "Manual Safety"].includes(deal_order_type) && status_string === "Filled"
  );

  // const baseOrder = manualOrders[manualOrders.length - 1];
  const lastOrder = manualOrders[0];
  const totalQuantity = manualOrders.reduce((prev, curr) => prev.plus(curr.quantity), new Decimal(0)).toNumber();

  console.debug(
    deal.to_currency.concat(deal.from_currency),
    +deal.current_price > +lastOrder.average_price,
    Date.now() - Date.parse(lastOrder.updated_at) < TEN_MINUTES,
    totalQuantity
  );

  if (
    +deal.current_price > +lastOrder.average_price ||
    Date.now() - Date.parse(lastOrder.updated_at) < TEN_MINUTES ||
    !(await oversold(deal.to_currency.concat(deal.from_currency)))
  )
    return undefined;

  const order = await api.dealAddFunds({
    quantity: totalQuantity,
    is_market: true,
    response_type: "market_order",
    deal_id: deal.id,
  });

  return { deal, order } as SafetyOrderType;
};

const buyTheDipAngel = async (deal: DealType) => {
  const deviation = new Decimal(deal.martingale_step_coefficient).eq(1)
    ? new Decimal(deal.safety_order_step_percentage).times(deal.completed_manual_safety_orders_count + 1)
    : new Decimal(deal.safety_order_step_percentage)
        .times(
          new Decimal(deal.martingale_step_coefficient).pow(deal.completed_manual_safety_orders_count + 1).minus(1)
        )
        .div(new Decimal(deal.martingale_step_coefficient).minus(1));
  const maxBuyPrice = new Decimal(deal.base_order_average_price).times(new Decimal(100).minus(deviation).div(100));

  console.debug(
    deal.to_currency.concat(deal.from_currency),
    deal.completed_manual_safety_orders_count,
    deviation.toString(),
    maxBuyPrice.toString(),
    +deal.bought_amount
  );

  if (maxBuyPrice.lt(deal.current_price) || !(await oversold(deal.to_currency.concat(deal.from_currency))))
    return undefined;

  const order = await api.dealAddFunds({
    quantity: +deal.bought_amount,
    is_market: true,
    response_type: "market_order",
    deal_id: deal.id,
  });

  return { deal, order } as SafetyOrderType;
};

export const handler: Handler<{}> = async () => {
  const deals = (await api.getDeals({ scope: "active" })) as [DealType];
  if (!deals) return;

  const orders = await Promise.all(
    deals
      .filter((deal) => +deal.actual_profit_percentage < 0)
      // .filter((deal) => deal.to_currency.concat(deal.from_currency) === "YFIUSDT")
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
};

// CloudWatch Logs Insights Query: filter @message like /3commas.io/ | fields @message | sort @timestamp desc | limit 100
