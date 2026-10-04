import type { Logger } from './logger.js'

type ID = string | number

/** An email to send. Addresses may be `name <address>`. */
export interface EmailMessage {
  readonly to: string | readonly string[]
  readonly cc?: string | readonly string[]
  readonly bcc?: string | readonly string[]
  /** Default: the adapter's `from`. */
  readonly from?: string
  readonly replyTo?: string
  readonly subject: string
  readonly html?: string
  readonly text?: string
}

/**
 * Sends email for Easy CMS and its plugins (form notifications, and more later). Set one in
 * the config as `email`, e.g. `smtp()` from `@easy-cms/email-smtp`, or `consoleEmail()` in
 * development. Throw to report a failure: the message is retried later.
 */
export interface EmailAdapter {
  /** What sends the email, e.g. `smtp`; shown to admins on the dashboard (System). */
  readonly name?: string
  /** The sender when a message has none, e.g. `Easy CMS <no-reply@example.com>`. */
  readonly from?: string | undefined
  send(message: EmailMessage & { readonly from: string }): Promise<void>
}

/** Prints emails to the log instead of sending them: for development and tests. */
export function consoleEmail(options: { from?: string; log?: (text: string) => void } = {}) {
  const sent: (EmailMessage & { from: string })[] = []
  const adapter: EmailAdapter & { readonly sent: typeof sent } = {
    name: 'console',
    from: options.from ?? 'Easy CMS <no-reply@localhost>',
    sent,
    async send(message) {
      sent.push(message)
      const list = (value: string | readonly string[] | undefined) =>
        value === undefined ? undefined : typeof value === 'string' ? value : value.join(', ')
      const lines = [
        `Email to ${list(message.to)}${message.cc ? `, cc ${list(message.cc)}` : ''}`,
        `From: ${message.from}${message.replyTo ? ` (reply to ${message.replyTo})` : ''}`,
        `Subject: ${message.subject}`,
        '',
        message.text ?? message.html ?? '',
      ]
      ;(options.log ?? console.log)(lines.join('\n'))
    },
  }
  return adapter
}

/** An email saved until it is sent, so a failed or interrupted send is retried later. */
export interface QueuedEmail {
  /** The message as JSON. */
  readonly message: string
  readonly attempts: number
  readonly nextAttemptAt: string
  readonly state: 'pending' | 'failed'
  readonly error: string | null
}

export interface EmailQueue {
  add(email: QueuedEmail): Promise<ID>
  update(id: ID, email: QueuedEmail): Promise<void>
  remove(id: ID): Promise<void>
  due(now: Date, limit: number): Promise<(QueuedEmail & { id: ID })[]>
}

/** Retries from the queue after the first attempt failed; then the email is marked failed. */
const QUEUE_DELAYS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000]
/** A send in progress keeps its queue entry out of `retry` for this long. */
const CLAIM = 5 * 60_000

const later = (from: Date, ms: number) => new Date(from.getTime() + ms).toISOString()

/** Sends email in the background: saved first, sent, and retried from the queue if it fails. */
export class Mailer {
  private readonly pending = new Set<Promise<void>>()

  constructor(
    private readonly adapter: EmailAdapter | undefined,
    private readonly logger: Logger,
    private readonly queue?: EmailQueue,
  ) {}

  get configured(): boolean {
    return this.adapter !== undefined
  }

  /**
   * Queues an email and sends it without waiting. Resolves once it is saved; `flush()` waits
   * for the sending too. Without an `email` adapter in the config, the email is skipped with a
   * warning.
   */
  async send(message: EmailMessage): Promise<void> {
    if (!this.adapter) {
      this.logger.warn(
        `Email "${message.subject}" not sent: set \`email\` in the config (e.g. consoleEmail() in development)`,
      )
      return
    }
    const body = JSON.stringify(message)
    let id: ID | undefined
    try {
      id = await this.queue?.add({
        message: body,
        attempts: 0,
        nextAttemptAt: later(new Date(), CLAIM),
        state: 'pending',
        error: null,
      })
    } catch (error) {
      this.logger.error(`Could not save email: ${(error as Error).message}`)
    }
    this.track(this.deliver(message, body, id))
  }

  /** Waits for emails being sent, e.g. before a serverless function returns. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending])
  }

  /** Sends queued emails that are due for another attempt. Runs with scheduled jobs. */
  async retry(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
    if (!this.queue || !this.adapter) return { sent: 0, failed: 0 }
    let sent = 0
    let failed = 0
    for (const { id, ...queued } of await this.queue.due(now, 50)) {
      const attempts = queued.attempts + 1
      // Claim it first, so another process retrying at the same time skips it.
      await this.queue.update(id, { ...queued, attempts, nextAttemptAt: later(now, CLAIM) })
      const error = await this.attempt(JSON.parse(queued.message) as EmailMessage)
      if (!error) {
        await this.queue.remove(id)
        sent++
        continue
      }
      const delay = QUEUE_DELAYS[attempts - 1]
      if (delay === undefined) {
        failed++
        this.logger.error(`Email gave up after ${attempts} attempts: ${error}`)
      }
      await this.queue.update(id, {
        ...queued,
        attempts,
        nextAttemptAt: later(now, delay ?? 0),
        state: delay === undefined ? 'failed' : 'pending',
        error,
      })
    }
    return { sent, failed }
  }

  /** One attempt now for a saved email (the admin's Retry): `undefined` when sent, else the error. */
  async sendNow(message: string): Promise<string | undefined> {
    if (!this.adapter) return 'email is not set up (`email` in the config)'
    return this.attempt(JSON.parse(message) as EmailMessage)
  }

  private track(delivery: Promise<void>) {
    const tracked = delivery
      .catch((error) => this.logger.error(`Email queue failed: ${(error as Error).message}`))
      .finally(() => this.pending.delete(tracked))
    this.pending.add(tracked)
  }

  private async deliver(message: EmailMessage, body: string, id: ID | undefined) {
    const error = await this.attempt(message)
    if (!error) {
      if (id !== undefined) await this.queue?.remove(id)
      return
    }
    if (id === undefined || !this.queue) {
      this.logger.error(`Email "${message.subject}" failed: ${error}`)
      return
    }
    this.logger.warn(`Email "${message.subject}" failed, retrying later: ${error}`)
    await this.queue.update(id, {
      message: body,
      attempts: 1,
      nextAttemptAt: later(new Date(), QUEUE_DELAYS[0] as number),
      state: 'pending',
      error,
    })
  }

  /** `undefined` when sent, else the error. */
  private async attempt(message: EmailMessage): Promise<string | undefined> {
    const adapter = this.adapter as EmailAdapter
    const from = message.from ?? adapter.from
    if (!from) return 'no sender: set `from` on the message or the email adapter'
    try {
      await adapter.send({ ...message, from })
      return undefined
    } catch (error) {
      return (error as Error).message || String(error)
    }
  }
}
