import type { AuthUser, ID, RequestContext, Where } from './access.js'
import { REALTIME_EVENTS } from './builtins.js'
import type { RealtimeConfig } from './config.js'
import type { Database, OutboxRow, RawDocument } from './database.js'
import { parseId } from './document.js'
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors.js'
import type { Logger } from './logger.js'

// Realtime (ADR-0070): saves of collections with `realtime: true` write a row of the
// `realtime-events` table in their transaction. Each server reads the new rows every `pollMs`
// and sends each subscriber what it may read, loaded for it at that moment. The rows' ids order
// the events and are the streams' event ids, so a client that reconnects gets what it missed.

/** A change of a document, as stored. */
export type RealtimeChange = 'create' | 'update' | 'delete' | 'publish' | 'unpublish'

/**
 * A change as a subscriber gets it. `leave`: a document the subscriber may have had no longer
 * shows for it (unpublished, its access or the subscription's `where` no longer lets it see it).
 */
export type RealtimeEvent<T = Record<string, unknown>> =
  | {
      readonly event: 'create' | 'update' | 'publish' | 'unpublish'
      /** Resume after it: the stream's `Last-Event-ID`, `cms.subscribe`'s `after`. */
      readonly eventId: string
      readonly collection: string
      readonly id: ID
      /** The document as the subscriber reads it over REST. */
      readonly doc: T
    }
  | {
      readonly event: 'delete' | 'leave'
      readonly eventId: string
      readonly collection: string
      readonly id: ID
    }

/**
 * What a stream sends: changes; `ready` once it is up (after what a resumed stream missed);
 * `reset` when it can't resume (the client was away longer than `retentionHours`): load again.
 */
export type RealtimeMessage<T = Record<string, unknown>> =
  | RealtimeEvent<T>
  | { readonly event: 'ready'; readonly eventId: string }
  | { readonly event: 'reset' }

/** `realtime` of the config with its defaults. */
export interface ResolvedRealtime {
  readonly retentionHours: number
  readonly pollMs: number
  readonly heartbeatMs: number
  readonly maxPerUser: number
  readonly maxConnections: number
}

export function resolveRealtime(config: RealtimeConfig | undefined): ResolvedRealtime {
  return {
    retentionHours: config?.retentionHours ?? 24,
    pollMs: config?.pollMs ?? 1000,
    heartbeatMs: config?.heartbeatMs ?? 25_000,
    maxPerUser: config?.maxPerUser ?? 10,
    maxConnections: config?.maxConnections ?? 1000,
  }
}

/** What one subscription of a stream follows: a collection, its documents matching `where`, or one. */
export interface Subscription {
  readonly collection: string
  /** Only this document. */
  readonly id?: ID | undefined
  /** Only documents matching it, as the REST list's `where`. */
  readonly where?: Where | undefined
  /** Read drafts: already checked to be allowed, as `readsDrafts` of the Local API. */
  readonly draft: boolean
  readonly depth?: number | undefined
  readonly locale?: string | undefined
  readonly fallbackLocale?: boolean | undefined
}

/** Who subscribes, as the Local API's access options. */
export interface Reader {
  readonly user: AuthUser | null
  readonly context?: RequestContext | undefined
  /** `false`: the user's access applies, as over REST. */
  readonly overrideAccess: boolean
}

/** The document as `reader` reads it through `subscription`: `null` when it can't. */
export type LoadDocument = (
  subscription: Subscription,
  reader: Reader,
  id: ID,
) => Promise<Record<string, unknown> | null>

/** A stored event. */
interface StoredEvent {
  readonly id: number
  readonly collection: string
  readonly docId: string
  readonly event: RealtimeChange
  readonly draft: boolean
  readonly published: boolean
}

