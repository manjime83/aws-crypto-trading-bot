import { Handler } from "aws-lambda";
const threecommas_api_node_1 = require("3commas-api-node");
import Binance, { CandleChartInterval } from "binance-api-node";
import { BollingerBands, CrossUp } from "technicalindicators";
import Decimal from "decimal.js";

import { DealType, OrderType, SafetyOrderType } from "./types";

const { APIKEY, SECRET, BB_INTERVAL, BB_PERIOD, BB_STDDEV, MARTINGALE } = process.env;
const api = new threecommas_api_node_1({ apiKey: APIKEY!, apiSecret: SECRET! });
const binance = Binance();

const bb = async (symbol: string): Promise<[number, boolean]> => {
  try {
    const candles = await binance.candles({ symbol, interval: BB_INTERVAL! as CandleChartInterval });
    const bollingerBands = BollingerBands.calculate({
      period: +BB_PERIOD!,
      stdDev: +BB_STDDEV!,
      values: candles.map((candle) => +candle.close),
    });
    const crossUp = CrossUp.calculate({
      lineA: bollingerBands.map((bollingerBand) => bollingerBand.pb),
      lineB: new Array(bollingerBands.length).fill(0),
    });
    return [bollingerBands[bollingerBands.length - 1].upper, crossUp[crossUp.length - 1]];
  } catch (e) {
    console.error(e.message);
    throw [0, false];
  }
};

const buyTheDip = async (deal: DealType) => {
  const orders = (await api.getDealSafetyOrders(deal.id)) as [OrderType];
  if (!orders) return undefined;

  const lastOrder = orders
    .filter((deal) => deal.order_type === "BUY" && deal.status_string === "Filled")
    .reduce((prev, curr) => (Date.parse(curr.updated_at) > Date.parse(prev.updated_at) ? curr : prev));
  const deviation = new Decimal(deal.safety_order_step_percentage).times(
    new Decimal(deal.martingale_step_coefficient).pow(deal.completed_safety_orders_count)
  );
  const maxBuyPrice = new Decimal(100).minus(deviation).times(lastOrder.average_price).div(100).toNumber();

  if (+deal.current_price > maxBuyPrice) return undefined;

  const [highbb, cross] = await bb(deal.to_currency.concat(deal.from_currency));
  console.debug(
    deal.to_currency.concat(deal.from_currency),
    "/",
    +deal.current_price,
    "<",
    maxBuyPrice,
    "=",
    +deal.current_price < maxBuyPrice,
    "/",
    highbb,
    "<",
    +lastOrder.average_price,
    "=",
    highbb < +lastOrder.average_price,
    "/",
    "pB =",
    cross
  );

  if (highbb > +lastOrder.average_price) return undefined;
  if (!cross) return undefined;

  const totalQuantity = new Decimal(+deal.bought_volume).times(+MARTINGALE!).toNumber();
  const order = await api.dealAddFunds({
    quantity: totalQuantity,
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
      // .filter((deal) => deal.max_safety_orders === deal.completed_safety_orders_count)
      // .slice(-1)
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
