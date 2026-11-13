// The standalone server's handler: Web `Request` in, `Response` out, so it runs on Node (serve.ts)
// and on Cloudflare Workers (workers.ts). Nothing here may need Node (ADR-0067).
import { type AdminHandlerOptions, adminHandlerFor } from '@easy-cms/admin'
import { type Config, createRestHandler, type EasyCMS } from '@easy-cms/core'
import { createRootEndpointHandler, healthResponse } from '@easy-cms/core/internal'

export interface StandaloneOptions {
  /** Use `X-Forwarded-For` / `X-Forwarded-Proto` from a reverse proxy you control. */
  readonly trustProxy?: boolean
}

type Handler = (request: Request, clientIp?: string) => Promise<Response>

/**
 * One Web-standard handler for the whole standalone server: the REST API at `routes.api`, the
 * admin at `admin.path`, `/healthz` and `/readyz` for load balancers, and endpoints marked `root` (such as a
 * plugin's `/robots.txt`). `/` redirects to the admin.
 */
export function createStandaloneHandler<C extends Config>(
  cms: EasyCMS<C>,
  options: {
    trustProxy?: boolean
    /** For the admin's handler, e.g. `readFile` where there is no disk (Cloudflare Workers). */
    admin?: Pick<AdminHandlerOptions, 'readFile'>
  } = {},
): Handler {
  const config = cms.config
  const adminPath = `/${config.admin.path.replace(/^\/+|\/+$/g, '')}`
  const clientIps = new WeakMap<Request, string | undefined>()
  const getClientIp = (request: Request) => clientIps.get(request)
  const api = createRestHandler(cms, { getClientIp, trustProxy: options.trustProxy === true })
  const rootEndpoints = createRootEndpointHandler(cms, { getClientIp })
  const admin = adminHandlerFor(config, options.admin ?? {})
  const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

  return async (request, clientIp) => {
    const { pathname } = new URL(request.url)
    if (under(pathname, config.routes.api)) {
      clientIps.set(request, clientIp)
      return api(request)
    }
    if (under(pathname, adminPath)) return admin(request)
    if (pathname === '/healthz' || pathname === '/readyz')
      return healthResponse(pathname === '/healthz' ? 'healthz' : 'readyz', cms)
    clientIps.set(request, clientIp)
    const endpoint = await rootEndpoints(request)
    if (endpoint) return endpoint
    if (pathname === '/')
      return new Response(null, { status: 302, headers: { location: `${adminPath}/` } })
    return Response.json({ message: 'Not found' }, { status: 404 })
  }
}
