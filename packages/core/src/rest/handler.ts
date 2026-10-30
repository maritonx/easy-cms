import { randomUUID } from 'node:crypto'
import {
  type AuthUser,
  type ID,
  isSystemAdmin,
  type RequestContext,
  type Where,
} from '../access.js'
import { API_KEYS, type ApiKeyPermissions } from '../api-keys.js'
import { auditContext } from '../audit.js'
import { type Session, SIGNUP_HONEYPOT } from '../auth/auth.js'
import { cookieValue, hostCookie, SESSION_COOKIE } from '../auth/cookie.js'
import { passwordFor, SSO_COOKIE } from '../auth/sso.js'
import { safeEqual } from '../auth/tokens.js'
import { deleteBackup, downloadBackup, listBackups, startBackup } from '../backups.js'
import { INTERNAL_COLLECTIONS, MEDIA, USERS } from '../builtins.js'
import { bulkIds, bulkOperations, bulkProgress, cancelBulk, startBulk } from '../bulk.js'
import type { CollectionConfig, Config, GlobalConfig } from '../config.js'
import { warnDeprecated } from '../deprecation.js'
import { parseId } from '../document.js'
import {
  EasyCMSError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  QueryError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../errors.js'
import { type HealthCheck, healthResponse } from '../health.js'
import type { EasyCMS } from '../local-api.js'
import { isJsonLogger } from '../logger.js'
import { EXTENSIONS, PRIVATE_KEY, withCharset } from '../media.js'
import { routeOf } from '../telemetry.js'
import {
  deleteDelivery,
  deleteFailedDeliveries,
  isDeliveryKind,
  listDeliveries,
  retryFailedDeliveries,
} from './admin-deliveries.js'
import { adminEmail, sendTestEmail, verifyEmail } from './admin-email.js'
import { adminJobs, hasJobsPage, retryOutbox, updateJob } from './admin-jobs.js'
import { readAdminModule } from './admin-modules.js'
import { adminSchema } from './admin-schema.js'
import { adminCounts, adminSearch } from './admin-search.js'
import { adminStatus } from './admin-status.js'
import { pickerFilter } from './filter-options.js'
import { cacheableResponse, cacheTags, cacheTimes } from './http-cache.js'
import { parseDepth, parseListQuery } from './query.js'

/** At most this many scheduled publishes in a calendar's range (#272). */
const SCHEDULED_RANGE_LIMIT = 500
/** How far the admin's list totals count: past this they read "10,000+" (#279). */
export const LIST_TOTAL_MAX = 10_000

export { SESSION_COOKIE }
export const CSRF_COOKIE = 'ecms-csrf'
export const CSRF_HEADER = 'x-csrf-token'
const MAX_BODY_BYTES = 1024 * 1024

export interface RestHandlerOptions {
  /** Path the handler is mounted at. Default: `routes.api` from the config (`/api/cms`). */
  readonly basePath?: string
  /** Client IP, used with the email to rate-limit logins. Adapters provide it. */
  readonly getClientIp?: (request: Request) => string | undefined
  /**
   * Behind a reverse proxy you control: its `X-Forwarded-Host` names the public host (for the
   * CSRF check of a request's Origin). Vercel and Netlify are recognized without it.
   */
  readonly trustProxy?: boolean
}

export type RestHandler = (request: Request) => Promise<Response>

class HttpError extends EasyCMSError {}

interface Context {
  readonly request: Request
  readonly url: URL
  readonly user: AuthUser | null
  /** The request's context (`onRequest`). */
  readonly context: RequestContext
  /** How the request authenticated; cookie auth needs CSRF protection. */
  readonly via: 'cookie' | 'bearer' | null
  readonly token: string | undefined
  readonly headers: Headers
  /** `RestHandlerOptions.trustProxy`. */
  readonly trustProxy: boolean
}

/** Creates the REST API as a Web-standard `(Request) => Response` handler. */
export function createRestHandler<C extends Config>(
  instance: EasyCMS<C>,
  options: RestHandlerOptions = {},
): RestHandler {
  // The handler works with any collection by slug, so it uses the untyped API.
  const cms = instance as unknown as EasyCMS
  const basePath = (options.basePath ?? cms.config.routes.api).replace(/\/+$/, '')
  const production = process.env.NODE_ENV === 'production'
  return withCors(cms, (request) => {
    const url = new URL(request.url)
    const inside = url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)
    return respond(
      cms,
      request,
      url,
      inside ? url.pathname.slice(basePath.length) : null,
      false,
      options,
      production,
    )
  })
}

/**
 * Serves the endpoints marked `root: true` (e.g. `/robots.txt`), with the same auth, CSRF and
 * errors as the REST API. Resolves to `undefined` when no root endpoint has the request's path,
 * so a server can go on to its other routes. Nuxt and Next.js apps own their root and don't
 * use it; the standalone server does.
 */
export function createRootEndpointHandler<C extends Config>(
  instance: EasyCMS<C>,
  options: Pick<RestHandlerOptions, 'getClientIp'> = {},
): (request: Request) => Promise<Response | undefined> {
  const cms = instance as unknown as EasyCMS
  const production = process.env.NODE_ENV === 'production'
  const handler = withCors(cms, (request) => {
    const url = new URL(request.url)
    return respond(cms, request, url, url.pathname, true, options, production)
  })
  return async (request) => {
    let segments: string[]
    try {
      segments = pathSegments(new URL(request.url).pathname)
    } catch {
      return undefined // A malformed path is not one of ours.
    }
    const matched = cms.config.endpoints.some((e) => e.root && matchPath(e.path, segments))
    return matched ? handler(request) : undefined
  }
}

function pathSegments(path: string): string[] {
  return path
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s))
}

function withCors(
  cms: EasyCMS,
  handle: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const cors = corsHeaders(cms, request)
    if (request.method.toUpperCase() === 'OPTIONS') {
      // Preflight: answered before auth; the browser then sends the real request.
      return new Response(null, { status: 204, headers: cors })
    }
    return withHeaders(await handle(request), cors)
  }
}

const HEALTH_CHECKS = new Map<string, HealthCheck>([
  ['healthz', 'healthz'],
  ['readyz', 'readyz'],
])

/** An `X-Request-Id` from a proxy is kept when it is plain; else the request gets a new one. */
const REQUEST_ID = /^[\w.-]{1,128}$/

/** One request; with `telemetry`, in a span (`easy-cms GET /api/cms/:collection`). */
function respond(
  cms: EasyCMS,
  request: Request,
  url: URL,
  path: string | null,
  root: boolean,
  options: RestHandlerOptions,
  production: boolean,
): Promise<Response> {
  const run = () => respondLogged(cms, request, url, path, root, options, production)
  // Probes every few seconds would drown the traces too.
  const probe = !root && (path === '/healthz' || path === '/readyz')
  if (!cms.telemetry || probe) return run()
  const route =
    root || path === null ? routeOf(path, root) : `${cms.config.routes.api}${routeOf(path, root)}`
  return cms.telemetry.request(request.method, route, run)
}

/**
 * One request, under its request id: the `X-Request-Id` response header, the `requestId` of every
 * line it logs, and, with a JSON logger, a line when it is done.
 */
async function respondLogged(
  cms: EasyCMS,
  request: Request,
  url: URL,
  path: string | null,
  root: boolean,
  options: RestHandlerOptions,
  production: boolean,
): Promise<Response> {
  const started = performance.now()
  const incoming = request.headers.get('x-request-id')
  const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID()
  const requestLog = { userId: undefined as ID | undefined }
  const response = await auditContext.run({ requestId }, () =>
    respondNow(cms, request, url, path, root, options, production, requestId, requestLog),
  )
  let tagged: Response
  try {
    response.headers.set('x-request-id', requestId)
    tagged = response
  } catch {
    // Immutable headers (a fetched response passed through): copy them.
    tagged = withHeaders(response, new Headers({ 'x-request-id': requestId }))
  }
  // Probes every few seconds would drown the other lines.
  const probe = !root && (path === '/healthz' || path === '/readyz')
  if (!probe && cms.config.logs?.requests !== false && isJsonLogger(cms.logger)) {
    auditContext.run({ requestId }, () =>
      cms.logger.info(`${request.method} ${url.pathname} ${tagged.status}`, {
        method: request.method,
        path: url.pathname,
        status: tagged.status,
        durationMs: Math.round(performance.now() - started),
        ...(requestLog.userId === undefined ? {} : { userId: requestLog.userId }),
      }),
    )
  }
  return tagged
}

