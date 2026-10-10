import { type Config, createApiHandler } from '@easy-cms/core'
import { forwardedClientIp, platformClientIp } from '@easy-cms/core/internal'
import {
  defineEventHandler,
  getRequestHeader,
  getRequestIP,
  sendWebResponse,
  toWebRequest,
} from 'h3'

export interface HandlerOptions {
  readonly basePath: string
  /** The client IP from `X-Forwarded-For`, its last entry (only behind a proxy you control). */
  readonly trustProxy: boolean
}

/** Mounts the Easy CMS REST API as a Nitro event handler. */
export function createHandler(config: Config, options: HandlerOptions) {
  // h3 knows the client's IP; the Web request handed to the API doesn't.
  const clientIps = new WeakMap<Request, string | undefined>()
  const api = createApiHandler(config, {
    basePath: options.basePath,
    trustProxy: options.trustProxy,
    getClientIp: (request) => clientIps.get(request),
  })
  return defineEventHandler(async (event) => {
    const request = toWebRequest(event)
    clientIps.set(
      request,
      options.trustProxy
        ? forwardedClientIp(getRequestHeader(event, 'x-forwarded-for'))
        : (platformClientIp(request.headers) ?? getRequestIP(event)),
    )
    return sendWebResponse(event, await api(request))
  })
}
