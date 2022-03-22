import "./observability/tracing.js";
import { countRequests, requestLatency } from "./observability/monitoring.js";
import config from "./utils.js";

const extensions = ({ context, result, operationName }) => {
  let runTime = Date.now() - context.startTime;
  requestLatency.record(runTime);

  config.operationName = operationName || "operation";

  if (result.errors) {
    console.log("error", result.errors);
    config.error = true;
  } else {
    config.error = false;
  }
};

const qMantis = (schema, rootValue) => {
  return () => {
    return {
      schema,
      //  rootValue,
      context: { startTime: Date.now() },
      graphiql: true,
      extensions,
    };
  };
};

export { qMantis, countRequests };