/** One request: `path` is the path under the API (or from the root), `null` when outside. */
async function respondNow(
  cms: EasyCMS,
  request: Request,
  url: URL,
  path: string | null,
  root: boolean,
  options: RestHandlerOptions,
  production: boolean,
  requestId: string,
  requestLog: { userId: ID | undefined },
): Promise<Response> {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(production ? { 'strict-transport-security': 'max-age=31536000' } : {}),
  })
  try {
    if (path === null) throw new HttpError('Not found', 404)
    const segments = pathSegments(path)
    // Probes: before auth, so a load balancer needs no credentials and a bad token can't fail them.
    const probe =
      !root && segments.length === 1 ? HEALTH_CHECKS.get(segments[0] as string) : undefined
    if (probe) {
      const method = request.method.toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') {
        headers.set('allow', 'GET, HEAD')
        throw new HttpError('Method not allowed', 405)
      }
      return await healthResponse(probe, cms)
    }
    const { token, via } = readToken(request)
    const signedIn = token ? await cms.auth.verify(token) : null
    // A script sending a bad key should hear so, not get anonymous access.
    if (!signedIn && via === 'bearer' && token?.startsWith('ecms_'))
      throw new UnauthorizedError('Invalid or expired API key')
    // The config's `onRequest` (e.g. a tenant plugin): the context, and the user within it.
    const { user, context } = await cms.applyOnRequest(request.headers, url, signedIn)
    requestLog.userId = user?.id
    const ctx: Context = {
      request,
      url,
      user,
      context,
      via: signedIn ? via : null,
      token,
      headers,
      trustProxy: options.trustProxy === true,
    }

    const method = request.method.toUpperCase()
    // Requests per client (`rateLimit`); a cron running jobs isn't counted.
    const isJobsRun = !root && segments[0] === 'jobs' && segments[1] === 'run'
    const wait = isJobsRun ? undefined : cms.rateLimiter?.hit(user, options.getClientIp?.(request))
    if (wait !== undefined)
      throw new TooManyRequestsError('Too many requests: try again later', wait)
    if (method !== 'GET' && method !== 'HEAD') checkCsrf(cms, ctx)

    // Who and from where, for the audit log of whatever this request changes.
    const audit = {
      user,
      context,
      ip: options.getClientIp?.(request),
      userAgent: request.headers.get('user-agent'),
      requestId,
    }
    const result = await auditContext.run(audit, async () =>
      root
        ? await customEndpoint(cms, ctx, method, segments, true, options)
        : await customOrBuiltIn(cms, ctx, method, segments, options),
    )
    if (!result) throw new HttpError('Not found', 404)
    if (result.body instanceof Response) return result.body
    const body = JSON.stringify(result.body)
    // Public: no user, no session or key (even an expired one), and no drafts asked for.
    const times =
      result.cache && !user && !ctx.via && !ctx.token && !url.searchParams.has('draft')
        ? cacheTimes(cms.config, result.cache.container)
        : null
    if (times && result.cache)
      return cacheableResponse(
        request,
        body,
        result.status ?? 200,
        headers,
        times,
        result.cache.tags,
      )
    return new Response(body, { status: result.status ?? 200, headers })
  } catch (error) {
    return errorResponse(cms, error, headers, production)
  }
}

/** `/auth/<action>`: signing in and out, sign-up and password links. */
export const AUTH_ACTIONS = new Set([
  'login',
  'logout',
  'me',
  'init',
  'signup',
  'verify-email',
  'forgot-password',
  'reset-password',
  'first-register',
])

/** Routes under `/admin/ui/`: what the admin UI alone uses, outside semver. */
const ADMIN_UI_ROUTES = new Set([
  'schema',
  'counts',
  'search',
  'modules',
  'scheduled',
  'access',
  'bulk',
  'total',
  'media-usage',
  'owned',
  'sso',
])

const CORS_METHODS = 'GET, HEAD, POST, PATCH, PUT, DELETE'
const CORS_HEADERS = `authorization, content-type, ${CSRF_HEADER}`

/**
 * CORS headers for the request's origin. Origins in `cors` may make anonymous requests (or send
 * a bearer token); origins in `auth.trustedOrigins` may also send cookies.
 */
function corsHeaders(cms: EasyCMS, request: Request): Headers {
  const headers = new Headers({ vary: 'Origin' })
  const origin = request.headers.get('origin')
  if (!origin) return headers
  const { cors, auth } = cms.config
  const trusted = auth.trustedOrigins.includes(origin)
  if (!trusted && cors !== '*' && !cors.includes(origin)) return headers
  headers.set('access-control-allow-origin', origin)
  if (trusted) headers.set('access-control-allow-credentials', 'true')
  if (request.method.toUpperCase() === 'OPTIONS') {
    headers.set('access-control-allow-methods', CORS_METHODS)
    headers.set('access-control-allow-headers', CORS_HEADERS)
    headers.set('access-control-max-age', '600')
  }
  return headers
}

