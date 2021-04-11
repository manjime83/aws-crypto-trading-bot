import { handler } from "./index";

handler(
  {
    BTCUSDT: { quoteOrderQty: 10, takeProfit: 5, accumulationOrders: 5, martingale: 5 },
    ETHBTC: { quoteOrderQty: 0.0002, takeProfit: 3, accumulationOrders: 24, martingale: 2 },
  },
  {
    callbackWaitsForEmptyEventLoop: true,
    succeed: () => {},
    fail: () => {},
    done: () => {},
    functionVersion: "$LATEST",
    functionName: "cryptodca",
    memoryLimitInMB: "192",
    logGroupName: "/aws/lambda/cryptodca",
    logStreamName: "2021/04/10/[$LATEST]0448baa3a45f43e48d5b54eba8e85845",
    clientContext: undefined,
    identity: undefined,
    invokedFunctionArn: "arn:aws:lambda:us-east-1:948003242781:function:cryptodca",
    awsRequestId: "4b784e38-0720-4d00-9429-fdaa782a1af0",
    getRemainingTimeInMillis: () => {
      return 0;
    },
  },
  () => {}
);
