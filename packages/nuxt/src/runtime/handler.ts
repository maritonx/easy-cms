import { type Config, createApiHandler } from '@easy-cms/core'
import { forwardedClientIp, platformClientIp, platformWaitUntil } from '@easy-cms/core/internal'
import {
  defineEventHandler,
  getRequestHeader,
  getRequestIP,
  type H3Event,
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
  const waitUntils = new WeakMap<Request, (task: Promise<unknown>) => void>()
  const api = createApiHandler(config, {
    basePath: options.basePath,
    trustProxy: options.trustProxy,
    getClientIp: (request) => clientIps.get(request),
    // Nitro's, where the host has one; else Vercel's or Netlify's found by Easy CMS.
    waitUntil: (task, request) => {
      const own = waitUntils.get(request)
      if (own) own(task)
      else platformWaitUntil()?.(task)
    },
  })
  return defineEventHandler(async (event) => {
    const request = toWebRequest(event)
    clientIps.set(
      request,
      options.trustProxy
        ? forwardedClientIp(getRequestHeader(event, 'x-forwarded-for'))
        : (platformClientIp(request.headers) ?? getRequestIP(event)),
    )
    // Work after the response (a backup, emails): Nitro keeps the function for it on hosts
    // that need it.
    const waitUntil = (event as { waitUntil?: (task: Promise<unknown>) => void }).waitUntil
    if (typeof waitUntil === 'function')
      waitUntils.set(request, (task) => waitUntil.call(event, task))
    const response = await api(request)
    if (response.headers.get('content-type')?.startsWith('text/event-stream'))
      return sendEventStream(event, response)
    return sendWebResponse(event, response)
  })
}

/**
 * A realtime stream (ADR-0070), written as it comes: h3's `sendWebResponse` streams too, but
 * keeps reading a stream after the client left, so a stream would never end.
 */
async function sendEventStream(event: H3Event, response: Response): Promise<void> {
  const res = event.node?.res
  const body = response.body
  if (!res?.socket || !body) return sendWebResponse(event, response)
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.flushHeaders()
  const reader = body.getReader()
  res.on('close', () => void reader.cancel().catch(() => {}))
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      res.write(value)
    }
  } catch {
    // The client left.
  }
  res.end()
}
