import { Handler } from "aws-lambda";
const threecommas_api_node_1 = require("3commas-api-node");
import Binance, { CandleChartInterval } from "binance-api-node";
import { RSI } from "technicalindicators";
import Decimal from "decimal.js";

import { DealType, SafetyOrderType } from "./types";

const { APIKEY, SECRET, PERCENTAGE } = process.env;
const api = new threecommas_api_node_1({ apiKey: APIKEY!, apiSecret: SECRET! });
const binance = Binance();

const rsi = async (symbol: string): Promise<number> => {
  try {
    const candles = await binance.candles({ symbol, interval: CandleChartInterval.ONE_DAY });
    const rsi = RSI.calculate({ period: 14, values: candles.map((candle) => +candle.close) });
    return rsi[rsi.length - 1]!;
  } catch (e) {
    console.error(e.message);
    return 100;
  }
};

const dca = async (deal: DealType) => {
  const [dataForAddingFunds, rsiValue] = await Promise.all([
    api.makeRequest("GET", `/public/api/ver1/deals/${deal.id}/data_for_adding_funds?`, {
      deal_id: deal.id,
    }),
    rsi(deal.to_currency.concat(deal.from_currency)),
  ]);

  const rsiBonus = new Decimal(100).minus(rsiValue).times(2).div(100);

  console.debug(deal.to_currency.concat(deal.from_currency), "RSI value:", rsiValue, "RSI bonus:", rsiBonus.toNumber());

  const totalQuantity = new Decimal(deal.bought_volume)
    .times(+PERCENTAGE!)
    .div(100)
    .times(rsiBonus)
    .div(dataForAddingFunds.orderbook_price)
    .toNearest(dataForAddingFunds.min_lot_size)
    .toNumber();

  console.debug(
    deal.to_currency.concat(deal.from_currency),
    "buying",
    totalQuantity,
    deal.to_currency,
    "at",
    +deal.current_price,
    deal.to_currency + deal.from_currency,
    "with",
    +deal.current_price * totalQuantity,
    deal.from_currency
  );

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
      // .sort((pv, cv) => +pv.actual_profit_percentage - +cv.actual_profit_percentage)
      .filter((deal) => deal.from_currency === "USDT" && ["BTT"].includes(deal.to_currency))
      // .slice(-1)
      .map((deal) => dca(deal))
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
