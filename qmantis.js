import tracing from "./observability/tracing.js";
import { registerLatency, countRequests } from "./observability/monitoring.js";
import responseTime  from 'response-time';
import config from "./utils.js";

const collectData = (req, res, next) => {
  countRequests();
  if (req.body && req.body.query) {
    if (req.body.query.split(" ")[0] === "mutation") {
      config.operationType = "mutation"
    } else {
      config.operationType = "query"
    }
  }
  next();
}

const extensions = ({ result, operationName }) => {
  config.operationName = operationName || "operation";

  if (result.errors) {
   config.error = true;
 } 
};

const qMantis = (schema, rootValue) => {
  return () => {
    return {
      schema,
     rootValue: rootValue,
      graphiql: true,
      extensions,
    };
  };
};

export { tracing, qMantis, registerLatency, responseTime, collectData };