function withHeaders(response: Response, extra: Headers): Response {
  const headers = new Headers(response.headers)
  extra.forEach((value, key) => {
    if (key === 'vary') headers.append('vary', value)
    else headers.set(key, value)
  })
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

interface Result {
  body: unknown
  status?: number
  /** A read a CDN may cache when it is public (`httpCache`): what it reads, and its tags. */
  cache?: { container: CollectionConfig | GlobalConfig; tags: string[] }
}

/** Runs the config's endpoint matching the request, if any (`endpoints` in the config). */
async function customEndpoint(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  segments: string[],
  root: boolean,
  options: Pick<RestHandlerOptions, 'getClientIp'>,
): Promise<Result | undefined> {
  let pathMatched = false
  const own = cms.config.endpoints.filter((e) => !!e.root === root)
  // A fixed segment beats a parameter: `/stats/summary` wins over `/stats/:collection`.
  const endpoints = [...own].sort((a, b) => fixedSegments(b) - fixedSegments(a))
  for (const endpoint of endpoints) {
    const params = matchPath(endpoint.path, segments)
    if (!params) continue
    pathMatched = true
    // HEAD is answered by GET handlers, without a body.
    const verb = endpoint.method.toUpperCase()
    if (verb !== method && !(verb === 'GET' && method === 'HEAD')) continue
    const body = await endpoint.handler({
      request: ctx.request,
      url: ctx.url,
      params,
      user: ctx.user,
      context: ctx.context,
      ip: options.getClientIp?.(ctx.request),
      cms,
      json: () => readJson(ctx.request),
      text: async () => new TextDecoder().decode(await readBody(ctx.request, MAX_BODY_BYTES)),
    })
    return { body: body === undefined ? null : body }
  }
  if (pathMatched) {
    const allow = own.filter((e) => matchPath(e.path, segments)).map((e) => e.method.toUpperCase())
    const list = [...new Set(allow)].join(', ')
    if (root) throw methodNotAllowed(ctx, list)
    throw new PluginMethodError(list)
  }
  return undefined
}

/**
 * A plugin's endpoint, else the built-in API. A path a plugin answers with other methods falls
 * through to the built-in routes, and is a 405 only when none of them has it either.
 */
async function customOrBuiltIn(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  segments: string[],
  options: RestHandlerOptions,
): Promise<Result | undefined> {
  try {
    return (
      (await customEndpoint(cms, ctx, method, segments, false, options)) ??
      (await route(cms, ctx, method, segments, options))
    )
  } catch (error) {
    if (!(error instanceof PluginMethodError)) throw error
    try {
      return await route(cms, ctx, method, segments, options)
    } catch (builtIn) {
      if (builtIn instanceof HttpError && builtIn.status === 404)
        throw methodNotAllowed(ctx, error.allow)
      throw builtIn
    }
  }
}

/** A plugin answers the path, but not with this method. */
class PluginMethodError extends Error {
  constructor(readonly allow: string) {
    super('Method not allowed')
  }
}

const fixedSegments = (endpoint: { path: string }) =>
  endpoint.path.split('/').filter((s) => s && !s.startsWith(':')).length

/** `{ id: '5' }` for `/stats/:id` and `['stats', '5']`; `undefined` when it does not match. */
function matchPath(path: string, segments: string[]): Record<string, string> | undefined {
  const parts = path.split('/').filter(Boolean)
  if (parts.length !== segments.length) return undefined
  const params: Record<string, string> = {}
  for (const [i, part] of parts.entries()) {
    const segment = segments[i] as string
    if (part.startsWith(':')) params[part.slice(1)] = segment
    else if (part !== segment) return undefined
  }
  return params
}

async function route(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  path: string[],
  options: RestHandlerOptions,
): Promise<Result> {
  // What the admin UI alone uses lives under `/admin/ui/` and may change in any release; those
  // routes aren't served at their old place.
  const ui = path[0] === 'admin' && path[1] === 'ui'
  const segments = ui ? ['admin', ...path.slice(2)] : path
  const [first, second, third] = segments
  if (first === 'admin' && second !== undefined && ADMIN_UI_ROUTES.has(second) !== ui)
    throw new HttpError('Not found', 404)
  const access = {
    overrideAccess: false,
    user: ctx.user,
    context: ctx.context,
    ...parseLocale(ctx.url),
  } as const
  // Drafts are only for logged-in users; anonymous requests always see published documents.
  const draft =
    ctx.user !== null && ctx.user.member !== true && ctx.url.searchParams.get('draft') === 'true'

  if (segments.length === 0) throw new HttpError('Not found', 404)
  // Site members (`auth.members`, e.g. customers) never get into the admin.
  if (first === 'admin' && ctx.user?.member === true) throw new ForbiddenError()

  // Signing in: `/auth/<action>` (`/users/<action>` works too, for clients written before 0.60).
  const authAction =
    third === undefined && second !== undefined
      ? (first === 'auth' && AUTH_ACTIONS.has(second)) || (first === USERS && !/^\d+$/.test(second))
      : false
  // Signing in with outside accounts (`auth.providers`).
  if (first === 'auth' && !authAction) return ssoRoute(cms, ctx, method, segments)

  if (authAction && first === USERS && second !== undefined && AUTH_ACTIONS.has(second))
    warnDeprecated(
      'EASY_CMS_DEP001',
      `${method} <api>/users/${second} is now <api>/auth/${second}; the old path works through 1.x.`,
    )
  // Auth endpoints
  if (authAction && second !== undefined) {
    switch (`${method} ${second}`) {
      case 'POST login': {
        const body = await readJson(ctx.request)
        const session = await cms.auth.login({
          email: String(body.email ?? ''),
          password: String(body.password ?? ''),
          ip: options.getClientIp?.(ctx.request),
        })
        setSessionCookies(cms, ctx, session)
        return {
          body: { user: session.user, exp: session.expiresAt, csrfToken: session.csrfToken },
        }
      }
      case 'POST logout': {
        if (ctx.token) await cms.auth.logout(ctx.token)
        clearSessionCookies(ctx)
        // Pages and API answers the browser may have kept for this user. Not "storage": the site
        // may share the origin and keep its own (a guest's cart).
        ctx.headers.set('clear-site-data', '"cache"')
        return { body: { message: 'Logged out' } }
      }
      case 'GET me': {
        const csrfToken =
          ctx.via === 'cookie' && ctx.token ? cms.auth.csrfFor(ctx.token) : undefined
        if (csrfToken)
          ctx.headers.append('set-cookie', cookie(ctx, CSRF_COOKIE, csrfToken, { httpOnly: false }))
        return {
          body: {
            user: ctx.user,
            // Whether this user may set and use a password (`auth.password`).
            ...(ctx.user ? { password: cms.auth.sso.passwordAllowed(ctx.user) } : {}),
            ...(csrfToken ? { csrfToken } : {}),
          },
        }
      }
      case 'GET init':
        return {
          body: {
            hasUsers: await cms.auth.hasUsers(),
            // The login page offers "Forgot password?" only when the email can be sent.
            passwordReset: cms.auth.canSendPasswordLinks(ctx.url.origin),
            // Buttons to sign in with outside accounts; `password: false`: only some use one
            // (`passwordFor`: admins, or break-glass accounts), behind a folded form.
            providers: cms.auth.sso.providers(),
            password: cms.config.auth.password === true,
            passwordFor: passwordFor(cms.config.auth.password),
            // The first admin needs the setup code (`EASY_CMS_SETUP_CODE`).
            setupCode: cms.config.auth.setupCode !== '',
          },
        }
      // Forgot password: the same answer whether or not the email has an account.
      case 'POST forgot-password': {
        const body = await readJson(ctx.request)
        await cms.auth.requestPasswordReset({
          email: String(body.email ?? ''),
          ip: options.getClientIp?.(ctx.request),
          origin: ctx.url.origin,
          locale: typeof body.locale === 'string' ? body.locale : undefined,
        })
        return { body: { message: 'If an account has this email, a link is on its way.' } }
      }
      // The page behind a password link: which account, and whether the link still works.
      case 'GET reset-password': {
        const found = await cms.auth.checkPasswordToken(ctx.url.searchParams.get('token') ?? '')
        if (!found)
          throw new ValidationError(USERS, [
            { field: 'token', message: 'This link has expired or was already used' },
          ])
        return { body: { email: found.user.email, purpose: found.purpose } }
      }
      case 'POST reset-password': {
        const body = await readJson(ctx.request)
        const session = await cms.auth.resetPassword({
          token: String(body.token ?? ''),
          password: String(body.password ?? ''),
          ip: options.getClientIp?.(ctx.request),
          locale: typeof body.locale === 'string' ? body.locale : undefined,
        })
        setSessionCookies(cms, ctx, session)
        return {
          body: { user: session.user, exp: session.expiresAt, csrfToken: session.csrfToken },
        }
      }
      // Members signing up (`auth.members.signUp`): the form's token, then the account.
      case 'GET signup':
        return { body: cms.auth.signupForm() }
      case 'POST signup': {
        const body = await readJson(ctx.request)
        const result = await cms.auth.signup({
          email: String(body.email ?? ''),
          password: String(body.password ?? ''),
          name: typeof body.name === 'string' ? body.name : undefined,
          token: body.token,
          honeypot: body[SIGNUP_HONEYPOT],
          turnstile: body.turnstile,
          ip: options.getClientIp?.(ctx.request),
          origin: ctx.url.origin,
          locale: typeof body.locale === 'string' ? body.locale : undefined,
          context: ctx.context,
        })
        if (result.verify)
          return {
            status: 202,
            body: { verify: true, message: 'Check your email for a link to confirm it.' },
          }
        setSessionCookies(cms, ctx, result)
        // Every call that starts a session answers 200 with it.
        return { body: { user: result.user, exp: result.expiresAt, csrfToken: result.csrfToken } }
      }
      case 'POST verify-email': {
        const body = await readJson(ctx.request)
        const session = await cms.auth.verifyEmail({
          token: String(body.token ?? ''),
          ip: options.getClientIp?.(ctx.request),
        })
        setSessionCookies(cms, ctx, session)
        return {
          body: { user: session.user, exp: session.expiresAt, csrfToken: session.csrfToken },
        }
      }
      case 'POST first-register': {
        const body = await readJson(ctx.request)
        const session = await cms.auth.registerFirstUser({
          email: String(body.email ?? ''),
          password: String(body.password ?? ''),
          ...(typeof body.name === 'string' ? { name: body.name } : {}),
          ...(typeof body.setupCode === 'string' ? { setupCode: body.setupCode } : {}),
          ip: options.getClientIp?.(ctx.request),
        })
        setSessionCookies(cms, ctx, session)
        return {
          body: { user: session.user, exp: session.expiresAt, csrfToken: session.csrfToken },
        }
      }
    }
    throw new HttpError('Not found', 404)
  }

  // Scheduled jobs and webhook retries, run by a cron service (Authorization: Bearer
  // <cronSecret>) or an admin.
  if (first === 'jobs' && second === 'run' && third === undefined) {
    if (method !== 'GET' && method !== 'POST') throw methodNotAllowed(ctx, 'GET, POST')
    const secret = cms.config.cronSecret ?? process.env.CRON_SECRET
    const header = ctx.request.headers.get('authorization') ?? ''
    const byCron = !!secret && safeEqual(header, `Bearer ${secret}`)
    if (!byCron && !isSystemAdmin(ctx.user)) {
      throw ctx.user ? new HttpError('Forbidden', 403) : new UnauthorizedError()
    }
    // With the session cookie, only POST: it has the CSRF checks, and a link can't run jobs.
    if (!byCron && ctx.via === 'cookie' && method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    return { body: await cms.runJobs() }
  }

  // Settings → Backups, for admins: list, back up now, download, delete.
  if (first === 'admin' && second === 'backups') {
    if (!ctx.user) throw new UnauthorizedError()
    if (!isSystemAdmin(ctx.user)) throw new ForbiddenError()
    const [, , id, action, extra] = segments
    if (extra !== undefined) throw new HttpError('Not found', 404)
    if (id === undefined) {
      if (method === 'GET') return { body: await listBackups(cms) }
      if (method === 'POST') {
        const started = await startBackup(cms, 'manual', ctx.user.email)
        await cms.audit.record({ action: 'backup.start', target: 'backups', doc: started.id })
        return { status: 202, body: started }
      }
      throw methodNotAllowed(ctx, 'GET, POST')
    }
    const parsed = parseId(id)
    if (parsed === undefined) throw new HttpError('Not found', 404)
    if (action === 'download') {
      if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
      const file = await downloadBackup(cms, parsed, ctx.user.email)
      await cms.audit.record({
        action: 'backup.download',
        target: 'backups',
        doc: parsed,
        title: file.filename,
      })
      return {
        body: new Response(file.body as Uint8Array<ArrayBuffer>, {
          headers: {
            'content-type': 'application/gzip',
            'content-disposition': `attachment; filename="${file.filename}"`,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        }),
      }
    }
    if (action !== undefined) throw new HttpError('Not found', 404)
    if (method !== 'DELETE') throw methodNotAllowed(ctx, 'DELETE')
    await deleteBackup(cms, parsed)
    await cms.audit.record({ action: 'backup.delete', target: 'backups', doc: parsed })
    return { body: { deleted: 1 } }
  }

  // Settings → Email, for admins: the adapter's settings, a connection check and a test email.
  if (first === 'admin' && second === 'email') {
    if (!ctx.user) throw new UnauthorizedError()
    if (!isSystemAdmin(ctx.user)) throw new ForbiddenError()
    const [, , action, extra] = segments
    if (extra !== undefined) throw new HttpError('Not found', 404)
    if (action === undefined) {
      if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
      return { body: adminEmail(cms) }
    }
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    if (action === 'verify') return { body: await verifyEmail(cms) }
    if (action === 'test') {
      const body = await readJson(ctx.request)
      const sent = await sendTestEmail(cms, ctx.user, body.to, body.locale)
      await cms.audit.record({ action: 'email.test', target: 'email', detail: { ...sent } })
      return { body: sent }
    }
    throw new HttpError('Not found', 404)
  }

  // Settings → SSO, for admins: the providers, their callback URLs, who may use a password.
  if (first === 'admin' && second === 'sso' && third === undefined) {
    if (!ctx.user) throw new UnauthorizedError()
    if (!isSystemAdmin(ctx.user)) throw new ForbiddenError()
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    return { body: cms.auth.sso.settings(ctx.url.origin) }
  }

  // Settings → Audit log (`audit`), for admins and roles given it: entries, CSV, the check.
  if (first === 'admin' && (second === 'audit' || second === 'audit.csv')) {
    if (!ctx.user) throw new UnauthorizedError()
    if (!cms.audit.enabled) throw new HttpError('Not found', 404)
    if (!(await cms.roles.canView(ctx.user, 'audit'))) throw new ForbiddenError()
    const q = ctx.url.searchParams
    const filter = {
      action: q.get('action'),
      target: q.get('target'),
      doc: q.get('doc'),
      actor: q.get('actor'),
      from: q.get('from'),
      to: q.get('to'),
      // Users of a part of the site (e.g. one tenant) see its entries; others the chosen part's.
      scope: cms.audit.scopeOf(ctx.context, ctx.user),
    }
    if (ctx.user.scoped && !filter.scope) throw new ForbiddenError()
    if (second === 'audit.csv' && third === undefined) {
      if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
      return {
        body: new Response(await cms.audit.csv(filter), {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        }),
      }
    }
    if (second === 'audit' && third === 'verify' && segments.length === 3) {
      if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
      // The check covers every part of the site: for admins of the whole system only.
      if (!isSystemAdmin(ctx.user)) throw new ForbiddenError()
      return { body: await cms.audit.verify() }
    }
    if (second !== 'audit' || third !== undefined) throw new HttpError('Not found', 404)
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const { page, limit } = pageQuery(q)
    return { body: await cms.audit.list({ ...filter, page, limit }) }
  }

  // What a user owns, by collection (`auth.rbac`), for admins about to delete them.
  if (first === 'admin' && second === 'owned' && third !== undefined && segments.length === 3) {
    if (!ctx.user) throw new UnauthorizedError()
    if (!isSystemAdmin(ctx.user)) throw new ForbiddenError()
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const parsed = parseId(third)
    if (parsed === undefined) throw new HttpError('Not found', 404)
    return { body: await cms.roles.owned(parsed) }
  }

  // How many documents use these files (`?ids=1,2`), before they move to or from a private folder.
  if (first === 'admin' && second === 'media-usage' && segments.length === 2) {
    if (!ctx.user || ctx.user.apiKey) throw new UnauthorizedError()
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const ids = (ctx.url.searchParams.get('ids') ?? '')
      .split(',')
      .map((id) => parseId(id))
      .filter((id) => id !== undefined)
    const count = await cms.mediaUsage(ids, {
      overrideAccess: false,
      user: ctx.user,
      context: ctx.context,
    })
    return { body: { count } }
  }

  // Settings → Roles (`auth.rbac`), for admins: the roles, add, change, delete, history.
  if (first === 'admin' && second === 'roles') {
    if (!ctx.user) throw new UnauthorizedError()
    if (!isSystemAdmin(ctx.user)) throw new ForbiddenError()
    if (!cms.roles.enabled) throw new HttpError('Not found', 404)
    const [, , id, action, extra] = segments
    if (extra !== undefined) throw new HttpError('Not found', 404)
    if (id === undefined) {
      if (method === 'GET') return { body: await cms.roles.list() }
      if (method === 'POST')
        return { status: 201, body: await cms.roles.create(await readJson(ctx.request), ctx.user) }
      throw methodNotAllowed(ctx, 'GET, POST')
    }
    const parsed = parseId(id)
    if (parsed === undefined) throw new HttpError('Not found', 404)
    if (action === 'history') {
      if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
      return { body: await cms.roles.history(parsed) }
    }
    if (action !== undefined) throw new HttpError('Not found', 404)
    if (method === 'PATCH')
      return { body: await cms.roles.update(parsed, await readJson(ctx.request), ctx.user) }
    if (method === 'DELETE') {
      await cms.roles.delete(parsed)
      return { body: { deleted: 1 } }
    }
    throw methodNotAllowed(ctx, 'PATCH, DELETE')
  }

  // Saved webhook deliveries and emails, for admins and roles given them: list, retry, delete.
  if (first === 'admin' && second === 'deliveries') {
    if (!ctx.user) throw new UnauthorizedError()
    if (!(await cms.roles.canView(ctx.user, 'deliveries'))) throw new ForbiddenError()
    const [, , kind, id, action, extra] = segments
    if (kind === undefined) {
      if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
      const k = ctx.url.searchParams.get('kind') ?? 'webhook'
      const state = ctx.url.searchParams.get('state') === 'pending' ? 'pending' : 'failed'
      if (!isDeliveryKind(k)) throw new HttpError('kind must be webhook or email', 400)
      const { page, limit } = pageQuery(ctx.url.searchParams)
      return { body: await listDeliveries(cms, k, state, page, limit) }
    }
    if (!isDeliveryKind(kind) || extra !== undefined) throw new HttpError('Not found', 404)
    // /admin/deliveries/:kind/retry and DELETE /admin/deliveries/:kind → every failed one
    if (id === 'retry' && action === undefined) {
      if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
      const retried = await retryFailedDeliveries(cms, kind)
      await cms.audit.record({
        action: 'delivery.retry',
        target: 'deliveries',
        detail: { kind, all: true },
      })
      return { body: retried }
    }
    if (id === undefined) {
      if (method !== 'DELETE') throw methodNotAllowed(ctx, 'DELETE')
      const deleted = await deleteFailedDeliveries(cms, kind)
      await cms.audit.record({
        action: 'delivery.delete',
        target: 'deliveries',
        detail: { kind, all: true },
      })
      return { body: deleted }
    }
    const parsed = parseId(id)
    if (parsed === undefined) throw new HttpError('Not found', 404)
    if (action === 'retry') {
      if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
      const retried = await cms.retryDelivery(kind, parsed)
      await cms.audit.record({
        action: 'delivery.retry',
        target: 'deliveries',
        doc: parsed,
        detail: { kind },
      })
      return { body: retried }
    }
    if (action !== undefined) throw new HttpError('Not found', 404)
    if (method !== 'DELETE') throw methodNotAllowed(ctx, 'DELETE')
    await deleteDelivery(cms, kind, parsed)
    await cms.audit.record({
      action: 'delivery.delete',
      target: 'deliveries',
      doc: parsed,
      detail: { kind },
    })
    return { body: { deleted: 1 } }
  }

  // Settings → Jobs, for admins and roles given it: the config's jobs and the scheduled queue,
  // and running what is due (claimed like any other run, so it never doubles one).
  if (first === 'admin' && second === 'jobs') {
    if (!ctx.user) throw new UnauthorizedError()
    if (!hasJobsPage(cms.config)) throw new HttpError('Not found', 404)
    if (!(await cms.roles.canView(ctx.user, 'jobs'))) throw new ForbiddenError()
    if (third === undefined && segments.length === 2) {
      if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
      return { body: await adminJobs(cms, ctx.user) }
    }
    if (third === 'run' && segments.length === 3) {
      if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
      const result = await cms.runJobs()
      await cms.audit.record({ action: 'jobs.run', target: 'jobs', detail: result })
      return { body: result }
    }
    // /admin/jobs/outbox/:id: retry a failed outbox entry (admins of the whole system).
    if (third === 'outbox' && segments.length === 4) {
      if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
      const id = segments[3] as string
      await retryOutbox(cms, ctx.user, id)
      await cms.audit.record({ action: 'jobs.outbox.retry', target: 'jobs', detail: { id } })
      return { body: await adminJobs(cms, ctx.user) }
    }
    // /admin/jobs/:name: pause or resume it, or set its schedule (admins of the whole system).
    if (third !== undefined && segments.length === 3) {
      if (method !== 'PATCH') throw methodNotAllowed(ctx, 'PATCH')
      const { action, detail } = await updateJob(
        cms,
        ctx.user,
        decodeURIComponent(third),
        await readJson(ctx.request),
      )
      await cms.audit.record({ action, target: 'jobs', detail })
      return { body: await adminJobs(cms, ctx.user) }
    }
    throw new HttpError('Not found', 404)
  }

  // Admin UI metadata
  if (first === 'admin') {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    if (!ctx.user) throw new UnauthorizedError()
    if (second === 'schema' && third === undefined)
      return { body: await adminSchema(cms, ctx.user, ctx.url.origin, ctx.context) }
    // /admin/ui/counts → the menu's numbers; /admin/ui/search?q= → the command palette's documents
    if (second === 'counts' && third === undefined)
      return { body: await adminCounts(cms, { user: ctx.user, context: ctx.context }) }
    if (second === 'search' && third === undefined)
      return {
        body: {
          docs: await adminSearch(
            cms,
            { user: ctx.user, context: ctx.context },
            ctx.url.searchParams.get('q') ?? '',
          ),
        },
      }
    // /admin/ui/modules/:n.js → an admin module's code (`admin.modules`)
    if (second === 'modules' && third !== undefined && segments.length === 3) {
      const index = /^(\d+)\.js$/.exec(third)?.[1]
      const file = index === undefined ? undefined : await readAdminModule(cms, Number(index))
      if (!file) throw new HttpError('Not found', 404)
      const headers = {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'private, no-cache',
        etag: file.etag,
        'x-content-type-options': 'nosniff',
      }
      if (ctx.request.headers.get('if-none-match') === file.etag)
        return { body: new Response(null, { status: 304, headers }) }
      return { body: new Response(file.body, { headers }) }
    }
    // /admin/status → the system and what needs attention (dashboard: admins, roles given it)
    if (second === 'status' && third === undefined) {
      if (!(await cms.roles.canView(ctx.user, 'status'))) throw new ForbiddenError()
      return { body: await adminStatus(cms) }
    }
    // /admin/ui/scheduled → the next scheduled publishes the user may manage (dashboard);
    // with ?from=&to= (ISO moments), those in that range, for the Calendar page (#272);
    // with ?collection=(&docs=), those of a list page or its Scheduled filter (#303)
    if (second === 'scheduled' && third === undefined) {
      const moment = (name: string) => {
        const value = ctx.url.searchParams.get(name)
        if (value === null) return undefined
        if (Number.isNaN(Date.parse(value)))
          throw new HttpError(`${name} must be an ISO date and time`, 400)
        return new Date(value).toISOString()
      }
      const from = moment('from')
      const to = moment('to')
      // ?collection=posts&docs=1,2,3 → the jobs of a list page (#303)
      const collection = ctx.url.searchParams.get('collection') ?? undefined
      const docs = ctx.url.searchParams.get('docs')?.split(',').filter(Boolean)
      if (docs && docs.length > SCHEDULED_RANGE_LIMIT)
        throw new HttpError(`docs: at most ${SCHEDULED_RANGE_LIMIT}`, 400)
      const ranged = from !== undefined || to !== undefined || collection !== undefined
      return {
        body: await cms.upcomingSchedules({
          user: ctx.user,
          context: ctx.context,
          overrideAccess: false,
          ...(from !== undefined ? { from } : {}),
          ...(to !== undefined ? { to } : {}),
          ...(collection !== undefined ? { collection } : {}),
          ...(docs !== undefined ? { docs } : {}),
          ...(ranged ? { limit: SCHEDULED_RANGE_LIMIT } : {}),
        }),
      }
    }
    // /admin/ui/total/:collection?where…&draft= → a list's total, counted up to LIST_TOTAL_MAX,
    // loaded after its rows (#279)
    if (second === 'total' && third !== undefined && segments.length === 3) {
      if (
        INTERNAL_COLLECTIONS.has(third) ||
        !cms.config.collections.some((c) => c.slug === third)
      ) {
        throw new HttpError(`Unknown collection "${third}"`, 404)
      }
      const { where } = parseListQuery(ctx.url)
      const total = await cms.count(third, {
        ...access,
        ...(where ? { where } : {}),
        draft,
        max: LIST_TOTAL_MAX,
      })
      return {
        body: { total: Math.min(total, LIST_TOTAL_MAX), more: total > LIST_TOTAL_MAX },
      }
    }
    // /admin/ui/bulk → the user's bulk actions, running and recent (#280)
    if (second === 'bulk' && third === undefined)
      return { body: { docs: await bulkOperations(cms, ctx.user) } }
    // /admin/ui/access/:collection/:id → what the user may do with that document
    const [, , collection, id, extra] = segments
    if (second === 'access' && collection && id && extra === undefined) {
      if (
        INTERNAL_COLLECTIONS.has(collection) ||
        !cms.config.collections.some((c) => c.slug === collection)
      ) {
        throw new HttpError(`Unknown collection "${collection}"`, 404)
      }
      return { body: await cms.documentPermissions(collection, id, ctx.user, ctx.context) }
    }
    throw new HttpError('Not found', 404)
  }

  // Globals
  if (first === 'globals') {
    if (!second) throw new HttpError('Not found', 404)
    if (!cms.config.globals.some((g) => g.slug === second))
      throw new HttpError(`Unknown global "${second}"`, 404)
    if (third !== undefined) return globalAction(cms, ctx, method, second, segments.slice(2))
    if (method === 'GET') {
      if (ctx.url.searchParams.has('preview')) {
        const as = await requirePreview(cms, ctx, { global: second })
        return {
          body: await cms.findGlobal(second, {
            ...as,
            ...parseDepth(ctx.url),
            ...parseLocale(ctx.url),
            draft: true,
          }),
        }
      }
      const global = cms.config.globals.find((g) => g.slug === second) as GlobalConfig
      return {
        body: await cms.findGlobal(second, { ...access, ...parseDepth(ctx.url), draft }),
        cache: { container: global, tags: cacheTags.global(second) },
      }
    }
    // PATCH, as for documents; POST as well, as before 0.60.
    if (method === 'PATCH' || method === 'POST') {
      if (method === 'POST')
        warnDeprecated('EASY_CMS_DEP002', 'Globals are updated with PATCH; POST works through 1.x.')
      const body = await readJson(ctx.request)
      return { body: await cms.updateGlobal(second, body, { ...access, ...parseDepth(ctx.url) }) }
    }
    throw methodNotAllowed(ctx, 'GET, PATCH')
  }

  // Media files are public and immutable (their names are unique).
  if (first === MEDIA && second === 'file' && third !== undefined && segments.length === 3) {
    if (method !== 'GET' && method !== 'HEAD') throw methodNotAllowed(ctx, 'GET, HEAD')
    return { body: await serveFile(cms, third, method === 'HEAD') }
  }
  // Files in private folders: for users who may see the file, or with a signed link.
  if (first === MEDIA && second === 'private' && third !== undefined && segments.length === 3) {
    if (method !== 'GET' && method !== 'HEAD') throw methodNotAllowed(ctx, 'GET, HEAD')
    return { body: await servePrivateFile(cms, ctx, third, method === 'HEAD') }
  }
  // Large files straight to the storage: a ticket and where to send the file, then complete.
  if (first === MEDIA && second === 'uploads' && segments.length <= 3) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    const body = await readJson(ctx.request)
    if (third === 'complete' && segments.length === 3) {
      if (typeof body.ticket !== 'string' || body.ticket === '')
        throw new ValidationError(MEDIA, [{ field: 'ticket', message: 'is required' }])
      return {
        status: 201,
        body: await cms.completeUpload(body.ticket, { ...access, ...parseDepth(ctx.url) }),
      }
    }
    if (third !== undefined) throw new HttpError('Not found', 404)
    const { name, size, type, ...data } = body
    if (typeof name !== 'string' || name === '')
      throw new ValidationError(MEDIA, [{ field: 'name', message: 'is required' }])
    return {
      status: 201,
      body: await cms.createUpload(
        { name, size: Number(size), ...(typeof type === 'string' ? { type } : {}) },
        data,
        access,
      ),
    }
  }
  if (first === MEDIA && second === undefined && method === 'POST') {
    // `{ url, ...data }` as JSON: the server downloads the file (upload.fromURL).
    if (
      (ctx.request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')
    ) {
      const { url, ...data } = await readJson(ctx.request)
      if (typeof url !== 'string' || url === '')
        throw new ValidationError(MEDIA, [{ field: 'url', message: 'is required' }])
      return {
        status: 201,
        body: await cms.uploadFromURL(url, data, { ...access, ...parseDepth(ctx.url) }),
      }
    }
    const { file, data } = await readUpload(ctx.request, cms.config.upload.maxFileSize)
    return {
      status: 201,
      body: await cms.upload(file, data, { ...access, ...parseDepth(ctx.url) }),
    }
  }

  // API keys are created with a generated secret, returned only in this response.
  if (first === API_KEYS && second === undefined && method === 'POST') {
    const body = await readJson(ctx.request)
    const { key, doc } = await cms.createApiKey(
      {
        name: typeof body.name === 'string' ? body.name : '',
        ...(body.permissions !== undefined
          ? { permissions: body.permissions as ApiKeyPermissions }
          : {}),
        ...(typeof body.expiresAt === 'string' ? { expiresAt: body.expiresAt } : {}),
      },
      access,
    )
    return { status: 201, body: { ...doc, key } }
  }

  // Search with the config's `search` adapter: `GET <api>/search?q=&collections=&locale=`
  if (first === 'search' && second === undefined && cms.config.search) {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const q = ctx.url.searchParams
    const collections = q.get('collections')
    return {
      body: await cms.search(q.get('q') ?? '', {
        ...access,
        ...parseDepth(ctx.url),
        ...pageQuery(q, 10),
        ...(collections ? { collections: collections.split(',').filter(Boolean) } : {}),
      }),
    }
  }

  // Collections
  const collection = first as string
  if (
    INTERNAL_COLLECTIONS.has(collection) ||
    !cms.config.collections.some((c) => c.slug === collection)
  ) {
    throw new HttpError(`Unknown collection "${collection}"`, 404)
  }
  // Bulk actions (#280): POST /:collection/bulk { action, ids | where, folder?, transferTo? };
  // GET /:collection/bulk/:id (progress), POST /:collection/bulk/:id/cancel
  if (second === 'bulk') return bulkRoute(cms, ctx, method, collection, segments.slice(2), access)
  if (second !== undefined && third !== undefined) {
    return documentAction(cms, ctx, method, collection, second, segments.slice(2))
  }
  // Live preview of a document that is not saved yet.
  if (second === 'preview') {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    const body = await readJson(ctx.request)
    return {
      body: await cms.preview(collection, null, body, { ...access, ...parseDepth(ctx.url) }),
    }
  }

  if (second === undefined) {
    if (method === 'GET') {
      const { page, ...query } = parseListQuery(ctx.url)
      const filter = await pickerFilter(cms, ctx.url, collection, ctx.user, ctx.context)
      if (filter) query.where = query.where ? { and: [query.where, filter] } : filter
      // `maxPage` keeps API clients off deep pages, which the database reads row by row; the
      // admin (signed in with its cookie) keeps its page numbers.
      const { maxPage } = cms.config
      if (maxPage !== undefined && ctx.via !== 'cookie' && page > maxPage)
        throw new QueryError(`page can be at most ${maxPage}: use cursor to go further`)
      const options = { ...access, ...query, draft }
      return {
        body: await cms.find(
          collection,
          query.cursor === undefined ? { ...options, page } : options,
        ),
        cache: { container: cms.collection(collection), tags: cacheTags.collection(collection) },
      }
    }
    if (method === 'POST') {
      const body = await readJson(ctx.request)
      return {
        status: 201,
        body: await cms.create(collection, body, { ...access, ...parseDepth(ctx.url) }),
      }
    }
    throw methodNotAllowed(ctx, 'GET, POST')
  }

  const id = second
  if (method === 'GET' && ctx.url.searchParams.has('preview')) {
    // A preview token opens this one document's current draft, without a login.
    const as = await requirePreview(cms, ctx, { collection, id })
    const doc = await cms.findById(collection, id, {
      ...as,
      ...parseDepth(ctx.url),
      ...parseLocale(ctx.url),
      draft: true,
    })
    if (!doc) throw new NotFoundError(collection, id)
    return { body: doc }
  }
  if (method === 'GET') {
    const doc = await cms.findById(collection, id, { ...access, ...parseDepth(ctx.url), draft })
    if (!doc) throw new NotFoundError(collection, id)
    return {
      body: doc,
      cache: {
        container: cms.collection(collection),
        tags: cacheTags.document(collection, doc.id),
      },
    }
  }
  if (method === 'PATCH') {
    const body = await readJson(ctx.request)
    const doc = await cms.update(collection, id, body, { ...access, ...parseDepth(ctx.url) })
    // Changing your own password ends every session; start a fresh one for this browser.
    if (
      collection === USERS &&
      body.password &&
      ctx.user &&
      String(ctx.user.id) === String(doc.id) &&
      ctx.via === 'cookie'
    ) {
      setSessionCookies(cms, ctx, await cms.auth.createSession(doc.id))
    }
    return { body: doc }
  }
  if (method === 'DELETE') {
    // Deleting a user: `?transferTo=<id>` gives their documents to another user, `none` to nobody.
    const to = collection === USERS ? ctx.url.searchParams.get('transferTo') : null
    const transferTo = to === null ? {} : { transferTo: to === 'none' ? null : (parseId(to) ?? to) }
    return { body: await cms.delete(collection, id, { ...access, ...transferTo }) }
  }
  throw methodNotAllowed(ctx, 'GET, PATCH, DELETE')
}

/**
 * `/:collection/:id/…`: versions (`versions`, `versions/:v`, `versions/:v/restore`), `unpublish`
 * and `discard-draft`.
 */
async function documentAction(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  collection: string,
  id: string,
  path: string[],
): Promise<Result> {
  const access = {
    overrideAccess: false,
    user: ctx.user,
    context: ctx.context,
    ...parseLocale(ctx.url),
  } as const
  const depth = parseDepth(ctx.url)
  const [action, versionId, extra] = path
  // An admin emails a user a link to set their password (an invitation, or a reset).
  if (collection === USERS && action === 'password-link' && path.length === 1) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    if (!isSystemAdmin(ctx.user)) throw new ForbiddenError()
    const body = await readJson(ctx.request).catch(() => ({}) as Record<string, unknown>)
    const sent = await cms.auth.sendPasswordLink(/^\d+$/.test(id) ? Number(id) : id, {
      origin: ctx.url.origin,
      locale: typeof body.locale === 'string' ? body.locale : undefined,
    })
    return { body: { sent } }
  }
  if (action === 'versions' && versionId === undefined) {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    return { body: await cms.findVersions(collection, id, { ...access, ...parsePage(ctx.url) }) }
  }
  if (action === 'versions' && versionId !== undefined && extra === undefined) {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const version = await cms.findVersion(collection, id, versionId, { ...access, ...depth })
    if (!version) throw new NotFoundError(`${collection} version`, versionId)
    return { body: version }
  }
  if (
    action === 'versions' &&
    versionId !== undefined &&
    extra === 'restore' &&
    path.length === 3
  ) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    return { body: await cms.restoreVersion(collection, id, versionId, { ...access, ...depth }) }
  }
  if (action === 'schedule' && path.length <= 2) {
    if (path.length === 2) {
      if (method !== 'DELETE') throw methodNotAllowed(ctx, 'DELETE')
      await cms.cancelSchedule(collection, id, versionId as string, access)
      return { body: { deleted: 1 } }
    }
    if (method === 'GET') return { body: await cms.findSchedule(collection, id, access) }
    if (method !== 'POST') throw methodNotAllowed(ctx, 'GET, POST')
    const body = await readJson(ctx.request)
    return {
      status: 201,
      body: await cms.schedule(collection, id, scheduleJob(body), access),
    }
  }
  if (path.length === 1 && action === 'preview') {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    const body = await readJson(ctx.request)
    const result = await cms.preview(collection, id, body, { ...access, ...depth })
    const token = cms.createPreviewToken({ collection, id }, { user: ctx.user })
    return { body: { ...result, url: result.url && withPreviewToken(result.url, token) } }
  }
  if (path.length === 1 && (action === 'unpublish' || action === 'discard-draft')) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    const options = { ...access, ...depth }
    return {
      body:
        action === 'unpublish'
          ? await cms.unpublish(collection, id, options)
          : await cms.discardDraft(collection, id, options),
    }
  }
  throw new HttpError('Not found', 404)
}

