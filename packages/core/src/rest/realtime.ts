import type { AuthUser, ID, RequestContext, Where } from '../access.js'
import { andWhere } from '../access-control.js'
import { INTERNAL_COLLECTIONS } from '../builtins.js'
import { parseId } from '../document.js'
import { QueryError } from '../errors.js'
import type { EasyCMS } from '../local-api.js'
import {
  type RealtimeMessage,
  StreamLimitError,
  type Subscriber,
  type Subscription,
} from '../realtime.js'
import { parseListQuery } from './query.js'

/** Subscriptions one stream may have. */
const MAX_SUBSCRIPTIONS = 20
/** How often a stream checks that its session or API key still holds. */
const RECHECK_MS = 60_000

/**
 * One `s` parameter of `GET <api>/realtime`: a path under the API and its query, as a REST read
 * would have them: `posts`, `posts/12`, `posts?where[status][equals]=published&depth=0`.
 */
export function parseSubscription(
  cms: EasyCMS,
  value: string,
  user: AuthUser | null,
): Subscription {
  const at = value.indexOf('?')
  const path = at < 0 ? value : value.slice(0, at)
  const query = new URL(`http://subscription/?${at < 0 ? '' : value.slice(at + 1)}`)
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [collection, rawId] = parts
  if (!collection || parts.length > 2)
    throw new QueryError(`Subscribe to a collection or a document: "${value}" is neither`)
  const config = cms.config.collections.find((c) => c.slug === collection)
  if (!config || INTERNAL_COLLECTIONS.has(collection))
    throw new QueryError(`Unknown collection "${collection}"`)
  if (config.realtime !== true)
    throw new QueryError(`"${collection}" has no realtime: set \`realtime: true\` on it`)
  let id: ID | undefined
  if (rawId !== undefined) {
    id = parseId(rawId)
    if (id === undefined) throw new QueryError(`Invalid id "${rawId}"`)
  }
  const { where, depth } = parseListQuery(query)
  const q = query.searchParams
  const locale = q.get('locale')
  const fallback = q.get('fallbackLocale')
  return {
    collection,
    id,
    where,
    // Drafts are for staff only, as over REST.
    draft: user !== null && user.member !== true && q.get('draft') === 'true',
    depth,
    ...(locale ? { locale } : {}),
    ...(fallback === 'true' || fallback === 'false' ? { fallbackLocale: fallback === 'true' } : {}),
  }
}

/** One SSE message. A WebSocket would send the same `event`, `id` and `data` as JSON. */
export function sseMessage(message: RealtimeMessage): string {
  if (message.event === 'reset') return 'event: reset\ndata: {}\n\n'
  if (message.event === 'ready') return `id: ${message.eventId}\nevent: ready\ndata: {}\n\n`
  const data: Record<string, unknown> = { collection: message.collection, id: message.id }
  if ('doc' in message) data.doc = message.doc
  return `id: ${message.eventId}\nevent: ${message.event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * `GET <api>/realtime?s=…`: Server-Sent Events of the subscriptions' changes (ADR-0070), with
 * the request's session cookie or API key, as other REST reads. `Last-Event-ID` resumes.
 */
export async function realtimeResponse(
  cms: EasyCMS,
  request: Request,
  url: URL,
  auth: {
    readonly user: AuthUser | null
    readonly context: RequestContext
    readonly token: string | undefined
    readonly ip: string | undefined
  },
): Promise<Response> {
  const realtime = cms.realtime
  if (!realtime) throw new QueryError('No collection has realtime: set `realtime: true` on one')
  const values = url.searchParams.getAll('s')
  if (values.length === 0)
    throw new QueryError('Name what to subscribe to: ?s=<collection>, ?s=<collection>/<id>')
  if (values.length > MAX_SUBSCRIPTIONS)
    throw new QueryError(`At most ${MAX_SUBSCRIPTIONS} subscriptions per stream`)
  const { user, context } = auth
  const subscriptions = values.map((value) => parseSubscription(cms, value, user))
  // Refused access or a `where` on fields it may not read fail now, as a REST read would.
  for (const s of subscriptions) {
    const where = andWhere(s.where, s.id === undefined ? true : { id: { equals: s.id } })
    await cms.count(s.collection, {
      ...(where ? { where: where as Where } : {}),
      user,
      context,
      overrideAccess: false,
      draft: s.draft,
      ...(s.locale ? { locale: s.locale } : {}),
      max: 0,
    })
  }

  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let subscriber: Subscriber | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let open = true
  let sentId = ''
  let ready = false
  const write = (text: string) => {
    if (!open) return
    try {
      controller.enqueue(encoder.encode(text))
    } catch {
      end()
    }
  }
  const end = () => {
    if (!open) return
    open = false
    if (heartbeat) clearInterval(heartbeat)
    subscriber?.close()
    try {
      controller.close()
    } catch {
      // Already closed or cancelled.
    }
  }
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      end()
    },
  })
  request.signal?.addEventListener('abort', end)
  // Clients wait this long before reconnecting.
  write('retry: 2000\n\n')
  try {
    subscriber = await realtime.open({
      subscriptions,
      reader: { user, context, overrideAccess: false },
      after: request.headers.get('last-event-id'),
      limit: {
        key: user
          ? user.apiKey
            ? `key:${String((user.apiKey as { id: unknown }).id)}`
            : `user:${String(user.id)}`
          : auth.ip
            ? `ip:${auth.ip}`
            : undefined,
      },
      send: (message) => {
        if ('eventId' in message) sentId = message.eventId
        if (message.event === 'ready') ready = true
        write(sseMessage(message))
      },
      onClose: end,
    })
  } catch (error) {
    open = false
    if (error instanceof StreamLimitError)
      return new Response(JSON.stringify({ errors: [{ message: error.message }] }), {
        status: error.status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'retry-after': error.status === 429 ? '30' : '10',
        },
      })
    throw error
  }
  let checked = Date.now()
  heartbeat = setInterval(() => {
    // Where it got to, though nothing went out: a reconnect starts from there.
    const position = String(subscriber?.position ?? '')
    const moved = ready && position !== '' && position !== '0' && position !== sentId
    if (moved) sentId = position
    write(moved ? `id: ${position}\n: ping\n\n` : ': ping\n\n')
    // A session that ended or a key revoked ends the stream; the client reconnects as who it is now.
    if (auth.token && Date.now() - checked >= RECHECK_MS) {
      checked = Date.now()
      void cms.auth
        .verify(auth.token)
        .then((still) => {
          if (!still) end()
        })
        .catch(() => {})
    }
  }, realtime.options.heartbeatMs)
  ;(heartbeat as { unref?: () => void }).unref?.()
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      // `no-transform`: compression (Next.js's included) would hold events back.
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff',
    },
  })
}
