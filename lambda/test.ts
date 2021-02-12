import { handler } from "./index";

handler(
  {
    version: "0",
    id: "e57548f0-8044-102b-6b49-235f35d02898",
    "detail-type": "Scheduled Event",
    source: "aws.events",
    account: "948003242781",
    time: "2021-02-10T17:58:46Z",
    region: "us-east-1",
    resources: ["arn:aws:events:us-east-1:948003242781:rule/trading-bot-rule"],
    detail: {},
  },
  {
    callbackWaitsForEmptyEventLoop: true,
    functionVersion: "$LATEST",
    functionName: "trading-bot",
    memoryLimitInMB: "128",
    logGroupName: "/aws/lambda/trading-bot",
    logStreamName: "2021/02/10/[$LATEST]2804351265fb4eb68317ee238d6edcd8",
    invokedFunctionArn: "arn:aws:lambda:us-east-1:948003242781:function:trading-bot",
    awsRequestId: "4b784e38-0720-4d00-9429-fdaa782a1af0",
    getRemainingTimeInMillis: () => {
      return 0;
    },
    done: () => {},
    fail: () => {},
    succeed: () => {},
  },
  () => {}
);