/** `/:collection/bulk…`: an action on named documents now, or on a list's matches in the background. */
async function bulkRoute(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  collection: string,
  path: string[],
  access: { context?: RequestContext },
) {
  const user = ctx.user
  if (!user) throw new UnauthorizedError()
  const [raw, action, extra] = path
  if (raw === undefined) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    const body = (await readJson(ctx.request)) as Record<string, unknown>
    const options = {
      user,
      ...(access.context ? { context: access.context } : {}),
      ...(body.folder !== undefined ? { folder: body.folder as ID | null } : {}),
      ...(body.transferTo !== undefined ? { transferTo: body.transferTo as ID | null } : {}),
    }
    const name = String(body.action ?? '')
    if (Array.isArray(body.ids))
      return { body: await bulkIds(cms, collection, name, body.ids as ID[], options) }
    const where = body.where
    if (
      where !== undefined &&
      (typeof where !== 'object' || where === null || Array.isArray(where))
    )
      throw new QueryError('where must be an object')
    return {
      status: 202,
      body: await startBulk(cms, collection, name, where as Where | undefined, options),
    }
  }
  const id = parseId(raw)
  if (id === undefined) throw new HttpError('Not found', 404)
  if (action === undefined) {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    return { body: await bulkProgress(cms, id, user) }
  }
  if (action === 'cancel' && extra === undefined) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    return { body: await cancelBulk(cms, id, user) }
  }
  throw new HttpError('Not found', 404)
}

