import { createHmac, randomUUID } from 'node:crypto'
import type { ID } from './access.js'
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
  /** Events to send. Default: all. */
  readonly events?: readonly WebhookEvent[]
  /** Collections to send events for. Default: all; `[]` for none. */
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
  readonly event: WebhookEvent
  readonly collection?: string
  readonly global?: string
  readonly id?: ID
  /** The stored document (every locale, no hidden fields); for `delete`, as it was. */
  readonly doc: Record<string, unknown>
  /** ISO time of the change. */
  readonly timestamp: string
}

/** A delivery that failed, saved so it is retried even if the process stops. */
export interface QueuedDelivery {
  readonly url: string
  readonly event: WebhookEvent
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

/** Where failed deliveries wait for their next attempt (the `webhook-deliveries` collection). */
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

type Attempt = { ok: true } | { ok: false; error: string }

/** Sends events to the configured webhooks without holding up the operation that caused them. */
export class Webhooks {
  private readonly pending = new Set<Promise<void>>()

  constructor(
    private readonly hooks: readonly WebhookConfig[],
    private readonly logger: Logger,
    private readonly queue?: WebhookQueue,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly retryDelays: readonly number[] = RETRY_DELAYS,
  ) {}

  emit(
    event: WebhookEvent,
    target: { collection: string; id: ID } | { global: string },
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
      const delay = QUEUE_DELAYS[attempts - this.retryDelays.length - 1]
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
    let queued: ID | undefined
    for (let attempt = 0; ; attempt++) {
      const result = await this.attempt(hook, event, body, delivery)
      if (result.ok) {
        if (queued !== undefined) await this.queue?.remove(queued)
        return
      }
      const entry = (nextAttemptAt: string): QueuedDelivery => ({
        url: hook.url,
        event,
        body,
        delivery,
        attempts: attempt + 1,
        nextAttemptAt,
        state: 'pending',
        error: result.error,
      })
      const delay = this.retryDelays[attempt]
      if (delay === undefined) {
        if (!this.queue) return this.giveUp(hook, event, result.error, attempt + 1)
        const next = entry(later(new Date(), QUEUE_DELAYS[0] as number))
        if (queued === undefined) await this.queue.add(next)
        else await this.queue.update(queued, next)
        this.logger.warn(
          `Webhook ${hook.url} failed for ${event} (${result.error}); will retry later`,
        )
        return
      }
      // Saved before waiting, so the event survives if the process stops meanwhile.
      if (this.queue && queued === undefined) {
        queued = await this.queue.add(entry(later(new Date(), CLAIM)))
      }
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  /** One POST. Client errors other than rate limiting count as done: retrying won't help. */
  private async attempt(
    hook: WebhookConfig,
    event: WebhookEvent,
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

  private giveUp(hook: WebhookConfig, event: WebhookEvent, error: string, attempts: number) {
    this.logger.error(
      `Webhook ${hook.url} failed for ${event} after ${attempts} attempts: ${error}`,
    )
  }
}

const later = (from: Date, ms: number) => new Date(from.getTime() + ms).toISOString()

function matches(hook: WebhookConfig, payload: WebhookPayload): boolean {
  if (hook.events && !hook.events.includes(payload.event)) return false
  if (payload.collection !== undefined)
    return !hook.collections || hook.collections.includes(payload.collection)
  return !hook.globals || hook.globals.includes(payload.global as string)
}
