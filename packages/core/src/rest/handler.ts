import type { AuthUser } from '../access.js'
import { API_KEYS, type ApiKeyPermissions } from '../api-keys.js'
import type { Session } from '../auth/auth.js'
import { safeEqual } from '../auth/tokens.js'
import { deleteBackup, downloadBackup, listBackups, startBackup } from '../backups.js'
import { INTERNAL_COLLECTIONS, MEDIA, USERS } from '../builtins.js'
import type { Config } from '../config.js'
import { parseId } from '../document.js'
import {
  EasyCMSError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  UnauthorizedError,
  ValidationError,
} from '../errors.js'
import type { EasyCMS } from '../local-api.js'
import { EXTENSIONS } from '../media.js'
import {
  deleteDelivery,
  deleteFailedDeliveries,
  isDeliveryKind,
  listDeliveries,
  retryFailedDeliveries,
} from './admin-deliveries.js'
import { adminEmail, sendTestEmail, verifyEmail } from './admin-email.js'
import { readAdminModule } from './admin-modules.js'
import { adminSchema } from './admin-schema.js'
import { adminStatus } from './admin-status.js'
import { pickerFilter } from './filter-options.js'
import { parseDepth, parseListQuery } from './query.js'

export const SESSION_COOKIE = 'ecms-session'
export const CSRF_COOKIE = 'ecms-csrf'
export const CSRF_HEADER = 'x-csrf-token'
const MAX_BODY_BYTES = 1024 * 1024

export interface RestHandlerOptions {
  /** Path the handler is mounted at. Default: `routes.api` from the config (`/api/cms`). */
  readonly basePath?: string
  /** Client IP, used with the email to rate-limit logins. Adapters provide it. */
  readonly getClientIp?: (request: Request) => string | undefined
}

export type RestHandler = (request: Request) => Promise<Response>

class HttpError extends EasyCMSError {}

