const { HttpInstrumentation } = require ('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require ('@opentelemetry/instrumentation-express');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require("@opentelemetry/node");
const { BatchSpanProcessor } = require ("@opentelemetry/tracing");
const { Resource } = require('@opentelemetry/resources');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger')
const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');
const config = require("../config/config.json")

registerInstrumentations({
  instrumentations: [
    new GraphQLInstrumentation(),
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new MongoDBInstrumentation(),
    new PgInstrumentation(),
  ]
});

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: `{config.service}`,
  }),
});

const jaegerExporter = new JaegerExporter({
  tags: [],
  endpoint: `http://localhost:14268/api/traces`,
});

provider.addSpanProcessor(
  new BatchSpanProcessor(jaegerExporter)
);

provider.register();
