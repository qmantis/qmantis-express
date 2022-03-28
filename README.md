![QMantis color logo](https://i.ibb.co/YjZnTdj/QMantis-logo-color-small2.png)

# QMantis: Observability and monitoring for GraphQL APIs

QMantis is an autoinstrumentation solution for GraphQL APIs using Express. It's an easy and quick way to get your Express-based GraphQL API backend running with an observability feature, which generates and exports metrics and traces data and creates a Grafana dashboard for you to analyze.

With only a few commands, QMantis allows you to:

- Monitor your GraphQL API request rate, error rate, and latency
- Analyze traces for every request made to the `/graphql` endpoint
- Visualize the query made by the user and each resolvers' runtime
- Investigate bottlenecks in your GraphQL API backend

## Installation

`qmantis-express` is a npm package. To install it, use the `npm install` command. The `graphql` package is a peer-dependency, so we recommend installing both packages together.

```bash
npm install qmantis-express graphql
```

## Set Up

1. After you have installed the package, import the server to your `index.js` file:

```javascript
import qMantisServer  from "qmantis-express";
```

2. Set up the server as a route handler for your `/graphql` endpoint and pass your GraphQL schema as a value to the `schema` key:

```javascript
app.use("/graphql", qMantisServer({
  schema: GraphQLSchema
  })
);
```

3. Clone the [`qmantis-compose`](https://github.com/qmantis/qmantis-compose) folder and run the command `docker-compose up` ([see details here](https://github.com/qmantis/qmantis-compose)).


Your GraphQL API is now running and you can access the metrics and traces dashboards on `localhost:3000`.
