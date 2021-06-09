import { handler } from "./index";
// import Decimal from "decimal.js";

// const deal = {
//   base_order_average_price: "5.5685",
//   safety_order_step_percentage: "1.75",
//   martingale_step_coefficient: "1",
//   completed_manual_safety_orders_count: 0,
//   safety_order_volume: "50",
//   max_safety_orders: 8,
// };

// for (let i = 0; i < 10; i++) {
//   deal.completed_manual_safety_orders_count = i;

//   const deviation = new Decimal(deal.safety_order_step_percentage).times(
//     new Decimal(deal.martingale_step_coefficient).pow(deal.completed_manual_safety_orders_count)
//   );

//   console.debug(i, deviation.toString());
// }

// process.exit();

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
