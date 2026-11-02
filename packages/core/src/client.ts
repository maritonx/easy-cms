// Read-only REST client for edge runtimes (Vercel Edge, Cloudflare Workers, Deno, browsers).
// No Node.js imports and no runtime imports at all: `@easy-cms/core/client` is one standalone
// file (test/exports.test.ts checks the build). Only types come from the rest of the package.

import type { ID, Where } from './access.js'
import type { Config } from './config.js'
import type { CursorDocs, PaginatedDocs, UncountedDocs } from './database.js'
import type { CollectionDocument, CollectionSlug, GlobalDocument, GlobalSlug } from './infer.js'

type Doc = Record<string, unknown>

/**
 * What the client reads: `typeof config` (a type-only import of `easy-cms.config.ts`), or the
 * types `easy-cms generate:types` writes, as `{ collections: Collections; globals: Globals }`.
 */
export type ClientSchema = Config | { readonly collections?: object; readonly globals?: object }

type Collections<C> = C extends Config
  ? { [S in CollectionSlug<C>]: CollectionDocument<C, S> }
  : C extends { readonly collections: infer X extends object }
    ? X
    : Record<string, Doc>
type Globals<C> = C extends Config
  ? { [S in GlobalSlug<C> & string]: GlobalDocument<C, S> }
  : C extends { readonly globals: infer X extends object }
    ? X
    : Record<string, Doc>

/**
 * Options passed on to `fetch`, such as `next: { revalidate: 60, tags: ['posts'] }` on Next.js or
 * `cf: { cacheTtl: 60 }` on Cloudflare.
 */
export type FetchOptions = RequestInit & Record<string, unknown>

export interface ClientOptions {
  /** The REST API's URL, e.g. `https://cms.example.com/api/cms`. */
  readonly url: string
  /**
   * An API key, or a user's token, sent as `Authorization: Bearer`. Without one the client reads
   * what anonymous visitors can. Keep it on the server: don't ship it to browsers.
   */
  readonly token?: string
  /** Default: the global `fetch`. */
  readonly fetch?: typeof fetch
  /** Passed to every request; a call's own `fetch` options are merged over it. */
  readonly fetchOptions?: FetchOptions
}

interface ReadQuery {
  /** Populate relationships this many levels deep (0–3). */
  readonly depth?: number
  /** A content locale, or `'all'`. */
  readonly locale?: string
  /** `false`: leave missing translations empty instead of using the default locale. */
  readonly fallbackLocale?: boolean
  /** Options for this request's `fetch`. */
  readonly fetch?: FetchOptions
}

export interface FindQuery extends ReadQuery {
  readonly where?: Where
  /** Field path, `-` prefix for descending. */
  readonly sort?: string | readonly string[]
  /** 1–100. Default 10. */
  readonly limit?: number
  readonly page?: number
  /** The `nextCursor` of the page before: cursor pagination, without page numbers. */
  readonly cursor?: string
  /** `false`: no totals, which saves counting every matching document. */
  readonly count?: boolean
  /** Latest drafts instead of published versions. Needs a `token`. */
  readonly draft?: boolean
}

export interface FindByIdQuery extends ReadQuery {
  /** Latest draft instead of the published version. Needs a `token`. */
  readonly draft?: boolean
  /** A preview token (the page's `easy-cms-preview` parameter): reads the draft without a login. */
  readonly preview?: string | null
}

export type FindGlobalQuery = FindByIdQuery

export interface SearchQuery extends ReadQuery {
  /** Only these collections. */
  readonly collections?: readonly string[]
  readonly limit?: number
  readonly page?: number
}

/** A page of `find`: numbered, uncounted (`count: false`) or by cursor. */
export type FindResult<T, Q> = Q extends { readonly cursor: string }
  ? CursorDocs<T>
  : Q extends { readonly count: false }
    ? UncountedDocs<T>
    : PaginatedDocs<T>