interface Context {
  readonly request: Request
  readonly url: URL
  readonly user: AuthUser | null
  /** How the request authenticated; cookie auth needs CSRF protection. */
  readonly via: 'cookie' | 'bearer' | null
  readonly token: string | undefined
  readonly headers: Headers
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

/** One request: `path` is the path under the API (or from the root), `null` when outside. */
async function respond(
  cms: EasyCMS,
  request: Request,
  url: URL,
  path: string | null,
  root: boolean,
  options: RestHandlerOptions,
  production: boolean,
): Promise<Response> {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  try {
    if (path === null) throw new HttpError('Not found', 404)
    const segments = pathSegments(path)
    const { token, via } = readToken(request)
    const user = token ? await cms.auth.verify(token) : null
    // A script sending a bad key should hear so, not get anonymous access.
    if (!user && via === 'bearer' && token?.startsWith('ecms_'))
      throw new UnauthorizedError('Invalid or expired API key')
    const ctx: Context = { request, url, user, via: user ? via : null, token, headers }

    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') checkCsrf(cms, ctx)

    const result = root
      ? await customEndpoint(cms, ctx, method, segments, true, options)
      : ((await customEndpoint(cms, ctx, method, segments, false, options)) ??
        (await route(cms, ctx, method, segments, options)))
    if (!result) throw new HttpError('Not found', 404)
    if (result.body instanceof Response) return result.body
    return new Response(JSON.stringify(result.body), { status: result.status ?? 200, headers })
  } catch (error) {
    return errorResponse(cms, error, headers, production)
  }
}

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
      ip: options.getClientIp?.(ctx.request),
      cms,
      json: () => readJson(ctx.request),
    })
    return { body: body === undefined ? null : body }
  }
  if (pathMatched) {
    const allow = own.filter((e) => matchPath(e.path, segments)).map((e) => e.method.toUpperCase())
    throw methodNotAllowed(ctx, [...new Set(allow)].join(', '))
  }
  return undefined
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
  segments: string[],
  options: RestHandlerOptions,
): Promise<Result> {
  const [first, second, third] = segments
  const access = { overrideAccess: false, user: ctx.user, ...parseLocale(ctx.url) } as const
  // Drafts are only for logged-in users; anonymous requests always see published documents.
  const draft = ctx.user !== null && ctx.url.searchParams.get('draft') === 'true'

  if (segments.length === 0) throw new HttpError('Not found', 404)

  // Auth endpoints
  if (first === USERS && second !== undefined && third === undefined && !/^\d+$/.test(second)) {
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
        return { body: { message: 'Logged out' } }
      }
      case 'GET me': {
        const csrfToken =
          ctx.via === 'cookie' && ctx.token ? cms.auth.csrfFor(ctx.token) : undefined
        if (csrfToken)
          ctx.headers.append('set-cookie', cookie(ctx, CSRF_COOKIE, csrfToken, { httpOnly: false }))
        return { body: { user: ctx.user, ...(csrfToken ? { csrfToken } : {}) } }
      }
      case 'GET init':
        return {
          body: {
            hasUsers: await cms.auth.hasUsers(),
            // The login page offers "Forgot password?" only when the email can be sent.
            passwordReset: cms.auth.canSendPasswordLinks(ctx.url.origin),
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
      case 'POST first-register': {
        const body = await readJson(ctx.request)
        const session = await cms.auth.registerFirstUser({
          email: String(body.email ?? ''),
          password: String(body.password ?? ''),
          ...(typeof body.name === 'string' ? { name: body.name } : {}),
        })
        setSessionCookies(cms, ctx, session)
        return {
          status: 201,
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
    if (!byCron && ctx.user?.role !== 'admin') {
      throw ctx.user ? new HttpError('Forbidden', 403) : new UnauthorizedError()
    }
    return { body: await cms.runJobs() }
  }

  // Settings → Backups, for admins: list, back up now, download, delete.
  if (first === 'admin' && second === 'backups') {
    if (!ctx.user) throw new UnauthorizedError()
    if (ctx.user.role !== 'admin' || ctx.user.apiKey) throw new ForbiddenError()
    const [, , id, action, extra] = segments
    if (extra !== undefined) throw new HttpError('Not found', 404)
    if (id === undefined) {
      if (method === 'GET') return { body: await listBackups(cms) }
      if (method === 'POST')
        return { status: 202, body: await startBackup(cms, 'manual', ctx.user.email) }
      throw methodNotAllowed(ctx, 'GET, POST')
    }
    const parsed = parseId(id)
    if (parsed === undefined) throw new HttpError('Not found', 404)
    if (action === 'download') {
      if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
      const file = await downloadBackup(cms, parsed, ctx.user.email)
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
    return { body: { deleted: 1 } }
  }

  // Settings → Email, for admins: the adapter's settings, a connection check and a test email.
  if (first === 'admin' && second === 'email') {
    if (!ctx.user) throw new UnauthorizedError()
    if (ctx.user.role !== 'admin' || ctx.user.apiKey) throw new ForbiddenError()
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
      return { body: await sendTestEmail(cms, ctx.user, body.to, body.locale) }
    }
    throw new HttpError('Not found', 404)
  }

  // What a user owns, by collection (`auth.rbac`), for admins about to delete them.
  if (first === 'admin' && second === 'owned' && third !== undefined && segments.length === 3) {
    if (!ctx.user) throw new UnauthorizedError()
    if (ctx.user.role !== 'admin' || ctx.user.apiKey) throw new ForbiddenError()
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    const parsed = parseId(third)
    if (parsed === undefined) throw new HttpError('Not found', 404)
    return { body: await cms.roles.owned(parsed) }
  }

  // Settings → Roles (`auth.rbac`), for admins: the roles, add, change, delete, history.
  if (first === 'admin' && second === 'roles') {
    if (!ctx.user) throw new UnauthorizedError()
    if (ctx.user.role !== 'admin' || ctx.user.apiKey) throw new ForbiddenError()
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
      const page = Math.max(1, Number.parseInt(ctx.url.searchParams.get('page') ?? '1', 10) || 1)
      return { body: await listDeliveries(cms, k, state, page) }
    }
    if (!isDeliveryKind(kind) || extra !== undefined) throw new HttpError('Not found', 404)
    // /admin/deliveries/:kind/retry and DELETE /admin/deliveries/:kind → every failed one
    if (id === 'retry' && action === undefined) {
      if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
      return { body: await retryFailedDeliveries(cms, kind) }
    }
    if (id === undefined) {
      if (method !== 'DELETE') throw methodNotAllowed(ctx, 'DELETE')
      return { body: await deleteFailedDeliveries(cms, kind) }
    }
    const parsed = parseId(id)
    if (parsed === undefined) throw new HttpError('Not found', 404)
    if (action === 'retry') {
      if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
      return { body: await cms.retryDelivery(kind, parsed) }
    }
    if (action !== undefined) throw new HttpError('Not found', 404)
    if (method !== 'DELETE') throw methodNotAllowed(ctx, 'DELETE')
    await deleteDelivery(cms, kind, parsed)
    return { body: { deleted: 1 } }
  }

  // Admin UI metadata
  if (first === 'admin') {
    if (method !== 'GET') throw methodNotAllowed(ctx, 'GET')
    if (!ctx.user) throw new UnauthorizedError()
    if (second === 'schema' && third === undefined)
      return { body: await adminSchema(cms, ctx.user, ctx.url.origin) }
    // /admin/modules/:n.js → an admin module's code (`admin.modules`)
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
    // /admin/scheduled → the next scheduled publishes the user may manage (dashboard)
    if (second === 'scheduled' && third === undefined)
      return { body: await cms.upcomingJobs({ user: ctx.user, overrideAccess: false }) }
    // /admin/access/:collection/:id → what the user may do with that document
    const [, , collection, id, extra] = segments
    if (second === 'access' && collection && id && extra === undefined) {
      if (
        INTERNAL_COLLECTIONS.has(collection) ||
        !cms.config.collections.some((c) => c.slug === collection)
      ) {
        throw new HttpError(`Unknown collection "${collection}"`, 404)
      }
      return { body: await cms.documentPermissions(collection, id, ctx.user) }
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
        requirePreview(cms, ctx, { global: second })
        return {
          body: await cms.findGlobal(second, {
            ...parseDepth(ctx.url),
            ...parseLocale(ctx.url),
            draft: true,
          }),
        }
      }
      return { body: await cms.findGlobal(second, { ...access, ...parseDepth(ctx.url), draft }) }
    }
    if (method === 'POST') {
      const body = await readJson(ctx.request)
      return { body: await cms.updateGlobal(second, body, { ...access, ...parseDepth(ctx.url) }) }
    }
    throw methodNotAllowed(ctx, 'GET, POST')
  }

  // Media files are public and immutable (their names are unique).
  if (first === MEDIA && second === 'file' && third !== undefined && segments.length === 3) {
    if (method !== 'GET' && method !== 'HEAD') throw methodNotAllowed(ctx, 'GET, HEAD')
    return { body: await serveFile(cms, third, method === 'HEAD') }
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

  // Collections
  const collection = first as string
  if (
    INTERNAL_COLLECTIONS.has(collection) ||
    !cms.config.collections.some((c) => c.slug === collection)
  ) {
    throw new HttpError(`Unknown collection "${collection}"`, 404)
  }
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
      const query = parseListQuery(ctx.url)
      const filter = await pickerFilter(cms, ctx.url, collection, ctx.user)
      if (filter) query.where = query.where ? { and: [query.where, filter] } : filter
      return { body: await cms.find(collection, { ...access, ...query, draft }) }
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
    requirePreview(cms, ctx, { collection, id })
    const doc = await cms.findById(collection, id, {
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
    return { body: doc }
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
  const access = { overrideAccess: false, user: ctx.user, ...parseLocale(ctx.url) } as const
  const depth = parseDepth(ctx.url)
  const [action, versionId, extra] = path
  // An admin emails a user a link to set their password (an invitation, or a reset).
  if (collection === USERS && action === 'password-link' && path.length === 1) {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    if (ctx.user?.role !== 'admin' || ctx.user.apiKey) throw new ForbiddenError()
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
      return { body: { message: 'Cancelled' } }
    }
    if (method === 'GET') return { body: await cms.scheduled(collection, id, access) }
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
    const token = cms.createPreviewToken({ collection, id })
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

/** `/globals/:slug/…`: the same actions as `documentAction`, for a global. */
async function globalAction(
  cms: EasyCMS,
  ctx: Context,
  method: string,
  slug: string,
  path: string[],
): Promise<Result> {
  const access = { overrideAccess: false, user: ctx.user, ...parseLocale(ctx.url) } as const
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
      return { body: { message: 'Cancelled' } }
    }
    if (method === 'GET') return { body: await cms.scheduledGlobal(slug, access) }
    if (method !== 'POST') throw methodNotAllowed(ctx, 'GET, POST')
    const body = await readJson(ctx.request)
    return { status: 201, body: await cms.scheduleGlobal(slug, scheduleJob(body), access) }
  }
  if (path.length === 1 && action === 'preview') {
    if (method !== 'POST') throw methodNotAllowed(ctx, 'POST')
    const body = await readJson(ctx.request)
    const result = await cms.previewGlobal(slug, body, { ...access, ...depth })
    const token = cms.createPreviewToken({ global: slug })
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

/** `?locale=` (a content locale or `all`) and `?fallback-locale=false`. */
function parseLocale(url: URL): { locale?: string; fallbackLocale?: boolean } {
  const locale = url.searchParams.get('locale')
  const fallback = url.searchParams.get('fallback-locale')
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

/** Throws unless `?preview=` holds a valid token for exactly this document or global. */
function requirePreview(
  cms: EasyCMS,
  ctx: Context,
  target: { collection: string; id: string } | { global: string },
) {
  const opened = cms.verifyPreviewToken(ctx.url.searchParams.get('preview'))
  const matches =
    opened !== null &&
    ('global' in target
      ? 'global' in opened && opened.global === target.global
      : 'collection' in opened &&
        opened.collection === target.collection &&
        opened.id === target.id)
  if (!matches) throw new UnauthorizedError('Invalid or expired preview token')
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

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name)
      return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
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
      cms.config.auth.trustedOrigins.includes(origin) ||
      (!cookie && (cors === '*' || cors.includes(origin))))
  if (origin !== null && !trusted) throw new ForbiddenError('CSRF check failed: untrusted origin')
  if (origin === null && fetchSite === 'cross-site')
    throw new ForbiddenError('CSRF check failed: cross-site request')

  if (ctx.via === 'cookie' && ctx.token) {
    const expected = cms.auth.csrfFor(ctx.token)
    const given = ctx.request.headers.get(CSRF_HEADER)
    if (!expected || !given || !safeEqual(given, expected)) {
      throw new ForbiddenError(
        `CSRF check failed: send the ${CSRF_HEADER} header from GET /users/me`,
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
  return new Response(
    head ? null : (file.body as unknown as ConstructorParameters<typeof Response>[0]),
    {
      status: 200,
      headers: {
        'content-type': TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream',
        'content-length': String(file.size),
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy':
          "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
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
  const declared = Number(request.headers.get('content-length') ?? 0)
  // Leave room for the multipart envelope and the other fields.
  if (declared > maxFileSize + 64 * 1024)
    throw new PayloadTooLargeError(`File is larger than ${maxFileSize} bytes`)
  let form: FormData
  try {
    form = await request.formData()
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

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError('Content-Type must be application/json', 415)
  }
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new HttpError('Request body too large', 413)
  const text = await request.text()
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new HttpError('Request body too large', 413)
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
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax']
  if (opts.httpOnly) parts.push('HttpOnly')
  if (isSecure(ctx)) parts.push('Secure')
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  return parts.join('; ')
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
}

function errorResponse(
  cms: EasyCMS,
  error: unknown,
  headers: Headers,
  production: boolean,
): Response {
  if (error instanceof EasyCMSError) {
    const errors =
      error instanceof ValidationError
        ? error.errors.map((e) => ({ message: e.message, field: e.field }))
        : [{ message: error.message }]
    if (error instanceof UnauthorizedError) headers.set('www-authenticate', 'Bearer')
    return new Response(JSON.stringify({ errors }), { status: error.status, headers })
  }
  const message = error instanceof Error ? error.message : String(error)
  cms.logger.error(
    `REST request failed: ${error instanceof Error ? (error.stack ?? message) : message}`,
  )
  const body = { errors: [{ message: production ? 'Internal Server Error' : message }] }
  return new Response(JSON.stringify(body), { status: 500, headers })
}
