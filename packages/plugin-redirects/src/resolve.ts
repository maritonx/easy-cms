import type { RequestContext } from '@easy-cms/core'
import { REDIRECTS_SOURCE, type RedirectsSource, STATUSES, targetField } from './shared.js'

type Doc = Record<string, unknown>

/** The part of the Local API the helpers use; a structural type. */
interface RedirectsCMS {
  readonly config: { readonly endpoints: readonly { readonly handler: unknown }[] }
  uniqueScope?(
    collection: string,
    field: string,
    options?: { context?: RequestContext },
  ): Promise<Record<string, unknown>>
  find(
    collection: string,
    options: Record<string, unknown>,
  ): Promise<{ docs: Doc[]; hasNextPage: boolean }>
  findById(
    collection: string,
    id: string | number,
    options?: Record<string, unknown>,
  ): Promise<Doc | null>
}

export interface Redirect {
  /** Where to send the visitor: a path on the site, or a full URL. */
  readonly location: string
  readonly status: 301 | 302 | 307 | 308
}

/**
 * A path as redirects store it: the pathname only (no query or fragment), no trailing slash.
 * `null` when it isn't a path.
 */
export function normalizePath(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value, 'http://site.invalid')
  } catch {
    return null
  }
  if (!/^(\/|https?:\/\/)/i.test(value)) return null
  return url.pathname.replace(/\/+$/, '') || '/'
}

interface Cache {
  readonly at: number
  readonly map: Promise<Map<string, Redirect>>
}

export interface ResolveRedirectOptions {
  /**
   * The request's context (e.g. its tenant, `cms.forRequest(request)`): with redirects kept per
   * scope (`uniqueWithin` of `from`), only that scope's apply.
   */
  readonly context?: RequestContext
}

/** On the instance, not in a module variable: every bundled copy of the plugin shares it. */
const CACHE = Symbol.for('easy-cms.plugin-redirects.cache')

/** Forgets the cached redirects, so the next request reads them again. */
export function clearRedirects(cms: object): void {
  delete (cms as { [CACHE]?: Map<string, Cache> })[CACHE]
}

/**
 * The redirect for a request's path, or `null`. Pass the request's URL to keep its query
 * string. Redirects are read once and kept in memory (see `cacheMaxAge`), so calling this on every
 * request is cheap.
 *
 * ```ts
 * const redirect = await resolveRedirect(cms, new URL(request.url))
 * if (redirect) return Response.redirect(new URL(redirect.location, request.url), redirect.status)
 * ```
 */
export async function resolveRedirect(
  cms: RedirectsCMS,
  input: string | URL,
  options: ResolveRedirectOptions = {},
): Promise<Redirect | null> {
  const url = typeof input === 'string' ? safeUrl(input) : input
  if (!url) return null
  const path = normalizePath(url.pathname)
  if (!path) return null
  const found = (await redirects(cms, options)).get(path)
  if (!found) return null
  // Keep the visitor's query string, unless the target has its own.
  const location =
    url.search && !found.location.includes('?') ? found.location + url.search : found.location
  return { location, status: found.status }
}

function safeUrl(input: string): URL | null {
  try {
    return new URL(input, 'http://site.invalid')
  } catch {
    return null
  }
}

function findSource(cms: RedirectsCMS): RedirectsSource {
  for (const endpoint of cms.config.endpoints) {
    const source = (endpoint.handler as { [REDIRECTS_SOURCE]?: RedirectsSource })[REDIRECTS_SOURCE]
    if (source) return source
  }
  throw new Error('resolveRedirect: add redirectsPlugin() to the plugins in your Easy CMS config')
}

async function redirects(
  cms: RedirectsCMS,
  options: ResolveRedirectOptions,
): Promise<Map<string, Redirect>> {
  const source = findSource(cms)
  // Redirects kept per scope (e.g. per tenant): the request's scope only, cached apart.
  const scope =
    options.context && cms.uniqueScope
      ? await cms.uniqueScope(source.slug, 'from', { context: options.context })
      : {}
  const key = JSON.stringify(scope)
  const holder = cms as unknown as { [CACHE]?: Map<string, Cache> }
  holder[CACHE] ??= new Map()
  const caches = holder[CACHE]
  const cached = caches.get(key)
  if (cached && Date.now() - cached.at < source.cacheMs) return cached.map
  const map = load(cms, source, scope)
  caches.set(key, { at: Date.now(), map })
  // A failed read is not kept: the next request tries again.
  map.catch(() => {
    if (caches.get(key)?.map === map) caches.delete(key)
  })
  return map
}

async function load(
  cms: RedirectsCMS,
  source: RedirectsSource,
  scope: Record<string, unknown>,
): Promise<Map<string, Redirect>> {
  const map = new Map<string, Redirect>()
  const where = Object.entries(scope).map(([name, value]) => ({ [name]: { equals: value } }))
  for (let page = 1; ; page++) {
    const result = await cms.find(source.slug, {
      depth: 0,
      sort: 'id',
      limit: 500,
      page,
      ...(where.length ? { where: { and: where } } : {}),
    })
    for (const doc of result.docs) {
      const from = typeof doc.from === 'string' ? normalizePath(doc.from) : null
      if (!from) continue
      const location = await target(cms, source, doc)
      // A redirect to itself would loop.
      if (!location || normalizePath(location) === from) continue
      const status = Number(doc.type)
      map.set(from, {
        location,
        status: (STATUSES as readonly number[]).includes(status)
          ? (status as Redirect['status'])
          : 301,
      })
    }
    if (!result.hasNextPage) break
  }
  return map
}

/** The redirect's address: the fixed one, or its document's current one (if it is published). */
async function target(
  cms: RedirectsCMS,
  source: RedirectsSource,
  doc: Doc,
): Promise<string | null> {
  if (typeof doc.to === 'string' && doc.to.trim()) return doc.to.trim()
  for (const collection of source.collections) {
    const ref = doc[targetField(collection)]
    const id = typeof ref === 'object' && ref !== null ? (ref as Doc).id : ref
    if (id === null || id === undefined) continue
    const locale = typeof doc.locale === 'string' ? doc.locale : null
    const page = await cms.findById(collection, id as string | number, {
      depth: 0,
      ...(locale ? { locale } : {}),
    })
    if (!page || (page.status !== undefined && page.status !== 'published')) return null
    const url = await source.url?.({ collection, doc: page, locale })
    return typeof url === 'string' && url.trim() ? url.trim() : null
  }
  return null
}