export interface SearchResult {
  readonly hits: readonly { readonly collection: string; readonly doc: Doc }[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly hasNextPage: boolean
}

/** A request the API refused: `status` is the HTTP status, `errors` what the API said. */
export class EasyCMSClientError extends Error {
  readonly status: number
  readonly errors: readonly { readonly message: string; readonly code?: string }[]
  constructor(
    message: string,
    status: number,
    errors: readonly { message: string; code?: string }[],
  ) {
    super(message)
    this.name = 'EasyCMSClientError'
    this.status = status
    this.errors = errors
  }
}

export interface EasyCMSClient<C extends ClientSchema> {
  /** Documents of a collection: `GET /:collection`. */
  find<S extends keyof Collections<C> & string, const Q extends FindQuery = Record<never, never>>(
    collection: S,
    query?: Q,
  ): Promise<FindResult<Collections<C>[S], Q>>
  /** One document, or `null` when there is none (or it can't be read): `GET /:collection/:id`. */
  findById<S extends keyof Collections<C> & string>(
    collection: S,
    id: ID,
    query?: FindByIdQuery,
  ): Promise<Collections<C>[S] | null>
  /** A global: `GET /globals/:slug`. */
  findGlobal<S extends keyof Globals<C> & string>(
    global: S,
    query?: FindGlobalQuery,
  ): Promise<Globals<C>[S]>
  /** Full-text search with the config's `search` adapter: `GET /search`. */
  search(q: string, query?: SearchQuery): Promise<SearchResult>
}

type Params = Record<string, string | number | boolean | null | undefined>

/**
 * A client that reads content over the REST API, for code that can't run Easy CMS itself (edge
 * runtimes, other servers, browsers):
 *
 * ```ts
 * import { createClient } from '@easy-cms/core/client'
 * import type config from './easy-cms.config'
 *
 * const cms = createClient<typeof config>({ url: 'https://cms.example.com/api/cms' })
 * const { docs } = await cms.find('posts', { where: { status: { equals: 'published' } } })
 * ```
 */
export function createClient<C extends ClientSchema = Record<never, never>>(
  options: ClientOptions,
): EasyCMSClient<C> {
  const base = options.url.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))

  async function get(path: string, params: Params, init: FetchOptions | undefined) {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== null) search.set(key, String(value))
    const qs = search.toString()
    const headers = new Headers(options.fetchOptions?.headers)
    new Headers(init?.headers).forEach((value, key) => {
      headers.set(key, value)
    })
    headers.set('accept', 'application/json')
    if (options.token) headers.set('authorization', `Bearer ${options.token}`)
    const res = await doFetch(`${base}/${path}${qs ? `?${qs}` : ''}`, {
      ...options.fetchOptions,
      ...init,
      method: 'GET',
      headers,
    })
    const body = (await res.json().catch(() => null)) as {
      errors?: { message: string; code?: string }[]
    } | null
    if (!res.ok) {
      const errors = body?.errors ?? [{ message: res.statusText || `HTTP ${res.status}` }]
      throw new EasyCMSClientError(errors.map((e) => e.message).join('; '), res.status, errors)
    }
    return body as unknown
  }

  const read = (q: ReadQuery): Params => ({
    depth: q.depth,
    locale: q.locale,
    fallbackLocale: q.fallbackLocale === false ? 'false' : undefined,
  })
  const one = (q: FindByIdQuery): Params => ({
    ...read(q),
    ...(q.preview ? { preview: q.preview } : { draft: q.draft ? 'true' : undefined }),
  })

  return {
    find: (collection, query = {} as never) =>
      get(
        encodeURIComponent(collection),
        {
          ...read(query),
          where: query.where ? JSON.stringify(query.where) : undefined,
          sort: typeof query.sort === 'string' ? query.sort : query.sort?.join(','),
          limit: query.limit,
          page: query.page,
          cursor: query.cursor,
          count: query.count === false ? 'false' : undefined,
          draft: query.draft ? 'true' : undefined,
        },
        query.fetch,
      ) as never,
    findById: async (collection, id, query = {}) => {
      try {
        return (await get(
          `${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`,
          one(query),
          query.fetch,
        )) as never
      } catch (error) {
        if (error instanceof EasyCMSClientError && error.status === 404) return null
        throw error
      }
    },
    findGlobal: (global, query = {}) =>
      get(`globals/${encodeURIComponent(global)}`, one(query), query.fetch) as never,
    search: (q, query = {}) =>
      get(
        'search',
        {
          ...read(query),
          q,
          collections: query.collections?.join(','),
          limit: query.limit,
          page: query.page,
        },
        query.fetch,
      ) as never,
  }
}