/** The row a save writes; for a create, `docId` comes from the written document. */
export function realtimeRow(change: {
  readonly collection: string
  readonly docId?: ID | undefined
  readonly event: RealtimeChange
  readonly draft: boolean
  readonly published: boolean
}): OutboxRow {
  return {
    collection: REALTIME_EVENTS,
    data: (id) => {
      const now = new Date().toISOString()
      return {
        collection: change.collection,
        docId: String(change.docId ?? id),
        event: change.event,
        draft: change.draft,
        published: change.published,
        createdAt: now,
        updatedAt: now,
      }
    },
  }
}

/** The stream is full: `429` for one user's, `503` for the server's. */
export class StreamLimitError extends Error {
  constructor(
    readonly status: 429 | 503,
    message: string,
  ) {
    super(message)
    this.name = 'StreamLimitError'
  }
}

const BATCH = 500
/**
 * A missing id below newer ones is a save still committing (Postgres hands out ids before
 * commit), or one rolled back. Newer events wait for it this long, so they go out in order.
 */
const GAP_MS = 10_000
/** A client further behind than this gets `reset` rather than every event it missed. */
export const MAX_REPLAY = 1000

const toEvent = (row: RawDocument): StoredEvent => ({
  id: Number(row.id),
  collection: String(row.collection),
  docId: String(row.docId),
  event: row.event as RealtimeChange,
  draft: row.draft === true,
  published: row.published !== false,
})

/** Reads events in id order from a position, waiting for gaps (see `GAP_MS`). */
class Feed {
  private gapSince: number | undefined

  constructor(
    private readonly db: Database,
    public position: number,
  ) {}

  async read(now = Date.now()): Promise<StoredEvent[]> {
    const out: StoredEvent[] = []
    for (;;) {
      const { docs } = await this.db.find({
        collection: REALTIME_EVENTS,
        where: { id: { gt: this.position } },
        sort: ['id'],
        limit: BATCH,
        page: 1,
      })
      for (const row of docs) {
        const event = toEvent(row)
        if (event.id !== this.position + 1) {
          this.gapSince ??= now
          if (now - this.gapSince < GAP_MS) return out
        }
        this.gapSince = undefined
        this.position = event.id
        out.push(event)
      }
      if (docs.length < BATCH) return out
    }
  }
}

/** The newest event's id, `0` when there is none. */
async function latest(db: Database): Promise<number> {
  const { docs } = await db.find({ collection: REALTIME_EVENTS, sort: ['-id'], limit: 1, page: 1 })
  return docs[0] ? Number(docs[0].id) : 0
}

/**
 * Whether a client at `after` can resume: no event after it was pruned, the database is the
 * same, and it missed at most `MAX_REPLAY` events up to `upTo`.
 */
async function resumable(db: Database, after: number, upTo: number): Promise<boolean> {
  if (after < 0) return false
  const newest = await latest(db)
  if (after > newest) return false
  // Pruning keeps the newest event and goes oldest first: one at or before `after` still there
  // means none after it is gone.
  const kept = await db.count({ collection: REALTIME_EVENTS, where: { id: { lte: after } } })
  if (kept === 0 && newest > 0) {
    const { docs } = await db.find({ collection: REALTIME_EVENTS, sort: ['id'], limit: 1, page: 1 })
    if (docs[0] && Number(docs[0].id) !== after + 1) return false
  }
  if (after >= upTo) return true
  const missed = await db.count({
    collection: REALTIME_EVENTS,
    where: { and: [{ id: { gt: after } }, { id: { lte: upTo } }] },
    max: MAX_REPLAY,
  })
  return missed <= MAX_REPLAY
}

