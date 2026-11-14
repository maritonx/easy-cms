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

type Slugs<C> = keyof Collections<C> & string

/** The collections' slugs of a schema, for typing code around the client (e.g. `useLive`). */
export type ClientCollection<C extends ClientSchema> = Slugs<C>
/** A collection's document type in a schema. */
export type ClientDocument<C extends ClientSchema, S extends string> =
  S extends Slugs<C> ? Collections<C>[S] : Doc

/**
 * What `subscribe()` follows in a collection with `realtime: true`: all of it, its documents
 * matching `where`, or one document (`id`). As a REST read, as the client's user.
 */
export type LiveSubscription<C extends ClientSchema> = {
  [S in Slugs<C>]: {
    readonly collection: S
    readonly id?: ID
    readonly where?: Where
    /** Drafts too. Needs a signed-in staff user or an API key. */
    readonly draft?: boolean
    readonly depth?: number
    readonly locale?: string
  }
}[Slugs<C>]

/**
 * A change in a subscription. `doc` is the document as the client's user reads it. `delete`: it
 * was deleted; `leave`: it no longer shows for this subscription (unpublished, or no longer
 * matching `where` or the user's access).
 */
export type LiveEvent<C extends ClientSchema, S extends string = Slugs<C>> = {
  [K in S]:
    | {
        readonly event: 'create' | 'update' | 'publish' | 'unpublish'
        readonly eventId: string
        readonly collection: K
        readonly id: ID
        readonly doc: K extends Slugs<C> ? Collections<C>[K] : Doc
      }
    | {
        readonly event: 'delete' | 'leave'
        readonly eventId: string
        readonly collection: K
        readonly id: ID
      }
}[S]

export interface SubscribeHandlers<E> {
  onEvent(event: E): void
  /** Connected, and again after each reconnect (once what was missed meanwhile came). */
  onReady?(): void
  /** It couldn't resume (away longer than the server keeps events): load what you show again. */
  onReset?(): void
  /**
   * The stream failed. It reconnects by itself, except when the API refused the subscription
   * (`EasyCMSClientError` with status 400, 401, 403 or 404).
   */
  onError?(error: Error): void
}

/** `live()`'s state: the list (or the one document, with `id`), kept up to date. */
export interface LiveState<T> {
  readonly docs: readonly T[]
  /** With `id`: the document, `null` when there is none (or it can't be read). */
  readonly doc: T | null
  /** The first load is done. */
  readonly ready: boolean
  readonly error: Error | null
}

export interface LiveQuery extends Omit<FindQuery, 'page' | 'cursor' | 'count' | 'fetch'> {
  /** One document instead of a list. */
  readonly id?: ID
}

/** Stops a subscription. */
export interface LiveHandle {
  close(): void
}

export interface SubscribeOptions {
  /**
   * Start after this event id (`Last-Event-ID`), e.g. a previous stream's `lastEventId`: to
   * change the subscriptions without missing what happened in between.
   */
  readonly lastEventId?: string | undefined
}

/** A stream of `subscribe()`. */
export interface SubscribeHandle extends LiveHandle {
  /** Where the stream got to: the last event's id, or the position `ready` and heartbeats gave. */
  readonly lastEventId: string | undefined
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
  /**
   * Changes in collections with `realtime: true`, over one stream (`GET /realtime`, Server-Sent
   * Events). Reconnects with backoff and resumes where it was (`Last-Event-ID`).
   */
  subscribe<const T extends readonly LiveSubscription<C>[]>(
    subscriptions: T,
    handlers: SubscribeHandlers<LiveEvent<C, T[number]['collection']>>,
    options?: SubscribeOptions,
  ): SubscribeHandle
  /**
   * A list (or one document, with `id`) kept up to date: loaded with `find` (`findById`), then
   * changed by the subscription's events; loaded again after a `reset`. With `limit`, it keeps
   * at most that many, in `sort`'s order (default `-createdAt`).
   */
  live<S extends Slugs<C>>(
    collection: S,
    query: LiveQuery,
    onChange: (state: LiveState<ClientDocument<C, S>>) => void,
  ): LiveHandle
}

