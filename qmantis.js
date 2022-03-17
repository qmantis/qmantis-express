import { countErrors, requestLatency } from "./observability/monitoring.js";

const extensions = ({ context, result }) => {
  let runTime = Date.now() - context.startTime;
  requestLatency.record(runTime);

  if (result.errors) {
    console.log("error", result.errors);
    countErrors();
  }
};

const qMantis = (schema, rootValue) => {
  return (request) => {
      return {
        schema,
    //  rootValue,
        context: { startTime: Date.now() },
        graphiql: true,
        extensions,
      };
    }
}

export default qMantis;