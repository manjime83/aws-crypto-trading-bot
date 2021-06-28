import { Handler } from "aws-lambda";
const threecommas_api_node_1 = require("3commas-api-node");
import Decimal from "decimal.js";

import { DealType, SafetyOrderType } from "./types";

const { APIKEY, SECRET, MARTINGALE } = process.env;
const api = new threecommas_api_node_1({ apiKey: APIKEY!, apiSecret: SECRET! });

const dca = async (deal: DealType) => {
  const totalQuantity = new Decimal(+deal.base_order_volume).times(+MARTINGALE!).toNumber();
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
      .filter((deal) => deal.from_currency === "USDT" && ["ADA"].includes(deal.to_currency))
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
