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
  /**
   * What kind of email it is, e.g. `password-reset` or `form:contact`: shown and filtered in the
   * admin's email log. Not sent.
   */
  readonly tag?: string
}

/** One email in the log (Settings → Email): who, what and how it went, never its content. */
export interface EmailLogEntry {
  to: string
  cc: string | null
  /** How many were blind-copied; who isn't kept. */
  bcc: number
  subject: string
  tag: string | null
  /** `skipped`: every recipient is on the suppression list (Settings → Email). */
  state: 'sent' | 'pending' | 'failed' | 'skipped'
  attempts: number
  error: string | null
  /** The email adapter's name, e.g. `smtp`, or the integration's, e.g. `resend`. */
  adapter: string
  sentAt: string | null
  /** The provider's id for the email (`send()`'s `id`): its delivery events name it. */
  providerId?: string | null
  /** What the provider said happened after sending, from its webhook. */
  delivery?: EmailDelivery | null
  deliveryAt?: string | null
}

/** What happened to an email after it was sent, as the provider tells it. */
export type EmailDelivery = 'delivered' | 'bounced' | 'complained'

/** Why an address gets no email: it bounced for good, its owner reported spam, or an admin said so. */
export type SuppressionReason = 'bounced' | 'complained' | 'manual'

/**
 * Emails a person asked for, sent even when they once reported spam (but not when the address
 * bounced: it can't receive them).
 */
export const ASKED_FOR_TAGS: readonly string[] = [
  'password-reset',
  'invite',
  'verify-email',
  'password-changed',
]

/** Where the log is kept (`email-log`). */
export interface EmailLogStore {
  add(entry: EmailLogEntry): Promise<ID>
  update(id: ID, patch: Partial<EmailLogEntry>): Promise<void>
}

/** The log's key inside a queued email's JSON; not sent. */
const LOG_KEY = '$log'
const list = (value: string | readonly string[] | undefined) =>
  value === undefined ? [] : [value].flat()

/**
 * Sends email for Easy CMS and its plugins (form notifications, and more later). Set one in
 * the config as `email`, e.g. `smtp()` from `@easy-cms/email-smtp`, or `consoleEmail()` in
 * development. Throw to report a failure: the message is retried later.
 */
export interface EmailAdapter {
  /** What sends the email, e.g. `smtp`; shown to admins on the dashboard (System). */
  readonly name?: string
  /**
   * The adapter interface it is written for (`ADAPTER_API_VERSION`); Easy CMS refuses another.
   * Leave it out to skip the check.
   */
  readonly apiVersion?: number
  /** The sender when a message has none, e.g. `Easy CMS <no-reply@example.com>`. */
  readonly from?: string | undefined
  /**
   * Sends one email. Return the provider's id for it, if it has one: delivery events from the
   * provider's webhook name the email by it.
   */
  send(message: EmailMessage & { readonly from: string }): Promise<void | { readonly id?: string }>
  /**
   * The settings in use, shown to admins on Settings → Email. Never return secrets: say whether
   * a password is set, not what it is.
   */
  describe?(): readonly EmailSetting[]
  /** Checks the connection without sending (Settings → Email); throws with the reason. */
  verify?(): Promise<void>
}

/** One setting an email adapter shows to admins (`describe()`). */
export interface EmailSetting {
  /**
   * `host`, `port`, `secure`, `user`, `password`, `from` and `delivery` (`log`: printed, not sent)
   * are translated in the admin; others are shown as they are.
   */
  readonly key: string
  /** `null`: not set. */
  readonly value: string | null
  /** Where it comes from, e.g. `SMTP_HOST` or `smtp({ host })`. */
  readonly source?: string
}

