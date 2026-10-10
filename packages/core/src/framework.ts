import type { Config } from './config.js'
import { configSignature } from './config-signature.js'
import { type CreateEasyCMSOptions, createEasyCMS, type EasyCMS } from './local-api.js'
import { createRestHandler, type RestHandler } from './rest/handler.js'

/**
 * What every framework adapter needs (Next.js, Nuxt, the standalone server, your own): one
 * instance per server, the REST API on top of it, and the user of a request.
 */

interface Shared {
  /** `configSignature()` of the config the instance was made from. */
  signature: string
  promise: Promise<unknown>
}

const KEY = Symbol.for('easy-cms.shared')
const store = globalThis as unknown as { [KEY]?: Shared }

/**
 * The Easy CMS instance for this server, made on first use and kept across hot reloads.
 *
 * Configs are compared by structure, not identity: frameworks bundle the config into each server
 * layer, so the same config can arrive as several objects. A change to fields or options (in
 * development) closes the old instance and makes a new one; a change to a hook's code alone needs
 * a restart. A failed start is not kept: the next call tries again.
 */
export function sharedEasyCMS<const C extends Config>(
  config: C,
  options?: CreateEasyCMSOptions,
): Promise<EasyCMS<C>> {
  const cached = store[KEY]
  const signature = configSignature(config)
  if (cached?.signature === signature) return cached.promise as Promise<EasyCMS<C>>
  if (cached) void (cached.promise as Promise<EasyCMS>).then((cms) => cms.destroy()).catch(() => {})
  const promise = createEasyCMS(config, options)
  store[KEY] = { signature, promise }
  promise.catch(() => {
    if (store[KEY]?.promise === promise) delete store[KEY]
  })
  return promise
}

export interface ApiHandlerOptions {
  /** Where the API is mounted. Default: `routes.api` of the config. */
  readonly basePath?: string
  /**
   * The client's IP (login rate limiting, the audit log), from the framework's request object.
   * Takes precedence over `trustProxy`.
   */
  readonly getClientIp?: (request: Request) => string | undefined
  /**
   * Behind a proxy that adds the client's address to `X-Forwarded-For`: the last address in it
   * (the one the proxy added; earlier ones come from the client and can say anything). Vercel
   * and Netlify are recognized without it.
   */
  readonly trustProxy?: boolean
}

/**
 * The client's address from `X-Forwarded-For` as the nearest proxy wrote it: its last entry.
 * Earlier entries were sent by the client, so they can't be trusted.
 */
export function forwardedClientIp(value: string | null | undefined): string | undefined {
  const last = value
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1)
  return last || undefined
}

/** The client's address on hosting platforms that set it themselves: Vercel, Netlify. */
export function platformClientIp(headers: Headers): string | undefined {
  if (process.env.VERCEL)
    return headers.get('x-real-ip') ?? forwardedClientIp(headers.get('x-forwarded-for'))
  if (process.env.NETLIFY) return headers.get('x-nf-client-connection-ip') ?? undefined
  return undefined
}

/**
 * The REST API as a `(Request) => Response` handler for a framework's route, on the shared
 * instance (`sharedEasyCMS`). Mount it at `routes.api` (default `/api/cms`), for every method.
 */
export function createApiHandler(
  config: Config,
  options: ApiHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const handlers = new WeakMap<EasyCMS, RestHandler>()
  const getClientIp =
    options.getClientIp ??
    (options.trustProxy
      ? (r: Request) => forwardedClientIp(r.headers.get('x-forwarded-for'))
      : (r: Request) => platformClientIp(r.headers))
  return async (request) => {
    const cms = (await sharedEasyCMS(config)) as EasyCMS
    let handler = handlers.get(cms)
    if (!handler) {
      handler = createRestHandler(cms, {
        getClientIp,
        trustProxy: options.trustProxy === true,
        ...(options.basePath ? { basePath: options.basePath } : {}),
      })
      handlers.set(cms, handler)
    }
    return handler(request)
  }
}