type Params = Record<string, string | number | boolean | null | undefined>

/** A value at a field path (`author.name`). */
function valueAt(doc: Doc, path: string): unknown {
  let value: unknown = doc
  for (const key of path.split('.'))
    value = value && typeof value === 'object' ? (value as Doc)[key] : undefined
  return value
}

/** Orders documents as `sort` does on the server: empty values last. */
function compareBy(sort: readonly string[], a: Doc, b: Doc): number {
  for (const key of sort) {
    const desc = key.startsWith('-')
    const path = desc ? key.slice(1) : key
    const x = valueAt(a, path)
    const y = valueAt(b, path)
    if (x === y) continue
    if (x === undefined || x === null) return 1
    if (y === undefined || y === null) return -1
    const order =
      typeof x === 'number' && typeof y === 'number' ? x - y : String(x) < String(y) ? -1 : 1
    if (order !== 0) return desc ? -order : order
  }
  return 0
}

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
  let base = options.url
  while (base.endsWith('/')) base = base.slice(0, -1)
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

  const find = (collection: string, query: FindQuery) =>
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
    )
  const findById = async (collection: string, id: ID, query: FindByIdQuery) => {
    try {
      return await get(
        `${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`,
        one(query),
        query.fetch,
      )
    } catch (error) {
      if (error instanceof EasyCMSClientError && error.status === 404) return null
      throw error
    }
  }

  function subscribe(
    subscriptions: readonly LiveSubscription<ClientSchema>[],
    handlers: SubscribeHandlers<LiveEvent<ClientSchema>>,
    subscribeOptions: SubscribeOptions = {},
  ): SubscribeHandle {
    const search = new URLSearchParams()
    for (const s of subscriptions) {
      const params = new URLSearchParams()
      if (s.where) params.set('where', JSON.stringify(s.where))
      if (s.draft) params.set('draft', 'true')
      if (s.depth !== undefined) params.set('depth', String(s.depth))
      if (s.locale) params.set('locale', s.locale)
      const path = `${encodeURIComponent(s.collection)}${s.id === undefined ? '' : `/${encodeURIComponent(String(s.id))}`}`
      const qs = params.toString()
      search.append('s', qs ? `${path}?${qs}` : path)
    }
    const url = `${base}/realtime?${search}`
    const controller = new AbortController()
    let lastEventId: string | undefined = subscribeOptions.lastEventId
    let delay = 1000

    const connect = async (): Promise<void> => {
      const headers = new Headers(options.fetchOptions?.headers)
      headers.set('accept', 'text/event-stream')
      if (options.token) headers.set('authorization', `Bearer ${options.token}`)
      if (lastEventId !== undefined) headers.set('last-event-id', lastEventId)
      const res = await doFetch(url, {
        ...options.fetchOptions,
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as {
          errors?: { message: string; code?: string }[]
        } | null
        const errors = body?.errors ?? [{ message: res.statusText || `HTTP ${res.status}` }]
        const error = new EasyCMSClientError(
          errors.map((e) => e.message).join('; '),
          res.status,
          errors,
        )
        const retryAfter = Number(res.headers.get('retry-after'))
        if (retryAfter > 0) delay = Math.max(delay, retryAfter * 1000)
        throw error
      }
      // One message's fields until a blank line (the Server-Sent Events format).
      let event = 'message'
      let data = ''
      let id: string | undefined
      let buffer = ''
      const dispatch = () => {
        if (id !== undefined) lastEventId = id
        const name = event
        const text = data
        event = 'message'
        data = ''
        id = undefined
        if (!text && name === 'message') return
        if (name === 'ready') {
          delay = 1000
          handlers.onReady?.()
        } else if (name === 'reset') handlers.onReset?.()
        else if (name !== 'message') {
          const payload = JSON.parse(text) as { collection: string; id: ID; doc?: Doc }
          handlers.onEvent({
            event: name,
            eventId: lastEventId ?? '',
            ...payload,
          } as LiveEvent<ClientSchema>)
        }
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buffer += value
        let end = buffer.search(/\r\n|\r|\n/)
        while (end >= 0) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + (buffer.startsWith('\r\n', end) ? 2 : 1))
          if (line === '') dispatch()
          else if (!line.startsWith(':')) {
            const colon = line.indexOf(':')
            const field = colon < 0 ? line : line.slice(0, colon)
            let value = colon < 0 ? '' : line.slice(colon + 1)
            if (value.startsWith(' ')) value = value.slice(1)
            if (field === 'event') event = value
            else if (field === 'data') data = data ? `${data}\n${value}` : value
            else if (field === 'id') id = value
          }
          end = buffer.search(/\r\n|\r|\n/)
        }
      }
    }

    void (async () => {
      while (!controller.signal.aborted) {
        try {
          await connect()
        } catch (error) {
          if (controller.signal.aborted) return
          handlers.onError?.(error as Error)
          // Refused: retrying won't help.
          if (error instanceof EasyCMSClientError && [400, 401, 403, 404].includes(error.status))
            return
        }
        if (controller.signal.aborted) return
        // Jitter, so clients a restart cut off don't all come back at once.
        await new Promise((resolve) => setTimeout(resolve, delay * (0.5 + Math.random() / 2)))
        delay = Math.min(delay * 2, 30_000)
      }
    })()
    return {
      close: () => controller.abort(),
      get lastEventId() {
        return lastEventId
      },
    }
  }

  function live(
    collection: string,
    query: LiveQuery,
    onChange: (state: LiveState<Doc>) => void,
  ): LiveHandle {
    let docs: Doc[] = []
    let ready = false
    let error: Error | null = null
    let loading = false
    let closed = false
    let queued: LiveEvent<ClientSchema>[] = []
    const sort = [query.sort ?? '-createdAt'].flat()
    const emit = () => {
      if (closed) return
      onChange({
        docs,
        doc: query.id === undefined ? null : (docs[0] ?? null),
        ready,
        error,
      })
    }
    const apply = (change: LiveEvent<ClientSchema>) => {
      const rest = docs.filter((d) => String(d.id) !== String(change.id))
      if (!('doc' in change)) {
        docs = rest
        return
      }
      docs = [...rest, change.doc as Doc].sort((a, b) => compareBy(sort, a, b))
      if (query.limit !== undefined) docs = docs.slice(0, query.limit)
    }
    const load = async () => {
      loading = true
      try {
        if (query.id !== undefined) {
          const doc = (await findById(collection, query.id, query)) as Doc | null
          docs = doc ? [doc] : []
        } else {
          const page = (await find(collection, query)) as { docs: Doc[] }
          docs = page.docs
        }
        for (const change of queued) apply(change)
        ready = true
        error = null
      } catch (e) {
        error = e as Error
      } finally {
        queued = []
        loading = false
        emit()
      }
    }
    const handle = subscribe(
      [
        {
          collection,
          ...(query.id !== undefined ? { id: query.id } : {}),
          ...(query.where ? { where: query.where } : {}),
          ...(query.draft ? { draft: true } : {}),
          ...(query.depth !== undefined ? { depth: query.depth } : {}),
          ...(query.locale ? { locale: query.locale } : {}),
        },
      ],
      {
        onReady: () => {
          if (!ready && !loading) void load()
        },
        onReset: () => void load(),
        onEvent: (change) => {
          if (loading) queued.push(change)
          else {
            apply(change)
            emit()
          }
        },
        onError: (e) => {
          error = e
          emit()
        },
      },
    )
    return {
      close: () => {
        closed = true
        handle.close()
      },
    }
  }

  return {
    subscribe: subscribe as never,
    live: live as never,
    find: (collection, query = {} as never) => find(collection, query) as never,
    findById: (collection, id, query = {}) => findById(collection, id, query) as never,
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