/** Prints emails to the log instead of sending them: for development and tests. */
export function consoleEmail(options: { from?: string; log?: (text: string) => void } = {}) {
  const sent: (EmailMessage & { from: string })[] = []
  const adapter: EmailAdapter & { readonly sent: typeof sent } = {
    name: 'console',
    apiVersion: 1,
    // `log`: the admin says it prints to the server log instead of sending.
    describe: () => [{ key: 'delivery', value: 'log' }],
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
  /**
   * Writes `next` only if the entry still matches `current` (its state and next attempt): `false`
   * when another process claimed it first.
   */
  claim(id: ID, current: QueuedEmail, next: QueuedEmail): Promise<boolean>
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
  private readonly current: () => Promise<EmailAdapter | undefined>

  /**
   * `adapter`: the one to send with, or a function giving the one in use at each send (the one
   * an admin chose, else the config's).
   */
  constructor(
    adapter: EmailAdapter | undefined | (() => Promise<EmailAdapter | undefined>),
    private readonly logger: Logger,
    private readonly queue?: EmailQueue,
    private readonly log?: EmailLogStore,
    /** The addresses of these that get no email, and why. */
    private readonly suppressed?: (
      addresses: readonly string[],
    ) => Promise<ReadonlyMap<string, SuppressionReason>>,
  ) {
    this.current = typeof adapter === 'function' ? adapter : async () => adapter
  }

  /** Writes to the log; a failure there never stops the email. */
  private async logged<T>(write: () => Promise<T>): Promise<T | undefined> {
    try {
      return await write()
    } catch (error) {
      this.logger.error(`Could not write the email log: ${(error as Error).message}`, { error })
      return undefined
    }
  }
  private note(id: unknown, patch: Partial<EmailLogEntry>) {
    if (this.log && id !== undefined && id !== null)
      return this.logged(() => (this.log as EmailLogStore).update(id as ID, patch))
  }

  /** Told when an email is given up on (`delivery.failed`). */
  onGiveUp: ((detail: { to: string; error: string; attempts: number }) => void) | undefined

  /** The adapter that sends now. */
  adapter(): Promise<EmailAdapter | undefined> {
    return this.current()
  }

  /**
   * The message without the recipients on the suppression list (`null`: none left to send to),
   * and why the first one left out was.
   */
  private async withoutSuppressed(
    message: EmailMessage,
  ): Promise<{ message: EmailMessage | null; skipped: string | null }> {
    if (!this.suppressed) return { message, skipped: null }
    const all = [...list(message.to), ...list(message.cc), ...list(message.bcc)]
    let found: ReadonlyMap<string, SuppressionReason>
    try {
      found = await this.suppressed(all.map(addressOf))
    } catch (error) {
      // The list can't be read: send, rather than lose the email.
      this.logger.error(`Could not read the suppression list: ${(error as Error).message}`, {
        error,
      })
      return { message, skipped: null }
    }
    if (found.size === 0) return { message, skipped: null }
    const asked = message.tag !== undefined && ASKED_FOR_TAGS.includes(message.tag)
    let skipped: string | null = null
    const keep = (value: string | readonly string[] | undefined) =>
      list(value).filter((to) => {
        const reason = found.get(addressOf(to))
        if (!reason || (reason === 'complained' && asked)) return true
        skipped ??= `${addressOf(to)} is on the suppression list (${reason})`
        return false
      })
    const to = keep(message.to)
    if (to.length === 0) return { message: null, skipped }
    const cc = keep(message.cc)
    const bcc = keep(message.bcc)
    const { cc: _cc, bcc: _bcc, ...rest } = message
    return {
      message: {
        ...rest,
        to,
        ...(cc.length ? { cc } : {}),
        ...(bcc.length ? { bcc } : {}),
      },
      skipped,
    }
  }

  /**
   * Queues an email and sends it without waiting. Resolves once it is saved; `flush()` waits
   * for the sending too. Without an `email` adapter in the config, the email is skipped with a
   * warning.
   */
  async send(original: EmailMessage): Promise<void> {
    const adapter = await this.current()
    if (!adapter) {
      this.logger.warn(
        `Email "${original.subject}" not sent: set \`email\` in the config (e.g. consoleEmail() in development), or choose a provider on the Integrations page`,
      )
      return
    }
    const checked = await this.withoutSuppressed(original)
    if (!checked.message) {
      this.logger.warn(`Email "${original.subject}" not sent: ${checked.skipped}`)
      if (this.log)
        await this.logged(() =>
          (this.log as EmailLogStore).add({
            to: list(original.to).join(', '),
            cc: list(original.cc).join(', ') || null,
            bcc: list(original.bcc).length,
            subject: original.subject,
            tag: original.tag ?? null,
            state: 'skipped',
            attempts: 0,
            error: checked.skipped,
            adapter: adapter.name ?? 'email',
            sentAt: null,
          }),
        )
      return
    }
    const message = checked.message
    const logId = this.log
      ? await this.logged(() =>
          (this.log as EmailLogStore).add({
            to: list(message.to).join(', '),
            cc: list(message.cc).join(', ') || null,
            bcc: list(message.bcc).length,
            subject: message.subject,
            tag: message.tag ?? null,
            state: 'pending',
            attempts: 0,
            error: null,
            adapter: adapter.name ?? 'email',
            sentAt: null,
          }),
        )
      : undefined
    const body = JSON.stringify(logId === undefined ? message : { ...message, [LOG_KEY]: logId })
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
      this.logger.error(`Could not save email: ${(error as Error).message}`, { error })
    }
    this.track(this.deliver(message, body, id))
  }

  /** Emails are being sent right now. */
  get busy(): boolean {
    return this.pending.size > 0
  }

  /** Waits for emails being sent, e.g. before a serverless function returns. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending])
  }

  /** Sends queued emails that are due for another attempt. Runs with scheduled jobs. */
  async retry(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
    if (!this.queue || !(await this.current())) return { sent: 0, failed: 0 }
    let sent = 0
    let failed = 0
    for (const { id, ...queued } of await this.queue.due(now, 50)) {
      const attempts = queued.attempts + 1
      // Claim it first: another process retrying at the same time skips it.
      const claimed = await this.queue.claim(id, queued, {
        ...queued,
        attempts,
        nextAttemptAt: later(now, CLAIM),
      })
      if (!claimed) continue
      const parsed = JSON.parse(queued.message) as EmailMessage & { [LOG_KEY]?: ID }
      const { error, sent: done } = await this.attempt(parsed)
      if (!error) {
        await this.queue.remove(id)
        await this.note(parsed[LOG_KEY], {
          state: 'sent',
          attempts,
          error: null,
          sentAt: new Date().toISOString(),
          ...done,
        })
        sent++
        continue
      }
      const delay = QUEUE_DELAYS[attempts - 1]
      if (delay === undefined) {
        failed++
        this.logger.error(`Email gave up after ${attempts} attempts: ${error}`)
        const sent = JSON.parse(queued.message) as EmailMessage
        this.onGiveUp?.({ to: [sent.to].flat().join(', '), error, attempts })
      }
      await this.queue.update(id, {
        ...queued,
        attempts,
        nextAttemptAt: later(now, delay ?? 0),
        state: delay === undefined ? 'failed' : 'pending',
        error,
      })
      await this.note(parsed[LOG_KEY], {
        state: delay === undefined ? 'failed' : 'pending',
        attempts,
        error,
      })
    }
    return { sent, failed }
  }

  /** One attempt now for a saved email (the admin's Retry): `undefined` when sent, else the error. */
  async sendNow(message: string): Promise<string | undefined> {
    if (!(await this.current())) return 'email is not set up (`email` in the config)'
    const parsed = JSON.parse(message) as EmailMessage & { [LOG_KEY]?: ID }
    const { error, sent } = await this.attempt(parsed)
    await this.note(
      parsed[LOG_KEY],
      error ? { error } : { state: 'sent', error: null, sentAt: new Date().toISOString(), ...sent },
    )
    return error
  }

  private track(delivery: Promise<void>) {
    const tracked = delivery
      .catch((error) =>
        this.logger.error(`Email queue failed: ${(error as Error).message}`, { error }),
      )
      .finally(() => this.pending.delete(tracked))
    this.pending.add(tracked)
  }

  private async deliver(message: EmailMessage, body: string, id: ID | undefined) {
    const logId = (JSON.parse(body) as { [LOG_KEY]?: ID })[LOG_KEY]
    const { error, sent } = await this.attempt(message)
    if (!error) {
      if (id !== undefined) await this.queue?.remove(id)
      await this.note(logId, {
        state: 'sent',
        attempts: 1,
        sentAt: new Date().toISOString(),
        ...sent,
      })
      return
    }
    if (id === undefined || !this.queue) {
      this.logger.error(`Email "${message.subject}" failed: ${error}`)
      await this.note(logId, { state: 'failed', attempts: 1, error })
      return
    }
    await this.note(logId, { state: 'pending', attempts: 1, error })
    this.logger.warn(`Email "${message.subject}" failed, retrying later: ${error}`)
    await this.queue.update(id, {
      message: body,
      attempts: 1,
      nextAttemptAt: later(new Date(), QUEUE_DELAYS[0] as number),
      state: 'pending',
      error,
    })
  }

  /**
   * Sends with the adapter in use now (an admin may have chosen another since the email was
   * queued): the error, or what the log keeps of the send.
   */
  private async attempt(
    message: EmailMessage,
  ): Promise<{ error?: string; sent?: Partial<EmailLogEntry> }> {
    let adapter: EmailAdapter | undefined
    try {
      adapter = await this.current()
    } catch (error) {
      return { error: (error as Error).message || String(error) }
    }
    if (!adapter) return { error: 'email is not set up' }
    const from = message.from ?? adapter.from
    if (!from) return { error: 'no sender: set `from` on the message or the email adapter' }
    // What the log and the admin use stays here.
    const { tag: _tag, [LOG_KEY]: _log, ...email } = message as EmailMessage & { [LOG_KEY]?: ID }
    try {
      const result = await adapter.send({ ...email, from })
      const providerId = result && typeof result.id === 'string' ? result.id : null
      return { sent: { adapter: adapter.name ?? 'email', ...(providerId ? { providerId } : {}) } }
    } catch (error) {
      return { error: (error as Error).message || String(error) }
    }
  }
}

/** The address of `Name <address>`, lowercased: how the suppression list keeps it. */
export function addressOf(value: string): string {
  const match = /<([^<>]+)>\s*$/.exec(value)
  return (match ? (match[1] as string) : value).trim().toLowerCase()
}
