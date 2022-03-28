![QMantis color logo](https://i.ibb.co/YjZnTdj/QMantis-logo-color-small2.png)

# QMantis: Observability and monitoring for GraphQL APIs

QMantis is a GraphQL server with an autoinstrumentation solution for GraphQL APIs using Express. It's an easy and quick way to get your Express-based GraphQL API backend running with an observability feature, which generates and exports metrics and traces data and creates a Grafana dashboard for you to analyze.

With only a few commands, QMantis allows you to:

- Monitor your GraphQL API request rate, error rate, and latency
- Analyze traces for every request made to the `/graphql` endpoint
- Visualize the query made by the user and each resolvers' runtime
- Investigate bottlenecks in your GraphQL API backend

## Installation

`qmantis-express` is a npm package. To install it, use the `npm install` command. You will also need to install `express-graphql` as that is the server that was configured.

```bash
npm install qmantis-express express-graphql
```

## Set Up

1. After you have installed the package, import the server to your `index.js` file after you import `express` and before any other imports. Import `express-graphql` as well.

```javascript
import express from "express";
const app = express();
import {  
	tracing,
  qMantis,
  registerLatency,
  responseTime,
  collectData 
} from "qmantis-express";
import { graphqlHTTP } from "express-graphql";
```

2. Set up three route handlers for the `/graphql` endpoint: `collectData`, `responseTime(registerLatency)`, and `graphqlHTTP(qMantis(schema))` in that order. The `qMantis` callback function accepts a mandatory `schema` (a `GraphQLSchema` instance) argument as well as an optional `rootValue` argument:

```javascript
app.use("/graphql", collectData);
app.use("/graphql", responseTime(registerLatency));
app.use("/graphql", graphqlHTTP(qMantis(schema [,rootValue]))); 
```

3. Clone the [`qmantis-compose`](https://github.com/qmantis/qmantis-compose) folder and run the command `docker-compose up` ([see details here](https://github.com/qmantis/qmantis-compose)).


Your GraphQL API is now running and you can access the metrics and traces dashboards on `localhost:3000`.
