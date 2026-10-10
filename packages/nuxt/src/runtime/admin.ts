import { readFileSync } from 'node:fs'
// `@easy-cms/admin` only for development (`reload`): in production the bundle leaves it out.
import { renderShell } from '@easy-cms/admin'
import { defineEventHandler, getRequestURL, setResponseHeaders, setResponseStatus } from 'h3'
import { basePath, config, headers, hsts, html, reload } from '#easy-cms-admin-shell'

/**
 * Serves the admin SPA's HTML for every route under the admin path.
 * Assets are served by Nitro as public assets; a request that reaches this
 * handler for /assets/* means the file does not exist.
 */
// The storages' upload origins (direct uploads of large files) join `connect-src`, as
// `securityHeaders()` of @easy-cms/admin does; read when the server starts (env-dependent).
const origins = [config.upload?.storage, config.upload?.privateStorage]
  .flatMap((storage) => storage?.uploadOrigins ?? [])
  .filter((origin) => /^https?:\/\/[^\s;,'"]+$/.test(origin))
const csp = headers['content-security-policy']
const allHeaders =
  origins.length && csp
    ? {
        ...headers,
        'content-security-policy': csp.replace(
          "connect-src 'self'",
          `connect-src 'self' ${[...new Set(origins)].join(' ')}`,
        ),
      }
    : headers

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  setResponseHeaders(event, allHeaders)
  if (process.env.NODE_ENV === 'production')
    setResponseHeaders(event, { 'strict-transport-security': hsts })
  if (event.method !== 'GET' && event.method !== 'HEAD') {
    setResponseStatus(event, 405)
    setResponseHeaders(event, { allow: 'GET, HEAD' })
    return 'Method not allowed'
  }
  if (url.pathname === basePath) {
    setResponseStatus(event, 308)
    setResponseHeaders(event, { location: `${basePath}/${url.search}` })
    return ''
  }
  if (url.pathname.startsWith(`${basePath}/assets/`)) {
    setResponseStatus(event, 404)
    return 'Not found'
  }
  setResponseHeaders(event, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })
  return reload ? renderShell(readFileSync(reload.file, 'utf8'), reload.options) : html
})
