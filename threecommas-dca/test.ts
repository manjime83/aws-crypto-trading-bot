import { handler } from "./index";

handler(
  {},
  {
    callbackWaitsForEmptyEventLoop: false,
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
