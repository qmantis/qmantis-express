import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import { MongoDBInstrumentation } from "@opentelemetry/instrumentation-mongodb";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
// import config from "../config/config.json";

registerInstrumentations({
  instrumentations: [
    new GraphQLInstrumentation(),
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new MongoDBInstrumentation(),
    new PgInstrumentation(),
  ],
});

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: `{config.service}`,
  }),
});

const jaegerExporter = new JaegerExporter({
  tags: [],
  endpoint: "http://localhost:14268/api/traces",
});

provider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));

export default provider.register();
