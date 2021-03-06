import { MeterProvider } from "@opentelemetry/sdk-metrics-base";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";

const options = { port: 9464, startServer: true };
const exporter = new PrometheusExporter(options);

const meter = new MeterProvider({
  exporter,
  interval: 1000,
}).getMeter("metrics-graphql");

const requestsCounter = meter.createCounter("total_requests", {
  description: "Counting all requests made to /graphql",
});

const errorsCounter = meter.createCounter("total_errors", {
  description: "Counting all errors",
});

const requestLatency = meter.createHistogram("request_latency", {
  description: "Record latency for incoming requests",
  boundaries: [10, 50, 100, 150, 200, 250, 300, 400, 500],
});

const countRequests = () => {
  requestsCounter.add(1);
};

const countErrors = () => {
  errorsCounter.add(1);
};

const registerLatency = (req, res, time) => {
  requestLatency.record(time);
};

export { countRequests, countErrors, registerLatency };
