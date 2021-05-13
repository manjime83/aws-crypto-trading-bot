import { handler } from "./index";
// import Big, { RoundingMode } from "big.js";

// const deal = {
//   base_order_average_price: "5.4319",
//   safety_order_step_percentage: "1.75",
//   martingale_step_coefficient: "1.1",
// };

// for (let i = 1; i <= 7; i++) {
//   const martingale_step_coefficient = new Big(deal.martingale_step_coefficient);
//   const deviation = martingale_step_coefficient.eq(1)
//     ? new Big(deal.safety_order_step_percentage)
//     : new Big(deal.safety_order_step_percentage)
//         .times(martingale_step_coefficient.pow(i).minus(1))
//         .div(martingale_step_coefficient.minus(1));
//   const nextStepOrderPrice = new Big(deal.base_order_average_price).times(
//     new Big(100).minus(deviation).div(new Big(100))
//   );
//   console.debug(i, deviation.toString(), nextStepOrderPrice.round(4, RoundingMode.RoundDown).toString());
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
