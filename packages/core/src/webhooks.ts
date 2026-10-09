import { createHmac, randomUUID } from 'node:crypto'
import type { ID } from './access.js'
import { USERS } from './builtins.js'
import type { Logger } from './logger.js'

export const WEBHOOK_EVENTS = [
  'create',
  'update',
  'delete',
  'publish',
  'unpublish',
  'draft',
] as const
/**
 * `create`, `update`, `delete`: the stored document changed. `publish` / `unpublish`: its status
 * changed (sent with `create` or `update`). `draft`: only a draft was saved; what is live did not
 * change (collections with versions and drafts).
 */
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export interface WebhookConfig {
  /** Where to POST events. */
  readonly url: string
  /**
   * Events to send. Default: every content change. Events of the app or its plugins (`events`
   * in the config, e.g. `order.paid`) are sent only when listed here.
   */
  readonly events?: readonly (WebhookEvent | (string & {}))[]
  /** Collections to send events for. Default: all but `users` (list it to get accounts); `[]` for none. */
  readonly collections?: readonly string[]
  /** Globals to send events for. Default: all; `[]` for none. */
  readonly globals?: readonly string[]
  /** Signs each body: `x-easy-cms-signature: sha256=<hex HMAC-SHA256 of the body>`. */
  readonly secret?: string
  /** Extra request headers, e.g. a token the receiver checks. */
  readonly headers?: Readonly<Record<string, string>>
}

/** What a webhook receives as JSON. */
export interface WebhookPayload {
  /** A content change (`WebhookEvent`), or an event of the app or a plugin, e.g. `order.paid`. */
  readonly event: string
  readonly collection?: string
  readonly global?: string
  readonly id?: ID
  /**
   * The stored document (every locale, no hidden fields); for `delete`, as it was. For an event of
   * the app or a plugin: what `cms.emit()` was given.
   */
  readonly doc: Record<string, unknown>
  /** ISO time of the change. */
  readonly timestamp: string
}

/** A delivery saved until it succeeds, so it is retried even if the process stops. */
export interface QueuedDelivery {
  readonly url: string
  readonly event: string
  /** The JSON body exactly as first sent, so retries are byte-for-byte the same. */
  readonly body: string
  /** Stays the same on every attempt (`x-easy-cms-delivery`), so receivers can skip duplicates. */
  readonly delivery: string
  readonly attempts: number
  /** ISO time of the next attempt. */
  readonly nextAttemptAt: string
  readonly state: 'pending' | 'failed'
  readonly error: string | null
}

/** Where deliveries wait until they succeed (the `webhook-deliveries` collection). */
export interface WebhookQueue {
  add(delivery: QueuedDelivery): Promise<ID>
  update(id: ID, delivery: QueuedDelivery): Promise<void>
  remove(id: ID): Promise<void>
  /** Pending deliveries whose next attempt is due, oldest first. */
  due(now: Date, limit: number): Promise<(QueuedDelivery & { id: ID })[]>
}

/** Quick retries in the process that sent the event. */
const RETRY_DELAYS = [1_000, 5_000]
/** Later retries from the queue, after the quick ones failed; then the delivery is marked failed. */
const QUEUE_DELAYS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000]
/** A delivery in progress keeps its queue entry out of `retry` for this long. */
const CLAIM = 5 * 60_000
const TIMEOUT = 10_000

/** The result of one attempt to send a delivery. */
export type WebhookAttempt = { ok: true } | { ok: false; error: string }
type Attempt = WebhookAttempt

