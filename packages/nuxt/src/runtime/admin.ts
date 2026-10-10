import { readFileSync } from 'node:fs'
import { renderShell, STRICT_TRANSPORT_SECURITY } from '@easy-cms/admin'
import { defineEventHandler, getRequestURL, setResponseHeaders, setResponseStatus } from 'h3'
import { basePath, headers, html, reload } from '#easy-cms-admin-shell'

/**
 * Serves the admin SPA's HTML for every route under the admin path.
 * Assets are served by Nitro as public assets; a request that reaches this
 * handler for /assets/* means the file does not exist.
 */
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  setResponseHeaders(event, headers)
  if (process.env.NODE_ENV === 'production')
    setResponseHeaders(event, { 'strict-transport-security': STRICT_TRANSPORT_SECURITY })
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