/** `cf-connecting-ip` and friends aside, Cloudflare Workers say who they are here. */
function onWorkers(): boolean {
  return (
    (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ===
    'Cloudflare-Workers'
  )
}

/** Loads shared by subscribers within one batch: visitors with the same context read alike. */
type LoadCache = Map<string, Promise<Record<string, unknown> | null>>

const contextIds = new WeakMap<object, number>()
let nextContextId = 1
function contextId(context: RequestContext | undefined): number {
  if (!context) return 0
  let id = contextIds.get(context)
  if (id === undefined) {
    id = nextContextId++
    contextIds.set(context, id)
  }
  return id
}

export interface OpenOptions {
  readonly subscriptions: readonly Subscription[]
  readonly reader: Reader
  /** Receives the stream's messages, in order. */
  readonly send: (message: RealtimeMessage) => void
  /** Called once when the subscriber is closed by the hub (e.g. `cms.destroy()`). */
  readonly onClose?: () => void
  /** The client's position, e.g. `Last-Event-ID`: what it missed since comes first. */
  readonly after?: string | null | undefined
  /**
   * Counted against `maxPerUser` (by this key) and `maxConnections`: streams over HTTP. The
   * Local API's subscriptions aren't counted.
   */
  readonly limit?: { readonly key: string | undefined } | undefined
}

/** One open stream or `cms.subscribe`. */
export class Subscriber {
  private queue: Promise<void> = Promise.resolve()
  private skipUpTo = 0
  /** The newest event this subscriber has dealt with (sent or not for it). */
  position = 0
  closed = false
  /** Per-connection mode (Workers): its own feed and timer. */
  feed: Feed | undefined
  timer: ReturnType<typeof setInterval> | undefined
  private reading: Promise<void> | undefined

  constructor(
    private readonly hub: Realtime,
    readonly subscriptions: readonly Subscription[],
    readonly reader: Reader,
    private readonly sendMessage: (message: RealtimeMessage) => void,
    readonly onClose: (() => void) | undefined,
    readonly key: string | undefined,
    readonly counted: boolean,
  ) {}

  /** Runs `task` after what is queued. */
  enqueue(task: () => Promise<void> | void): void {
    this.queue = this.queue
      .then(() => (this.closed ? undefined : task()))
      .catch((error) => this.hub.logger.error(`Realtime: ${(error as Error).message}`, { error }))
  }

  send(message: RealtimeMessage): void {
    if (!this.closed) this.sendMessage(message)
  }

  skip(upTo: number): void {
    this.skipUpTo = Math.max(this.skipUpTo, upTo)
    this.position = Math.max(this.position, upTo)
  }

  /** Queues events read from the table. */
  push(events: readonly StoredEvent[], cache: LoadCache): void {
    if (events.length > 0) this.enqueue(() => this.deliver(events, cache))
  }

  /** Sends events now; within a queued task. */
  async deliver(events: readonly StoredEvent[], cache: LoadCache, replay = false): Promise<void> {
    for (const event of events) {
      if (this.closed) return
      if (!replay && event.id <= this.skipUpTo) continue
      const message = await this.messageFor(event, cache)
      this.position = Math.max(this.position, event.id)
      if (message) this.send(message)
    }
  }

  /** Reads its own feed (per-connection mode). */
  readOwn(): void {
    if (this.reading || !this.feed || this.closed) return
    const feed = this.feed
    this.reading = feed
      .read()
      .then((events) => this.push(events, new Map()))
      .catch((error) => this.hub.logger.error(`Realtime: ${(error as Error).message}`, { error }))
      .finally(() => {
        this.reading = undefined
      })
  }

  /** What this subscriber gets for an event, if anything. */
  private async messageFor(
    event: StoredEvent,
    cache: LoadCache,
  ): Promise<RealtimeMessage | undefined> {
    const seen = this.subscriptions.filter(
      (s) =>
        s.collection === event.collection &&
        (s.id === undefined || String(s.id) === event.docId) &&
        // Drafts go only to who reads drafts; who reads published documents only may have seen
        // it only if it was published before or after.
        (s.draft || (!event.draft && event.published)),
    )
    if (seen.length === 0) return undefined
    const id = parseId(event.docId) ?? event.docId
    const eventId = String(event.id)
    const base = { eventId, collection: event.collection, id }
    if (event.event === 'delete') return { event: 'delete', ...base }
    for (const subscription of seen) {
      const doc = await this.load(subscription, event, id, cache)
      if (doc === undefined) return undefined
      if (doc) return { event: event.event, ...base, doc }
    }
    // Never shown to it: nothing to take back.
    return event.event === 'create' ? undefined : { event: 'leave', ...base }
  }

  /** The document for one subscription; `undefined` when loading failed (nothing is sent). */
  private async load(
    subscription: Subscription,
    event: StoredEvent,
    id: ID,
    cache: LoadCache,
  ): Promise<Record<string, unknown> | null | undefined> {
    const { reader } = this
    const shared = reader.user === null || reader.overrideAccess
    const key = shared
      ? `${event.id}|${contextId(reader.context)}|${reader.overrideAccess}|${JSON.stringify(subscription)}`
      : undefined
    let loading = key === undefined ? undefined : cache.get(key)
    if (!loading) {
      loading = this.hub.load(subscription, reader, id)
      if (key !== undefined) cache.set(key, loading)
    }
    try {
      return await loading
    } catch (error) {
      // Access that now refuses the collection: the document no longer shows for it.
      if (
        error instanceof ForbiddenError ||
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError
      )
        return null
      this.hub.logger.error(
        `Realtime: loading ${event.collection} ${id} failed: ${(error as Error).message}`,
        {
          error,
        },
      )
      return undefined
    }
  }

  /** Stops it; `onClose` runs when the hub ends it, not when its owner did. */
  close(byHub = false): void {
    if (this.closed) return
    this.closed = true
    if (this.timer) clearInterval(this.timer)
    this.hub.remove(this)
    if (byHub) this.onClose?.()
  }
}

/**
 * The subscribers of one Easy CMS instance. On Node, Bun and Deno one feed reads the table for
 * all of them; on Cloudflare Workers, where one request can't write to another's stream, each
 * subscriber reads it on its own.
 */
export class Realtime {
  readonly options: ResolvedRealtime
  private readonly subscribers = new Set<Subscriber>()
  private readonly perKey = new Map<string, number>()
  private counted = 0
  private feed: Promise<Feed> | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private polling: Promise<void> | undefined
  private again = false

  constructor(
    private readonly db: Database,
    readonly logger: Logger,
    readonly load: LoadDocument,
    config: RealtimeConfig | undefined,
    /** Collections with `realtime: true`. */
    readonly collections: ReadonlySet<string>,
    private readonly shared: boolean = !onWorkers(),
  ) {
    this.options = resolveRealtime(config)
  }

  /** Open streams on this server (Local API subscriptions not included). */
  get connections(): number {
    return this.counted
  }

  /** Starts a subscriber. Throws `StreamLimitError` when over a limit. */
  async open(options: OpenOptions): Promise<Subscriber> {
    const key = options.limit?.key
    if (options.limit) {
      if (this.counted >= this.options.maxConnections)
        throw new StreamLimitError(503, 'Too many open streams on this server: try again later')
      if (key !== undefined && (this.perKey.get(key) ?? 0) >= this.options.maxPerUser)
        throw new StreamLimitError(429, 'Too many open streams: close one first')
    }
    const subscriber = new Subscriber(
      this,
      options.subscriptions,
      options.reader,
      options.send,
      options.onClose,
      key,
      options.limit !== undefined,
    )
    const after = parseAfter(options.after)
    if (subscriber.counted) {
      this.counted++
      if (key !== undefined) this.perKey.set(key, (this.perKey.get(key) ?? 0) + 1)
    }
    try {
      if (this.shared) await this.openShared(subscriber, after)
      else await this.openOwn(subscriber, after)
    } catch (error) {
      subscriber.close()
      throw error
    }
    return subscriber
  }

  private async openShared(subscriber: Subscriber, after: number | undefined) {
    const feed = await this.sharedFeed()
    // No await from here to `add`: the feed's events after `upTo` all reach the subscriber.
    const upTo = feed.position
    subscriber.skip(upTo)
    this.subscribers.add(subscriber)
    this.startTimer()
    subscriber.enqueue(async () => {
      if (after === undefined) return
      if (!(await resumable(this.db, after, upTo))) {
        subscriber.send({ event: 'reset' })
        return
      }
      if (after >= upTo) {
        subscriber.skip(after)
        return
      }
      // What it missed (at most MAX_REPLAY, checked above), then what the feed reads next.
      const { docs } = await this.db.find({
        collection: REALTIME_EVENTS,
        where: { and: [{ id: { gt: after } }, { id: { lte: upTo } }] },
        sort: ['id'],
        limit: MAX_REPLAY,
        page: 1,
      })
      // Not skipped as below the feed's position: these are what it missed.
      await subscriber.deliver(docs.map(toEvent), new Map(), true)
    })
    subscriber.enqueue(() =>
      subscriber.send({ event: 'ready', eventId: String(subscriber.position) }),
    )
  }

  private async openOwn(subscriber: Subscriber, after: number | undefined) {
    const newest = await latest(this.db)
    let position = newest
    if (after !== undefined) {
      if (await resumable(this.db, after, newest)) position = after
      else subscriber.send({ event: 'reset' })
    }
    subscriber.feed = new Feed(this.db, position)
    subscriber.skip(position)
    this.subscribers.add(subscriber)
    subscriber.send({ event: 'ready', eventId: String(position) })
    subscriber.timer = setInterval(() => subscriber.readOwn(), this.options.pollMs)
    subscriber.readOwn()
  }

  private sharedFeed(): Promise<Feed> {
    if (!this.feed) {
      const starting = latest(this.db).then((position) => new Feed(this.db, position))
      this.feed = starting
      starting.catch(() => {
        if (this.feed === starting) this.feed = undefined
      })
    }
    return this.feed
  }

  private startTimer() {
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), this.options.pollMs)
    ;(this.timer as { unref?: () => void }).unref?.()
  }

  /** Reads new events now, e.g. right after a save on this server (shared mode). */
  kick(): void {
    if (this.shared && this.timer) this.poll()
  }

  private poll(): void {
    if (this.polling) {
      this.again = true
      return
    }
    this.polling = (async () => {
      do {
        this.again = false
        const feed = await this.sharedFeed()
        const events = await feed.read()
        if (events.length === 0) continue
        const cache: LoadCache = new Map()
        for (const subscriber of this.subscribers) subscriber.push(events, cache)
      } while (this.again)
    })()
      .catch((error) => this.logger.error(`Realtime: ${(error as Error).message}`, { error }))
      .finally(() => {
        this.polling = undefined
      })
  }

  /** @internal Called by `Subscriber.close`. */
  remove(subscriber: Subscriber): void {
    if (!this.subscribers.delete(subscriber) && !subscriber.counted) return
    if (subscriber.counted) {
      this.counted = Math.max(0, this.counted - 1)
      const key = subscriber.key
      if (key !== undefined) {
        const left = (this.perKey.get(key) ?? 1) - 1
        if (left > 0) this.perKey.set(key, left)
        else this.perKey.delete(key)
      }
    }
    if (this.subscribers.size === 0 && this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
      // Starts again from the newest event: nobody is waiting for those in between.
      this.feed = undefined
    }
  }

  /** Removes events older than `retentionHours`, always keeping the newest (see `resumable`). */
  async prune(now: Date = new Date()): Promise<number> {
    const before = new Date(now.getTime() - this.options.retentionHours * 3_600_000).toISOString()
    const newest = await latest(this.db)
    let removed = 0
    for (;;) {
      const { docs } = await this.db.find({
        collection: REALTIME_EVENTS,
        where: { and: [{ createdAt: { lt: before } }, { id: { lt: newest } }] },
        sort: ['id'],
        limit: BATCH,
        page: 1,
      })
      for (const row of docs) await this.db.delete({ collection: REALTIME_EVENTS, id: row.id })
      removed += docs.length
      if (docs.length < BATCH) return removed
    }
  }

  /** Ends every subscriber, e.g. when the instance is destroyed. */
  close(): void {
    for (const subscriber of [...this.subscribers]) subscriber.close(true)
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }
}

function parseAfter(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  return /^\d{1,15}$/.test(value.trim()) ? Number(value.trim()) : -1
}
