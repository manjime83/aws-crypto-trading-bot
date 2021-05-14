import { handler } from "./index";
import Big, { RoundingMode } from "big.js";

const deal = {
  base_order_average_price: "5.5685",
  safety_order_step_percentage: "1.75",
  martingale_step_coefficient: "1.1",
  completed_manual_safety_orders_count: 0,
};

for (let i = 0; i < 8; i++) {
  deal.completed_manual_safety_orders_count = i;

  const deviation = new Big(deal.martingale_step_coefficient).eq(1)
    ? new Big(deal.safety_order_step_percentage).times(deal.completed_manual_safety_orders_count + 1)
    : new Big(deal.safety_order_step_percentage)
        .times(new Big(deal.martingale_step_coefficient).pow(deal.completed_manual_safety_orders_count + 1).minus(1))
        .div(new Big(deal.martingale_step_coefficient).minus(1));
  const maxBuyPrice = new Big(deal.base_order_average_price).times(new Big(100).minus(deviation).div(100));
  console.debug(i, deviation.toString(), maxBuyPrice.round(4, RoundingMode.RoundDown).toString());
}

process.exit();

handler(
  {},
  {
    callbackWaitsForEmptyEventLoop: true,
    succeed: () => {},
    fail: () => {},
    done: () => {},
    functionVersion: "",
    functionName: "",
    memoryLimitInMB: "",
    logGroupName: "",
    logStreamName: "",
    clientContext: undefined,
    identity: undefined,
    invokedFunctionArn: "",
    awsRequestId: "",
    getRemainingTimeInMillis: () => 0,
  },
  () => {}
);
