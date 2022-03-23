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


import { parseBody } from './parseBody.js';
import { renderGraphiQL } from './renderGraphiQL.js';
import { collectMetrics } from '../observability/monitoring.js';
import config from "../utils.js";


export function qMantisServer(options) {
  devAssertIsNonNullable(options, 'GraphQL middleware requires options.');

  return async function graphqlMiddleware(request, response, next) {
    let startLatency = Date.now();
    let params;
    let showGraphiQL = false;
    let graphiqlOptions;
    let formatErrorFn = formatError;
    let pretty = false;
    let result;

    try {
      // Parse the Request to get GraphQL request parameters.
      try {
        params = await getGraphQLParams(request);
      } catch (error) {
        // When we failed to parse the GraphQL parameters, we still need to get
        // the options object, so make an options call to resolve it.
        const optionsData = await resolveOptions();
        pretty = optionsData.pretty ?? false;
        formatErrorFn =
          optionsData.customFormatErrorFn ??
          optionsData.formatError ??
          formatErrorFn;
        throw error; // 400, Variable are invalid JSON
      }

      // Then, resolve the Options to get OptionsData.
      const optionsData = await resolveOptions(params);

      // Collect information from the options data object.
      const schema = optionsData.schema;
      const rootValue = optionsData.rootValue;
      const validationRules = optionsData.validationRules ?? [];
      const fieldResolver = optionsData.fieldResolver;
      const typeResolver = optionsData.typeResolver;
      const graphiql = optionsData.graphiql ?? false;
      const extensionsFn = optionsData.extensions;
      const context = optionsData.context ?? request;
      const parseFn = optionsData.customParseFn ?? parse;
      const executeFn = optionsData.customExecuteFn ?? execute;
      const validateFn = optionsData.customValidateFn ?? validate;

      pretty = optionsData.pretty ?? false;
      formatErrorFn =
        optionsData.customFormatErrorFn ??
        optionsData.formatError ??
        formatErrorFn;

      devAssertIsObject(
        schema,
        'GraphQL middleware options must contain a schema.',
      );

      if (request.method !== 'GET' && request.method !== 'POST') {
        throw httpError(405, 'GraphQL only supports GET and POST requests.', {
          headers: { Allow: 'GET, POST' },
        });
      }


      // Get GraphQL params from the request and POST body data.
      const { query, variables, operationName } = params;
      showGraphiQL = canDisplayGraphiQL(request, params) && graphiql !== false;
      if (typeof graphiql !== 'boolean') {
        graphiqlOptions = graphiql;
      }

      // If there is no query, but GraphiQL will be displayed, do not produce
      // a result, otherwise return a 400: Bad Request.
      if (query == null) {
        if (showGraphiQL) {
          let formattedResult = {}
          collectMetrics(startLatency, formattedResult)
          console.log("sending response", response.statusCode)
          return respondWithGraphiQL(response, graphiqlOptions);
        }
        throw httpError(400, 'Must provide query string.');
      }

      // Validate Schema
      const schemaValidationErrors = validateSchema(schema);
      if (schemaValidationErrors.length > 0) {
        // Return 500: Internal Server Error if invalid schema.
        throw httpError(500, 'GraphQL schema validation error.', {
          graphqlErrors: schemaValidationErrors,
        });
      }

      // Parse source to AST, reporting any syntax error.
      let documentAST;
      try {
        documentAST = parseFn(new Source(query, 'GraphQL request'));
      } catch (syntaxError) {
        // Return 400: Bad Request if any syntax errors errors exist.
        throw httpError(400, 'GraphQL syntax error.', {
          graphqlErrors: [syntaxError],
        });
      }

      // Validate AST, reporting any errors.
      const validationErrors = validateFn(schema, documentAST, [
        ...specifiedRules,
        ...validationRules,
      ]);

      if (validationErrors.length > 0) {
        // Return 400: Bad Request if any validation errors exist.
        throw httpError(400, 'GraphQL validation error.', {
          graphqlErrors: validationErrors,
        });
      }

      // Only query operations are allowed on GET requests.
      if (request.method === 'GET') {
        // Determine if this GET request will perform a non-query.
        const operationAST = getOperationAST(documentAST, operationName);
        if (operationAST && operationAST.operation !== 'query') {
          // If GraphiQL can be shown, do not perform this query, but
          // provide it to GraphiQL so that the requester may perform it
          // themselves if desired.
          if (showGraphiQL) {
            // get request from graphiQL, no formatted result
            let formattedResult = {}
            collectMetrics(startLatency, formattedResult)
            console.log("sending response", response.statusCode)
            return respondWithGraphiQL(response, graphiqlOptions, params);
          }

          // Otherwise, report a 405: Method Not Allowed error.
          throw httpError(
            405,
            `Can only perform a ${operationAST.operation} operation from a POST request.`,
            { headers: { Allow: 'POST' } },
          );
        }
      }

      // Perform the execution, reporting any errors creating the context.
      try {
        result = await executeFn({
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
        // Return 400: Bad Request if any execution context errors exist.
        throw httpError(400, 'GraphQL execution context error.', {
          graphqlErrors: [contextError],
        });
      }

      // Collect and apply any metadata extensions if a function was provided.
      // https://graphql.github.io/graphql-spec/#sec-Response-Format
      if (extensionsFn) {
        const extensions = await extensionsFn({
          document: documentAST,
          variables,
          operationName,
          result,
          context,
        });

        if (extensions != null) {
          result = { ...result, extensions };
        }
      }
    } catch (rawError) {
      // If an error was caught, report the httpError status, or 500.
      const error = httpError(
        500,
        /* istanbul ignore next: Thrown by underlying library. */
        rawError instanceof Error ? rawError : String(rawError),
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

    // If no data was included in the result, that indicates a runtime query
    // error, indicate as such with a generic status code.
    // Note: Information about the error itself will still be contained in
    // the resulting JSON payload.
    // https://graphql.github.io/graphql-spec/#sec-Data
    if (response.statusCode === 200 && result.data == null) {
      response.statusCode = 500;
    }

    // Format any encountered errors.
    const formattedResult = {
      ...result,
      errors: result.errors?.map(formatErrorFn),
    };


    // If allowed to show GraphiQL, present it instead of JSON.
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

    // If "pretty" JSON isn't requested, and the server provides a
    // response.json method (express), use that directly.
    // Otherwise use the simplified sendResponse method.
    if (!pretty && typeof response.json === 'function') {
      collectMetrics(startLatency, formattedResult)
      response.json(formattedResult);
    } else {
      const payload = JSON.stringify(formattedResult, null, pretty ? 2 : 0);
      collectMetrics(startLatency, formattedResult)
      sendResponse(response, 'application/json', payload);
    }

    async function resolveOptions(requestParams) {
      const optionsResult = await Promise.resolve(
        typeof options === 'function'
          ? options(request, response, requestParams)
          : options,
      );

      devAssertIsObject(
        optionsResult,
        'GraphQL middleware option function must return an options object or a promise which will be resolved to an options object.',
      );

      if (optionsResult.formatError) {
        // eslint-disable-next-line no-console
        console.warn(
          '`formatError` is deprecated and replaced by `customFormatErrorFn`. It will be removed in version 1.0.0.',
        );
      }

      return optionsResult;
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


/**
 * Provided a "Request" provided by express or connect (typically a node style
 * HTTPClientRequest), Promise the GraphQL request parameters.
 */
export async function getGraphQLParams(request) {
  const urlData = new URLSearchParams(request.url.split('?')[1]);
  const bodyData = await parseBody(request);

  // GraphQL Query string.
  let query = urlData.get('query') ?? (bodyData.query);
  if (typeof query !== 'string') {
    query = null;
  }

  // Parse the variables if needed.
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

  // Name of GraphQL operation to execute.
  let operationName =
    urlData.get('operationName') ?? (bodyData.operationName);
  if (typeof operationName !== 'string') {
    operationName = null;
  }

  config.operationName = operationName;

  const raw = urlData.get('raw') != null || bodyData.raw !== undefined;

  return { query, variables, operationName, raw };
}

/**
 * Helper function to determine if GraphiQL can be displayed.
 */
function canDisplayGraphiQL(request, params) {
  // If `raw` false, GraphiQL mode is not enabled.
  // Allowed to show GraphiQL if not requested as raw and this request prefers HTML over JSON.
  return !params.raw && accepts(request).types(['json', 'html']) === 'html';
}

/**
 * Helper function for sending a response using only the core Node server APIs.
 */
function sendResponse(response, type, data) {
  const chunk = Buffer.from(data, 'utf8');
  response.setHeader('Content-Type', type + '; charset=utf-8');
  response.setHeader('Content-Length', String(chunk.length));
  response.end(chunk);
}

function devAssertIsObject(value, message) {
  devAssert(value != null && typeof value === 'object', message);
}

function devAssertIsNonNullable(value, message) {
  devAssert(value != null, message);
}

function devAssert(condition, message) {
  const booleanCondition = Boolean(condition);
  if (!booleanCondition) {
    throw new TypeError(message);
  }
}
