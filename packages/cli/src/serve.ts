import { type FSWatcher, watch } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createAdminHandler } from '@easy-cms/admin'
import {
  type Config,
  createEasyCMS,
  createRestHandler,
  type EasyCMS,
  type Logger,
  type ResolvedConfig,
} from '@easy-cms/core'

export interface StandaloneOptions {
  /** Use `X-Forwarded-For` / `X-Forwarded-Proto` from a reverse proxy you control. */
  readonly trustProxy?: boolean
}

type Handler = (request: Request, clientIp?: string) => Promise<Response>

/**
 * One Web-standard handler for the whole standalone server: the REST API at `routes.api`, the
 * admin at `admin.path`, and `/healthz` for load balancers. `/` redirects to the admin.
 */
export function createStandaloneHandler<C extends Config>(cms: EasyCMS<C>): Handler {
  const config = cms.config
  const adminPath = `/${config.admin.path.replace(/^\/+|\/+$/g, '')}`
  const clientIps = new WeakMap<Request, string | undefined>()
  const api = createRestHandler(cms, { getClientIp: (request) => clientIps.get(request) })
  const admin = createAdminHandler({
    basePath: adminPath,
    apiPath: config.routes.api,
    locale: config.admin.locale,
    brand: config.admin.brand,
    siteUrl: config.admin.siteUrl,
  })
  const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

  return async (request, clientIp) => {
    const { pathname } = new URL(request.url)
    if (under(pathname, config.routes.api)) {
      clientIps.set(request, clientIp)
      return api(request)
    }
    if (under(pathname, adminPath)) return admin(request)
    if (pathname === '/healthz')
      return new Response('ok', { headers: { 'cache-control': 'no-store' } })
    if (pathname === '/')
      return new Response(null, { status: 302, headers: { location: `${adminPath}/` } })
    return Response.json({ message: 'Not found' }, { status: 404 })
  }
}

/** Converts a Node request into a Web `Request`. */
export function toWebRequest(req: IncomingMessage, trustProxy: boolean): Request {
  const forwardedProto = trustProxy
    ? header(req, 'x-forwarded-proto')?.split(',')[0]?.trim()
    : undefined
  const encrypted = (req.socket as { encrypted?: boolean }).encrypted === true
  const protocol = forwardedProto ?? (encrypted ? 'https' : 'http')
  const url = new URL(req.url ?? '/', `${protocol}://${header(req, 'host') ?? 'localhost'}`)
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item)
    else if (value !== undefined) headers.set(name, value)
  }
  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    method,
    headers,
    ...(hasBody
      ? { body: Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>, duplex: 'half' }
      : {}),
  } as RequestInit)
}

/** Writes a Web `Response` to a Node response. */
export async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  const cookies = response.headers.getSetCookie()
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') res.setHeader(name, value)
  })
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)
  if (!response.body) {
    res.end()
    return
  }
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), res)
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function clientIpOf(req: IncomingMessage, trustProxy: boolean): string | undefined {
  if (trustProxy) {
    const forwarded = header(req, 'x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  return req.socket.remoteAddress
}

export interface StartOptions extends StandaloneOptions {
  readonly port: number
  readonly host?: string
  readonly cwd: string
  readonly logger: Logger
  /** Loads (or reloads) the resolved config. */
  readonly loadConfig: () => Promise<ResolvedConfig>
  /** Reload when files in `cwd` change (development). */
  readonly watch?: boolean
}

export interface RunningServer {
  readonly server: Server
  readonly url: string
  /** Stops accepting connections, then closes the database. */
  close(): Promise<void>
}

const WATCHED = /\.(?:[cm]?[jt]s)$/
const IGNORED = /(?:^|[/\\])(?:node_modules|\.git|dist|\.output|\.next|uploads)(?:[/\\]|$)/

/** Starts the standalone HTTP server. */
export async function startServer(options: StartOptions): Promise<RunningServer> {
  const { logger, cwd } = options
  const trustProxy = options.trustProxy ?? false
  let cms = await createEasyCMS(await options.loadConfig(), { cwd, logger })
  let handler = createStandaloneHandler(cms)

  const server = createServer(async (req, res) => {
    try {
      await sendWebResponse(
        res,
        await handler(toWebRequest(req, trustProxy), clientIpOf(req, trustProxy)),
      )
    } catch (error) {
      logger.error(`Request failed: ${(error as Error).message}`)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
      }
      res.end(res.headersSent ? undefined : JSON.stringify({ message: 'Internal server error' }))
    }
  })

  let watcher: FSWatcher | undefined
  if (options.watch) {
    let timer: NodeJS.Timeout | undefined
    let reloading = Promise.resolve()
    const reload = () => {
      reloading = reloading.then(async () => {
        try {
          const next = await createEasyCMS(await options.loadConfig(), { cwd, logger })
          const previous = cms
          cms = next
          handler = createStandaloneHandler(next)
          await previous.destroy()
          logger.info('Config reloaded.')
        } catch (error) {
          // Keep serving the last good config until the file is fixed.
          logger.error(
            `Reload failed, still serving the previous config:\n${(error as Error).message}`,
          )
        }
      })
    }
    watcher = watch(cwd, { recursive: true }, (_event, file) => {
      if (!file || !WATCHED.test(file) || IGNORED.test(file)) return
      clearTimeout(timer)
      timer = setTimeout(reload, 150)
    })
  }

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => resolveListen())
  })
  const address = server.address() as AddressInfo
  const host =
    !options.host || options.host === '0.0.0.0' || options.host === '::'
      ? 'localhost'
      : options.host
  const url = `http://${host.includes(':') ? `[${host}]` : host}:${address.port}`

  return {
    server,
    url,
    async close() {
      watcher?.close()
      const closed = new Promise<void>((done) => server.close(() => done()))
      server.closeAllConnections()
      await closed
      await cms.destroy()
    },
  }
}
