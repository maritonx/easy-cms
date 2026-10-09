import {
  type AuthUser,
  type EasyCMS,
  EasyCMSError,
  ForbiddenError,
  NotFoundError,
  type RequestContext,
  UnauthorizedError,
  ValidationError,
} from '@easy-cms/core'
import {
  type DocumentNode,
  type ExecutionResult,
  execute,
  type GraphQLError,
  type GraphQLSchema,
  getOperationAST,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
} from 'graphql'
import { createContext } from './context.js'
import { graphiqlPage } from './graphiql.js'
import { depthLimit } from './limits.js'

export interface RunOptions {
  readonly schema: GraphQLSchema
  /** Most levels of fields in one operation. */
  readonly depth: number
  /** Most documents one request loads. */
  readonly documents: number
  /** Allow `__schema` and `__type`. */
  readonly introspection: boolean
  /** Show GraphiQL to browsers. */
  readonly graphiql: boolean
}

export interface GraphQLRequest {
  readonly query: string
  readonly variables?: Record<string, unknown> | null
  readonly operationName?: string | null
}

type Json = Record<string, unknown>

/** The code in `extensions.code` for an Easy CMS error, as REST tells them apart. */
function codeOf(error: EasyCMSError): string {
  if (error instanceof ValidationError) return 'VALIDATION_ERROR'
  if (error instanceof UnauthorizedError) return 'UNAUTHORIZED'
  if (error instanceof ForbiddenError) return 'FORBIDDEN'
  if (error instanceof NotFoundError) return 'NOT_FOUND'
  switch (error.status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 413:
      return 'PAYLOAD_TOO_LARGE'
    case 429:
      return 'TOO_MANY_REQUESTS'
    default:
      return 'INTERNAL_SERVER_ERROR'
  }
}

/**
 * An error as the response shows it. Easy CMS errors keep their message and get a code (and
 * `fields` for invalid data); unexpected errors are logged, and hidden in production.
 */
function formatError(error: GraphQLError, cms: EasyCMS): Json {
  const original = error.originalError
  const base: Json = {
    message: error.message,
    ...(error.locations ? { locations: error.locations } : {}),
    ...(error.path ? { path: error.path } : {}),
  }
  if (original instanceof EasyCMSError && original.status < 500) {
    return {
      ...base,
      extensions: {
        ...error.extensions,
        code: codeOf(original),
        ...(original instanceof ValidationError ? { fields: original.errors } : {}),
      },
    }
  }
  // Errors of the query itself and our own GraphQLErrors carry no unexpected original.
  if (!original || (original as GraphQLError).extensions?.code) {
    return {
      ...base,
      ...(original ? { message: original.message } : {}),
      extensions: { ...error.extensions, ...(original as GraphQLError | undefined)?.extensions },
    }
  }
  cms.logger.error(`GraphQL: ${original.stack ?? original.message}`)
  return {
    ...base,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : original.message,
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  }
}

function respond(body: unknown, status: number, request: Request, headers: HeadersInit = {}) {
  // `application/graphql-response+json` when the client asks for it (GraphQL over HTTP).
  const modern = request.headers.get('accept')?.includes('application/graphql-response+json')
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': `${modern ? 'application/graphql-response+json' : 'application/json'}; charset=utf-8`,
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

const requestError = (message: string, request: Request, status = 400) =>
  respond({ errors: [{ message, extensions: { code: 'BAD_REQUEST' } }] }, status, request)

/** Reads a GraphQL request from a GET's query string. */
function fromSearchParams(url: URL): GraphQLRequest | string {
  const query = url.searchParams.get('query')
  if (!query) return 'Send a query: ?query={...}'
  const variables = url.searchParams.get('variables')
  let parsed: unknown = null
  if (variables) {
    try {
      parsed = JSON.parse(variables)
    } catch {
      return 'variables must be JSON'
    }
  }
  return {
    query,
    variables: parsed as Json | null,
    operationName: url.searchParams.get('operationName'),
  }
}

/** Reads a GraphQL request from a POST's JSON body. */
export function fromBody(body: Json): GraphQLRequest | string {
  if (typeof body.query !== 'string' || !body.query) return 'Send { "query": "..." }'
  if (body.variables !== undefined && body.variables !== null && typeof body.variables !== 'object')
    return 'variables must be an object'
  if (
    body.operationName !== undefined &&
    body.operationName !== null &&
    typeof body.operationName !== 'string'
  )
    return 'operationName must be a string'
  return {
    query: body.query,
    variables: (body.variables as Json | null | undefined) ?? null,
    operationName: (body.operationName as string | null | undefined) ?? null,
  }
}

/** Parses, checks and runs one request, for the user. */
export async function runGraphQL(
  cms: EasyCMS,
  user: AuthUser | null,
  input: GraphQLRequest,
  options: RunOptions,
  onlyQueries = false,
  context: RequestContext = {},
): Promise<{ status: number; body: ExecutionResult | Json; allow?: string }> {
  let document: DocumentNode
  try {
    document = parse(input.query)
  } catch (error) {
    return { status: 400, body: { errors: [formatError(error as GraphQLError, cms)] } }
  }
  const rules = [
    ...specifiedRules,
    depthLimit(options.depth),
    ...(options.introspection ? [] : [NoSchemaIntrospectionCustomRule]),
  ]
  const invalid = validate(options.schema, document, rules)
  if (invalid.length > 0)
    return { status: 400, body: { errors: invalid.map((e) => formatError(e, cms)) } }
  if (onlyQueries) {
    const operation = getOperationAST(document, input.operationName ?? undefined)
    if (operation && operation.operation !== 'query')
      return {
        status: 405,
        allow: 'POST',
        body: {
          errors: [
            {
              message: `Send ${operation.operation}s with POST`,
              extensions: { code: 'BAD_REQUEST' },
            },
          ],
        },
      }
  }
  const result = await execute({
    schema: options.schema,
    document,
    variableValues: input.variables ?? undefined,
    operationName: input.operationName ?? undefined,
    contextValue: createContext(cms, user, { documents: options.documents, context }),
  })
  const body: Json = {
    ...(result.errors ? { errors: result.errors.map((e) => formatError(e, cms)) } : {}),
    ...('data' in result ? { data: result.data } : {}),
  }
  // No data at all: the request itself was wrong (e.g. its variables).
  return { status: 'data' in result && result.data !== undefined ? 200 : 400, body }
}

/** A GraphQL over HTTP request: GET (queries, or GraphiQL for browsers) or POST. */
export async function handleGraphQL(
  args: {
    readonly request: Request
    readonly url: URL
    readonly user: AuthUser | null
    readonly context: RequestContext
    readonly cms: EasyCMS
    json(): Promise<Json>
  },
  options: RunOptions,
): Promise<Response> {
  const { request, url, user, cms } = args
  const get = request.method === 'GET' || request.method === 'HEAD'
  if (get && !url.searchParams.has('query')) {
    const browser = request.headers.get('accept')?.includes('text/html')
    if (browser && options.graphiql)
      return new Response(graphiqlPage(), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
  }
  const input = get ? fromSearchParams(url) : fromBody(await args.json())
  if (typeof input === 'string') return requestError(input, request)
  const { status, body, allow } = await runGraphQL(cms, user, input, options, get, args.context)
  return respond(body, status, request, allow ? { allow } : {})
}
