import "./observability/tracer.js";
import { countRequests, countErrors, requestLatency } from "./observability/metrics.js";

const extensions = ({ context, result }) => {
  let runTime = Date.now() - context.startTime;
  requestLatency.record(runTime);

  if (result.errors) {
    console.log("error", result.errors);
    countErrors();
  }
};

const qMantis = (schema) => {
  return (request) => {
    return {
      schema,
      context: { startTime: Date.now() },
      graphiql: true,
      extensions,
    };
  };
};

export { countRequests, qMantis };
