import { type Config, createApiHandler } from '@easy-cms/core'
import { defineEventHandler, getRequestIP, sendWebResponse, toWebRequest } from 'h3'

export interface HandlerOptions {
  readonly basePath: string
  /** Trust `X-Forwarded-For` for the client IP (only behind a proxy you control). */
  readonly trustProxy: boolean
}

/** Mounts the Easy CMS REST API as a Nitro event handler. */
export function createHandler(config: Config, options: HandlerOptions) {
  // h3 knows the client's IP; the Web request handed to the API doesn't.
  const clientIps = new WeakMap<Request, string | undefined>()
  const api = createApiHandler(config, {
    basePath: options.basePath,
    getClientIp: (request) => clientIps.get(request),
  })
  return defineEventHandler(async (event) => {
    const request = toWebRequest(event)
    clientIps.set(request, getRequestIP(event, { xForwardedFor: options.trustProxy }))
    return sendWebResponse(event, await api(request))
  })
}