/** Sends events to the configured webhooks without holding up the operation that caused them. */
export class Webhooks {
  private readonly pending = new Set<Promise<void>>()
  /** Deliveries are saved one after another, so they are first sent in the order of events. */
  private saving: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly hooks: readonly WebhookConfig[],
    private readonly logger: Logger,
    private readonly queue?: WebhookQueue,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly retryDelays: readonly number[] = RETRY_DELAYS,
  ) {}

  emit(
    event: string,
    target: { collection: string; id: ID } | { global: string } | Record<string, never>,
    doc: Record<string, unknown>,
  ) {
    if (this.hooks.length === 0) return
    const payload: WebhookPayload = { event, ...target, doc, timestamp: new Date().toISOString() }
    for (const hook of this.hooks) {
      if (!matches(hook, payload)) continue
      this.track(this.deliver(hook, payload))
    }
  }

  /** Waits for deliveries in progress, e.g. before a serverless function returns. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending])
  }

  /**
   * Tries queued deliveries whose next attempt is due. Runs with scheduled jobs: every minute
   * in a server, or from the cron endpoint.
   */
  async retry(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
    if (!this.queue) return { sent: 0, failed: 0 }
    let sent = 0
    let failed = 0
    for (const entry of await this.queue.due(now, 50)) {
      const { id, ...queued } = entry
      const hook = this.hooks.find((h) => h.url === queued.url)
      if (!hook) {
        // The webhook was removed from the config.
        await this.queue.remove(id)
        continue
      }
      const attempts = queued.attempts + 1
      // Claim it first, so another process running `retry` at the same time skips it.
      await this.queue.update(id, { ...queued, attempts, nextAttemptAt: later(now, CLAIM) })
      const result = await this.attempt(hook, queued.event, queued.body, queued.delivery)
      if (result.ok) {
        await this.queue.remove(id)
        sent++
        continue
      }
      // A process that stopped during its quick retries left fewer attempts: start from the top.
      const delay = QUEUE_DELAYS[Math.max(0, attempts - this.retryDelays.length - 1)]
      if (delay === undefined) failed++
      await this.queue.update(id, {
        ...queued,
        attempts,
        nextAttemptAt: later(now, delay ?? 0),
        state: delay === undefined ? 'failed' : 'pending',
        error: result.error,
      })
      if (delay === undefined) this.giveUp(hook, queued.event, result.error, attempts)
    }
    return { sent, failed }
  }

  /**
   * One attempt now for a saved delivery (the admin's Retry), with the webhook's current headers
   * and secret.
   */
  async sendNow(
    delivery: Pick<QueuedDelivery, 'url' | 'event' | 'body' | 'delivery'>,
  ): Promise<WebhookAttempt> {
    const hook = this.hooks.find((h) => h.url === delivery.url)
    if (!hook) return { ok: false, error: 'this webhook is no longer in the config' }
    return this.attempt(hook, delivery.event, delivery.body, delivery.delivery)
  }

  private track(delivery: Promise<void>) {
    const tracked = delivery
      .catch((error) => this.logger.error(`Webhook queue failed: ${(error as Error).message}`))
      .finally(() => this.pending.delete(tracked))
    this.pending.add(tracked)
  }

  private async deliver(hook: WebhookConfig, payload: WebhookPayload): Promise<void> {
    const delivery = randomUUID()
    const body = JSON.stringify(payload)
    const { event } = payload
    const entry = (attempts: number, nextAttemptAt: string, error: string | null) =>
      ({
        url: hook.url,
        event,
        body,
        delivery,
        attempts,
        nextAttemptAt,
        state: 'pending',
        error,
      }) as const
    // Saved before the first attempt, so the event survives if the process stops while sending.
    // Claimed meanwhile: `retry` leaves it alone until the quick retries here are over.
    const { queue } = this
    const saved = queue
      ? this.saving.then(() => queue.add(entry(0, later(new Date(), CLAIM), null)))
      : Promise.resolve(undefined)
    this.saving = saved.catch(() => {})
    let queued: ID | undefined
    try {
      queued = await saved
    } catch (error) {
      this.logger.error(`Could not save webhook delivery: ${(error as Error).message}`)
    }
    for (let attempt = 0; ; attempt++) {
      const result = await this.attempt(hook, event, body, delivery)
      if (result.ok) {
        if (queued !== undefined) await this.queue?.remove(queued)
        return
      }
      const delay = this.retryDelays[attempt]
      if (delay === undefined) {
        if (queued === undefined || !this.queue)
          return this.giveUp(hook, event, result.error, attempt + 1)
        const next = later(new Date(), QUEUE_DELAYS[0] as number)
        await this.queue.update(queued, entry(attempt + 1, next, result.error))
        this.logger.warn(
          `Webhook ${hook.url} failed for ${event} (${result.error}); will retry later`,
        )
        return
      }
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  /** One POST. Client errors other than rate limiting count as done: retrying won't help. */
  private async attempt(
    hook: WebhookConfig,
    event: string,
    body: string,
    delivery: string,
  ): Promise<Attempt> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'easy-cms-webhooks',
      'x-easy-cms-event': event,
      'x-easy-cms-delivery': delivery,
      ...hook.headers,
    }
    if (hook.secret) {
      headers['x-easy-cms-signature'] =
        `sha256=${createHmac('sha256', hook.secret).update(body).digest('hex')}`
    }
    try {
      const response = await this.fetcher(hook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        if (!response.ok)
          this.logger.warn(`Webhook ${hook.url} answered ${response.status} to ${event}`)
        return { ok: true }
      }
      return { ok: false, error: `status ${response.status}` }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  private giveUp(hook: WebhookConfig, event: string, error: string, attempts: number) {
    this.logger.error(
      `Webhook ${hook.url} failed for ${event} after ${attempts} attempts: ${error}`,
    )
  }
}

const later = (from: Date, ms: number) => new Date(from.getTime() + ms).toISOString()

export const isContentEvent = (event: string): event is WebhookEvent =>
  (WEBHOOK_EVENTS as readonly string[]).includes(event)

function matches(hook: WebhookConfig, payload: WebhookPayload): boolean {
  if (!isContentEvent(payload.event)) return hook.events?.includes(payload.event) === true
  if (hook.events && !hook.events.includes(payload.event)) return false
  if (payload.collection !== undefined)
    // Accounts (`users`) go out only to webhooks that list them: they hold people's details.
    return hook.collections
      ? hook.collections.includes(payload.collection)
      : payload.collection !== USERS
  return !hook.globals || hook.globals.includes(payload.global as string)
}
