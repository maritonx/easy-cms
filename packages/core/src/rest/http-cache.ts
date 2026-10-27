// HTTP caching of public reads (`httpCache`, ADR-0054): published content read without a login or
// a key, for a CDN or proxy in front. Everything else stays `no-store`.
import { createHash } from 'node:crypto'
import type { CollectionConfig, GlobalConfig, HttpCacheTimes, ResolvedConfig } from '../config.js'

/**
 * The cache tags public reads carry and `httpCache.purge` receives: `ecms` for all content,
 * `ecms:posts` for a collection's lists, `ecms:posts:42` for a document, `ecms:global:site` for
 * a global. Use them to tag your own fetches, e.g. Next's `fetch(url, { next: { tags } })`.
 */
export const cacheTags = {
  collection: (slug: string) => ['ecms', `ecms:${slug}`],
  document: (slug: string, id: unknown) => ['ecms', `ecms:${slug}`, `ecms:${slug}:${id}`],
  global: (slug: string) => ['ecms', `ecms:global:${slug}`],
}

/** The times for a collection or global, or `null` when its reads aren't cached. */
export function cacheTimes(
  config: ResolvedConfig,
  container: CollectionConfig | GlobalConfig,
): Required<HttpCacheTimes> | null {
  const own = container.httpCache
  if (own === false || (own === undefined && config.httpCache === undefined)) return null
  return {
    sMaxAge: own?.sMaxAge ?? config.httpCache?.sMaxAge ?? 60,
    staleWhileRevalidate:
      own?.staleWhileRevalidate ?? config.httpCache?.staleWhileRevalidate ?? 300,
  }
}

/** Whether an `If-None-Match` header names this ETag (weak comparison, as for GET). */
function matches(header: string | null, etag: string): boolean {
  if (!header) return false
  if (header.trim() === '*') return true
  const bare = (tag: string) => tag.trim().replace(/^W\//, '')
  return header.split(',').some((tag) => bare(tag) === bare(etag))
}

/**
 * A cacheable response: `Cache-Control` for shared caches only (browsers revalidate), the tags
 * as `Cache-Tag` (Cloudflare, Bunny) and `Surrogate-Key` (Fastly, Akamai), and an ETag from the
 * body, answering `304` when the client has it.
 */
export function cacheableResponse(
  request: Request,
  body: string,
  status: number,
  headers: Headers,
  times: Required<HttpCacheTimes>,
  tags: readonly string[],
): Response {
  headers.set(
    'cache-control',
    `public, max-age=0, s-maxage=${times.sMaxAge}, stale-while-revalidate=${times.staleWhileRevalidate}`,
  )
  headers.set('cache-tag', tags.join(','))
  headers.set('surrogate-key', tags.join(' '))
  const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`
  headers.set('etag', etag)
  if (matches(request.headers.get('if-none-match'), etag))
    return new Response(null, { status: 304, headers })
  return new Response(request.method.toUpperCase() === 'HEAD' ? null : body, { status, headers })
}
