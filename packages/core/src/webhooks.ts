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

const RETRY_DELAYS = [1_000, 5_000]
const TIMEOUT = 10_000

/** Sends events to the configured webhooks without holding up the operation that caused them. */
export class Webhooks {
  private readonly pending = new Set<Promise<void>>()

  constructor(
    private readonly hooks: readonly WebhookConfig[],
    private readonly logger: Logger,
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
      const delivery = this.deliver(hook, payload).finally(() => this.pending.delete(delivery))
      this.pending.add(delivery)
    }
  }

  /** Waits for deliveries in progress, e.g. before a serverless function returns. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending])
  }

  private async deliver(hook: WebhookConfig, payload: WebhookPayload): Promise<void> {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'easy-cms-webhooks',
      'x-easy-cms-event': payload.event,
      'x-easy-cms-delivery': randomUUID(),
      ...hook.headers,
    }
    if (hook.secret) {
      headers['x-easy-cms-signature'] =
        `sha256=${createHmac('sha256', hook.secret).update(body).digest('hex')}`
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.fetcher(hook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(TIMEOUT),
        })
        // Client errors other than rate limiting won't succeed on retry.
        if (response.ok || (response.status < 500 && response.status !== 429)) {
          if (!response.ok)
            this.logger.warn(`Webhook ${hook.url} answered ${response.status} to ${payload.event}`)
          return
        }
        throw new Error(`status ${response.status}`)
      } catch (error) {
        const delay = this.retryDelays[attempt]
        if (delay === undefined) {
          this.logger.error(
            `Webhook ${hook.url} failed for ${payload.event}: ${(error as Error).message}`,
          )
          return
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
}

function matches(hook: WebhookConfig, payload: WebhookPayload): boolean {
  if (hook.events && !hook.events.includes(payload.event)) return false
  if (payload.collection !== undefined)
    return !hook.collections || hook.collections.includes(payload.collection)
  return !hook.globals || hook.globals.includes(payload.global as string)
}
