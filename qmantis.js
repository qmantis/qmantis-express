import "./observability/tracing.js";
import accepts from 'accepts';
import httpError from 'http-errors';
import {
  Source,
  GraphQLError,
  parse,
  validate,
  execute,
  formatError,
  validateSchema,
  getOperationAST,
  specifiedRules,
} from 'graphql';


import { parseBody } from './helper/parseBody.js';
import { renderGraphiQL } from './helper/renderGraphiQL.js';
import { collectMetrics } from './observability/monitoring.js';
import config from "./utils.js";


export function qMantisServer(options) {
  if (options === null || options === undefined) {
    throw new TypeError('GraphQL requires a schema.')
  }

  return async function qMantislMiddleware(request, response) {
    let startLatency = Date.now();
    let params;
    let showGraphiQL = false;
    let graphiqlOptions;
    let pretty = false;
    let result;

    try {
      try {
        params = await getGraphQLParams(request);
      } catch (error) {
        throw error;
      }

      const schema = options.schema;
      const rootValue = options.rootValue;
      const fieldResolver = options.fieldResolver;
      const typeResolver = options.typeResolver;
      const graphiql = false //true;
      const context = request;

      pretty = options.pretty ?? false;

      if (schema === null || schema === undefined || typeof schema !== 'object') {
        throw new TypeError('GraphQL requires a schema.')
      }

      if (request.method !== 'GET' && request.method !== 'POST') {
        throw httpError(405, `${request.method} request is not supported. GraphQL only supports GET and POST requests.`, {
          headers: { Allow: 'GET, POST' },
        });
      }

      // Get GraphQL params from the request and POST body data.
      const { query, variables, operationName } = params;
      showGraphiQL = canDisplayGraphiQL(request, params) && graphiql !== false;
      if (typeof graphiql !== 'boolean') {
        graphiqlOptions = graphiql;
      }

      if (query == null) {
        if (showGraphiQL) {
          let formattedResult = {}
          collectMetrics(startLatency, formattedResult)
          console.log("sending response", response.statusCode)
          return respondWithGraphiQL(response, graphiqlOptions);
        }
        throw httpError(400, 'Must provide a query string.');
      }

      const schemaValidationErrors = validateSchema(schema);
      if (schemaValidationErrors.length > 0) {
        throw httpError(500, 'GraphQL schema validation error.', {
          graphqlErrors: schemaValidationErrors,
        });
      }

      let documentAST;
      try {
        documentAST = parse(new Source(query, 'GraphQL request'));
      } catch (syntaxError) {
        throw httpError(400, 'GraphQL syntax error.', {
          graphqlErrors: [syntaxError],
        });
      }

      const validationErrors = validate(schema, documentAST, [
        ...specifiedRules,
      ]);

      if (validationErrors.length > 0) {
        throw httpError(400, 'GraphQL validation error.', {
          graphqlErrors: validationErrors,
        });
      }

      const operationAST = getOperationAST(documentAST, operationName);
      config.operationType = operationAST.operation;

      if (request.method === 'GET') {
        if (operationAST && operationAST.operation !== 'query') {
          if (showGraphiQL) {
            let formattedResult = {}
            collectMetrics(startLatency, formattedResult)
            return respondWithGraphiQL(response, graphiqlOptions, params);
          }

          throw httpError(
            405,
            `Can only perform a ${operationAST.operation} operation from a POST request.`,
            { headers: { Allow: 'POST' } },
          );
        }
      }

      try {
        result = await execute({
          schema,
          document: documentAST,
          rootValue,
          contextValue: context,
          variableValues: variables,
          operationName,
          fieldResolver,
          typeResolver,
        });
      } catch (contextError) {
        throw httpError(400, 'GraphQL execution context error.', {
          graphqlErrors: [contextError],
        });
      }

    } catch (rawError) {
      const error = httpError(
        500, rawError instanceof Error ? rawError : String(rawError),
      );

      response.statusCode = error.status;

      const { headers } = error;
      if (headers != null) {
        for (const [key, value] of Object.entries(headers)) {
          response.setHeader(key, String(value));
        }
      }

      if (error.graphqlErrors == null) {
        const graphqlError = new GraphQLError(
          error.message,
          undefined,
          undefined,
          undefined,
          undefined,
          error,
        );
        result = { data: undefined, errors: [graphqlError] };
      } else {
        result = { data: undefined, errors: error.graphqlErrors };
      }
    }

    if (response.statusCode === 200 && result.data == null) {
      response.statusCode = 500;
    }

    const formattedResult = {
      ...result,
      errors: result.errors?.map(formatError),
    };

    if (showGraphiQL) {
      collectMetrics(startLatency, formattedResult)
      console.log("sending response", response.statusCode)
      return respondWithGraphiQL(
        response,
        graphiqlOptions,
        params,
        formattedResult,
      );
    }

    if (!pretty && typeof response.json === 'function') {
      collectMetrics(startLatency, formattedResult)
      response.json(formattedResult);
    } else {
      const payload = JSON.stringify(formattedResult, null, pretty ? 2 : 0);
      collectMetrics(startLatency, formattedResult)
      sendResponse(response, 'application/json', payload);
    }
  };
}

function respondWithGraphiQL(
  response,
  options,
  params,
  result
) {
  const data = {
    query: params?.query,
    variables: params?.variables,
    operationName: params?.operationName,
    result,
  };
  const payload = renderGraphiQL(data, options);
  return sendResponse(response, 'text/html', payload);
}


export async function getGraphQLParams(request) {
  const urlData = new URLSearchParams(request.url.split('?')[1]);
  const bodyData = await parseBody(request);

  let query = urlData.get('query') ?? (bodyData.query);
  if (typeof query !== 'string') {
    query = null;
  }

  let variables = (urlData.get('variables') ?? bodyData.variables)
  if (typeof variables === 'string') {
    try {
      variables = JSON.parse(variables);
    } catch {
      throw httpError(400, 'Variables are invalid JSON.');
    }
  } else if (typeof variables !== 'object') {
    variables = null;
  }


  let operationName = urlData.get('operationName') ?? (bodyData.operationName);
  if (typeof operationName !== 'string') {
    operationName = null;
  }

  config.operationName = operationName;

  const raw = urlData.get('raw') != null || bodyData.raw !== undefined;

  return { query, variables, operationName, raw };
}

function canDisplayGraphiQL(request, params) {
  return !params.raw && accepts(request).types(['json', 'html']) === 'html';
}

function sendResponse(response, type, data) {
  const chunk = Buffer.from(data, 'utf8');
  response.setHeader('Content-Type', type + '; charset=utf-8');
  response.setHeader('Content-Length', String(chunk.length));
  response.end(chunk);
}


export default qMantisServer;