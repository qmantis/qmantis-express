![QMantis color logo](https://i.ibb.co/YjZnTdj/QMantis-logo-color-small2.png)

# QMantis: GraphQL Server and autoinstrumentation for GraphQL observability

QMantis is a GraphQL server with autoinstrumentation for GraphQL API observability. It's an easy and quick solution to get your express-based GraphQL API backend running with an automatic observability feature, which generates and exports metrics and traces data and creates a dashboard for you to analyze it.

## Installation

qmantis-server-express is a npm package. Use the `npm install`command to install it. The `graphql` package is a peer-dependency, so we recommend installing both packages together.

```bash
npm install qmantis graphql
```

## Set Up

1. After you have installed the package, import the server to your `index.js` file:

```javascript
import  qMantisServer  from 'qmantis';
```

2. Set up the server as a route handler for your `/graphql` endpoint and pass your schema as a value for the `schema` key:

```javascript
app.use("/graphql", qMantisServer({
  schema: GraphQLSchema
  })
);
```

3. Clone the qmantis-compose folder and run the command `docker-compose up` (see details here [LINK_TO_QMANTIS-COMPOSE]).