/** `/globals/:slug/…`: the same actions as `documentAction`, for a global. */
async function globalAction(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  slug: string,
  path: string[],
): Promise<Result> {
  const access = {
    overrideAccess: false,
    user: ctx.user,
    context: ctx.context,
    ...parseLocale(ctx.url),
  } as const
  const depth = parseDepth(ctx.url)
  const [action, versionId, extra] = path
  if (action === 'versions' && versionId === undefined) {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    return { body: await cms.findGlobalVersions(slug, { ...access, ...parsePage(ctx.url) }) }
  }
  if (action === 'versions' && versionId !== undefined && extra === undefined) {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const version = await cms.findGlobalVersion(slug, versionId, { ...access, ...depth })
    if (!version) throw new NotFoundError(`${slug} version`, versionId)
    return { body: version }
  }
  if (
    action === 'versions' &&
    versionId !== undefined &&
    extra === 'restore' &&
    path.length === 3
  ) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    return { body: await cms.restoreGlobalVersion(slug, versionId, { ...access, ...depth }) }
  }
  if (action === 'schedule' && path.length <= 2) {
    if (path.length === 2) {
      if (method !== 'DELETE') throw methodNotAllowed(ctx, 'DELETE')
      await cms.cancelGlobalSchedule(slug, versionId as string, access)
      return { body: { deleted: 1 } }
    }
    if (method === 'GET') return { body: await cms.findGlobalSchedule(slug, access) }
    if (method !== 'POST') throw methodNotAllowed(ctx, 'GET, POST')
    const body = await readJson(ctx.request)
    return { status: 201, body: await cms.scheduleGlobal(slug, scheduleJob(body), access) }
  }
  if (path.length === 1 && action === 'preview') {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    const body = await readJson(ctx.request)
    const result = await cms.previewGlobal(slug, body, { ...access, ...depth })
    const token = cms.createPreviewToken({ global: slug }, { user: ctx.user })
    return { body: { ...result, url: result.url && withPreviewToken(result.url, token) } }
  }
  if (path.length === 1 && (action === 'unpublish' || action === 'discard-draft')) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    const options = { ...access, ...depth }
    return {
      body:
        action === 'unpublish'
          ? await cms.unpublishGlobal(slug, options)
          : await cms.discardGlobalDraft(slug, options),
    }
  }
  throw new HttpError('Not found', 404)
}

