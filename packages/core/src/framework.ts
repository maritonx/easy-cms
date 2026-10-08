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
  /** Use the first `X-Forwarded-For` address. Only behind a proxy you trust (Vercel, Netlify…). */
  readonly trustProxy?: boolean
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
      ? (r: Request) => r.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
      : () => undefined)
  return async (request) => {
    const cms = (await sharedEasyCMS(config)) as EasyCMS
    let handler = handlers.get(cms)
    if (!handler) {
      handler = createRestHandler(cms, {
        getClientIp,
        ...(options.basePath ? { basePath: options.basePath } : {}),
      })
      handlers.set(cms, handler)
    }
    return handler(request)
  }
}