/** `{ action, at }` from a request body; the Local API validates the values. */
function scheduleJob(body: Record<string, unknown>) {
  return {
    action: body.action as 'publish' | 'unpublish',
    at: typeof body.at === 'string' ? body.at : '',
  }
}

/** `?locale=` (a content locale or `all`) and `?fallbackLocale=false` (or `fallback-locale`). */
function parseLocale(url: URL): { locale?: string; fallbackLocale?: boolean } {
  const locale = url.searchParams.get('locale')
  const old = url.searchParams.get('fallback-locale')
  if (old !== null)
    warnDeprecated(
      'EASY_CMS_DEP003',
      '?fallback-locale= is now ?fallbackLocale=; the old name works through 1.x.',
    )
  const fallback = url.searchParams.get('fallbackLocale') ?? old
  return {
    ...(locale ? { locale } : {}),
    ...(fallback === 'false' || fallback === 'true' ? { fallbackLocale: fallback === 'true' } : {}),
  }
}

/** Query parameter the admin adds to preview URLs; pages pass it on as `?preview=`. */
export const PREVIEW_PARAM = 'easy-cms-preview'

/** Adds the preview token to a (possibly relative) URL, before any `#fragment`. */
function withPreviewToken(url: string, token: string): string {
  const hash = url.indexOf('#')
  const [base, fragment] = hash === -1 ? [url, ''] : [url.slice(0, hash), url.slice(hash)]
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}${PREVIEW_PARAM}=${encodeURIComponent(token)}${fragment}`
}

/**
 * Throws unless `?preview=` holds a valid token for exactly this document or global. Returns
 * whose access to read it with: the user who made the token (with this request's context, as
 * `onRequest` works it out), or none for tokens made in code without a user.
 */
async function requirePreview(
  cms: EasyCMS,
  ctx: Context,
  target: { collection: string; id: string } | { global: string },
): Promise<{ overrideAccess?: false; user?: AuthUser | null; context?: RequestContext }> {
  const opened = cms.verifyPreviewToken(ctx.url.searchParams.get('preview'))
  const matches =
    opened !== null &&
    ('global' in target
      ? 'global' in opened && opened.global === target.global
      : 'collection' in opened &&
        opened.collection === target.collection &&
        opened.id === target.id)
  if (!matches) throw new UnauthorizedError('Invalid or expired preview token')
  if (opened.user === undefined) return {}
  const id = parseId(opened.user)
  const issuer = id === undefined ? null : await cms.auth.activeUser(id)
  if (!issuer) throw new UnauthorizedError('Invalid or expired preview token')
  const { user, context } = await cms.applyOnRequest(ctx.request.headers, ctx.url, issuer)
  return { overrideAccess: false, user, context }
}

/** `?page=&limit=` for version lists, validated like list queries. */
function parsePage(url: URL): { page: number; limit: number } {
  const { page, limit } = parseListQuery(url)
  return { page, limit }
}

function methodNotAllowed(ctx: Context, allow: string) {
  ctx.headers.set('allow', allow)
  return new HttpError('Method not allowed', 405)
}

function readToken(request: Request): {
  token: string | undefined
  via: 'cookie' | 'bearer' | null
} {
  const authorization = request.headers.get('authorization')
  if (authorization?.startsWith('Bearer '))
    return { token: authorization.slice(7).trim(), via: 'bearer' }
  const token = readCookie(request, SESSION_COOKIE)
  return { token, via: token ? 'cookie' : null }
}

/** A cookie of the request; the `__Host-` one (set over HTTPS) first. */
export function readCookie(request: Request, name: string): string | undefined {
  return cookieValue(request.headers.get('cookie'), name)
}

/**
 * Whether the Origin is the host the browser asked for. Behind a platform's proxy (Netlify,
 * Vercel…) the request URL can name an internal host, while `x-forwarded-host` or `host` keep the
 * public one; a browser can't set either on a cross-site form or a simple request.
 */
function sameHost(origin: string, request: Request, trustProxy: boolean): boolean {
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  // Only a proxy we trust (or the platform's own) sets it; otherwise anyone could.
  const trusted = trustProxy || !!process.env.VERCEL || !!process.env.NETLIFY
  const forwarded = trusted
    ? request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    : undefined
  return host === (forwarded || request.headers.get('host'))
}

/**
 * Blocks cross-site writes (NFR-SEC-01): the Origin must be ours or trusted,
 * and cookie-authenticated requests must echo the session's CSRF token.
 */
function checkCsrf(cms: EasyCMS, ctx: Context) {
  const origin = ctx.request.headers.get('origin')
  const fetchSite = ctx.request.headers.get('sec-fetch-site')
  // Without a session cookie there is nothing to forge, so origins allowed by `cors` may write
  // too (e.g. a public form on a frontend elsewhere); cookie requests need a trusted origin.
  const cookie = ctx.via === 'cookie' && ctx.token !== undefined
  const { cors } = cms.config
  const trusted =
    origin !== null &&
    (origin === ctx.url.origin ||
      sameHost(origin, ctx.request, ctx.trustProxy) ||
      cms.config.auth.trustedOrigins.includes(origin) ||
      (!cookie && (cors === '*' || cors.includes(origin))))
  if (origin !== null && !trusted) throw new ForbiddenError('CSRF check failed: untrusted origin')
  if (origin === null && fetchSite === 'cross-site')
    throw new ForbiddenError('CSRF check failed: cross-site request')

  if (ctx.via === 'cookie' && ctx.token) {
    const given = ctx.request.headers.get(CSRF_HEADER)
    if (!given || !cms.auth.csrfMatches(ctx.token, given)) {
      throw new ForbiddenError(
        `CSRF check failed: send the ${CSRF_HEADER} header from GET /auth/me`,
      )
    }
  }
}

const TYPE_BY_EXTENSION = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type]),
)

/** Serves a stored file with headers that stop uploaded SVG from running scripts. */
async function serveFile(cms: EasyCMS, key: string, head: boolean): Promise<Response> {
  if (!/^[\p{L}\p{M}\p{N}-]+\.[a-z0-9]+$/u.test(key)) throw new HttpError('Not found', 404)
  const file = await cms.storage.get(key)
  if (!file) throw new HttpError('Not found', 404)
  const extension = key.slice(key.lastIndexOf('.') + 1)
  const type = withCharset(TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream')
  return new Response(
    head ? null : (file.body as unknown as ConstructorParameters<typeof Response>[0]),
    {
      status: 200,
      headers: {
        'content-type': type,
        'content-length': String(file.size),
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        // Browsers won't show a PDF in a sandbox; their PDF viewers run apart from the site.
        ...(type === 'application/pdf'
          ? {}
          : {
              'content-security-policy':
                "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
            }),
        'cross-origin-resource-policy': 'cross-origin',
      },
    },
  )
}

/**
 * Serves a private file (`<name>.private.<ext>`): with a valid signed link, or to a signed-in
 * user who may read its media document (roles and folder permissions). Anything else is a 404,
 * so private file names can't be probed.
 */
async function servePrivateFile(
  cms: EasyCMS,
  ctx: Context,
  key: string,
  head: boolean,
): Promise<Response> {
  if (!PRIVATE_KEY.test(key) || !cms.privateStorage) throw new HttpError('Not found', 404)
  const query = ctx.url.searchParams
  const signed = cms.verifyMediaSignature(key, query.get('expires'), query.get('signature'))
  if (!signed) {
    const token = /-([0-9a-f]{8})\.private[.-]/.exec(key)?.[1]
    if (!ctx.user || !token) throw new HttpError('Not found', 404)
    const found = await cms.find(MEDIA, {
      where: { filename: { like: `-${token}.private.` } },
      limit: 5,
      depth: 0,
      user: ctx.user,
      context: ctx.context,
      overrideAccess: false,
    })
    const owns = found.docs.some(
      (d) =>
        d.filename === key ||
        Object.values((d.sizes ?? {}) as Record<string, { filename?: string }>).some(
          (s) => s.filename === key,
        ),
    )
    if (!owns) throw new HttpError('Not found', 404)
  }
  const file = await cms.privateStorage.get(key)
  if (!file) throw new HttpError('Not found', 404)
  const type = withCharset(
    TYPE_BY_EXTENSION[key.slice(key.lastIndexOf('.') + 1)] ?? 'application/octet-stream',
  )
  return new Response(
    head ? null : (file.body as unknown as ConstructorParameters<typeof Response>[0]),
    {
      status: 200,
      headers: {
        'content-type': type,
        'content-length': String(file.size),
        // Not in shared caches; a short while in the browser.
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        ...(type === 'application/pdf'
          ? {}
          : {
              'content-security-policy':
                "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
            }),
        'cross-origin-resource-policy': 'cross-origin',
      },
    },
  )
}

/** Reads `multipart/form-data` with a `file` part; other string parts become document data. */
async function readUpload(
  request: Request,
  maxFileSize: number,
): Promise<{ file: { data: Uint8Array; name: string }; data: Record<string, unknown> }> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(
      'Uploads must be multipart/form-data with a "file" field, or JSON with a "url"',
      415,
    )
  }
  // Leave room for the multipart envelope and the other fields.
  const bytes = await readBody(request, maxFileSize + 64 * 1024).catch((error: unknown) => {
    throw error instanceof HttpError && error.status === 413
      ? new PayloadTooLargeError(`File is larger than ${maxFileSize} bytes`)
      : error
  })
  let form: FormData
  try {
    form = await new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
      body: bytes,
    }).formData()
  } catch {
    throw new HttpError('Malformed multipart body', 400)
  }
  const file = form.get('file')
  if (!file || typeof file === 'string')
    throw new ValidationError(MEDIA, [{ field: 'file', message: 'is required' }])
  const data: Record<string, unknown> = {}
  for (const [key, value] of form) {
    if (key !== 'file' && typeof value === 'string') data[key] = value
  }
  return {
    file: { data: new Uint8Array(await file.arrayBuffer()), name: file.name || 'file' },
    data,
  }
}

/** `page` and `limit` of an admin list, checked like a collection's (`limit` default 50). */
function pageQuery(q: URLSearchParams, defaultLimit = 50): { page: number; limit: number } {
  const number = (name: string, fallback: number, max = Number.POSITIVE_INFINITY) => {
    const raw = q.get(name)
    if (raw === null || raw === '') return fallback
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new QueryError(
        `${name} must be an integer from 1${Number.isFinite(max) ? ` to ${max}` : ''}`,
      )
    return value
  }
  return { page: number('page', 1), limit: number('limit', defaultLimit, 100) }
}

/**
 * A request's body, refused (413) past `max` bytes: by its declared length at once, otherwise as
 * it arrives, so a body sent in chunks without a length can't fill the memory first.
 */
async function readBody(request: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const tooLarge = () => new HttpError('Request body too large', 413)
  if (Number(request.headers.get('content-length') ?? 0) > max) throw tooLarge()
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      // Stop reading, without cancelling: undici, still filling a body made from FormData,
      // throws an unhandled error into a cancelled stream. Unread, the sender is held back.
      reader.releaseLock()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.byteLength
  }
  return body
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError('Content-Type must be application/json', 415)
  }
  const text = new TextDecoder().decode(await readBody(request, MAX_BODY_BYTES))
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new HttpError('Request body is not valid JSON', 400)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError('Request body must be a JSON object', 400)
  }
  return body as Record<string, unknown>
}

function isSecure(ctx: Context) {
  return ctx.url.protocol === 'https:' || process.env.NODE_ENV === 'production'
}

function cookie(
  ctx: Context,
  name: string,
  value: string,
  opts: { httpOnly: boolean; maxAge?: number },
) {
  const secure = isSecure(ctx)
  const parts = [
    `${secure ? hostCookie(name) : name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
  ]
  if (opts.httpOnly) parts.push('HttpOnly')
  if (secure) parts.push('Secure')
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  return parts.join('; ')
}

/**
 * `<api>/auth/…`: `GET :provider/login` and `POST :provider/link` start signing in (or linking
 * an account), `GET :provider/callback` finishes; `GET identities` and `DELETE identities/:id`.
 */
async function ssoRoute(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  segments: string[],
): Promise<Result> {
  const sso = cms.auth.sso
  if (!sso.enabled) throw new HttpError('Not found', 404)
  const [, second, third, extra] = segments
  if (extra !== undefined || second === undefined) throw new HttpError('Not found', 404)

  if (second === 'identities') {
    if (!ctx.user) throw new UnauthorizedError()
    if (third === undefined) {
      if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
      // Admins may look at anyone's (`?user=`); others at their own.
      const asked = ctx.url.searchParams.get('user')
      const target = asked === null ? ctx.user.id : (parseId(asked) ?? asked)
      if (String(target) !== String(ctx.user.id) && !isSystemAdmin(ctx.user))
        throw new ForbiddenError()
      return { body: await sso.identities(target) }
    }
    if (method !== 'DELETE') throw methodNotAllowed(ctx, 'DELETE')
    const id = parseId(third)
    if (id === undefined) throw new HttpError('Not found', 404)
    await sso.unlink(ctx.user, id)
    return { body: { deleted: 1 } }
  }

  const pendingCookie = (value: string, maxAge: number) =>
    cookie(ctx, SSO_COOKIE, value, { httpOnly: true, maxAge })
  if (third === 'login') {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const started = await sso.start(second, {
      origin: ctx.url.origin,
      redirect: ctx.url.searchParams.get('redirect'),
    })
    ctx.headers.append('set-cookie', pendingCookie(started.cookie, 600))
    return { body: redirectResponse(ctx, started.url) }
  }
  // Linking needs the session (and its CSRF token): the account is added to the signed-in user.
  if (third === 'link') {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    if (!ctx.user || ctx.user.apiKey) throw new UnauthorizedError()
    const started = await sso.start(second, {
      origin: ctx.url.origin,
      redirect: null,
      user: ctx.user,
    })
    ctx.headers.append('set-cookie', pendingCookie(started.cookie, 600))
    return { body: { url: started.url } }
  }
  if (third === 'callback') {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const finished = await sso.finish(second, {
      url: ctx.url,
      cookie: readCookie(ctx.request, SSO_COOKIE),
      origin: ctx.url.origin,
      user: ctx.user,
    })
    ctx.headers.append('set-cookie', pendingCookie('', 0))
    if (finished.session) setSessionCookies(cms, ctx, finished.session)
    return { body: redirectResponse(ctx, finished.redirect) }
  }
  throw new HttpError('Not found', 404)
}

/** A redirect that keeps the cookies set on the way. */
function redirectResponse(ctx: Context, location: string): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  for (const value of ctx.headers.getSetCookie()) headers.append('set-cookie', value)
  return new Response(null, { status: 302, headers })
}

function setSessionCookies(cms: EasyCMS, ctx: Context, session: Session) {
  const maxAge = cms.config.auth.tokenExpiration
  ctx.headers.append(
    'set-cookie',
    cookie(ctx, SESSION_COOKIE, session.token, { httpOnly: true, maxAge }),
  )
  ctx.headers.append(
    'set-cookie',
    cookie(ctx, CSRF_COOKIE, session.csrfToken, { httpOnly: false, maxAge }),
  )
}

function clearSessionCookies(ctx: Context) {
  ctx.headers.append('set-cookie', cookie(ctx, SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 }))
  ctx.headers.append('set-cookie', cookie(ctx, CSRF_COOKIE, '', { httpOnly: false, maxAge: 0 }))
  // Cookies from before the `__Host-` names (0.63).
  if (isSecure(ctx))
    for (const name of [SESSION_COOKIE, CSRF_COOKIE])
      ctx.headers.append('set-cookie', `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`)
}

function errorResponse(
  cms: EasyCMS,
  error: unknown,
  headers: Headers,
  production: boolean,
): Response {
  if (error instanceof EasyCMSError) {
    const { code } = error
    const errors =
      error instanceof ValidationError
        ? error.errors.map((e) => ({ message: e.message, field: e.field, code }))
        : [{ message: error.message, code }]
    if (error instanceof UnauthorizedError) headers.set('www-authenticate', 'Bearer')
    if (error instanceof TooManyRequestsError && error.retryAfter !== undefined)
      headers.set('retry-after', String(error.retryAfter))
    if (error.status >= 500) {
      cms.logger.error(`REST request failed: ${error.message}`, { error })
      if (production)
        return new Response(
          JSON.stringify({ errors: [{ message: 'Internal Server Error', code }] }),
          { status: error.status, headers },
        )
    }
    return new Response(JSON.stringify({ errors }), { status: error.status, headers })
  }
  cms.logger.error(
    `REST request failed: ${error instanceof Error ? error.message : String(error)}`,
    {
      error,
    },
  )
  // Outside production the message helps; anything else thrown stays in the log.
  const message = !production && error instanceof Error ? error.message : 'Internal Server Error'
  const body = { errors: [{ message, code: 'INTERNAL_SERVER_ERROR' }] }
  return new Response(JSON.stringify(body), { status: 500, headers })
}
