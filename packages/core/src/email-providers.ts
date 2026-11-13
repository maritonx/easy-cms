// Email providers chosen in the admin (#404): integrations of category `email` (Resend, Postmark,
// SMTP…) whose connections can send the site's email instead of the config's `email`, which stays
// the default. Their webhooks say what happened to each email, and bounces and spam reports keep
// an address off the suppression list.

import type { AuthUser, ID, Where } from './access.js'
import { isSystemAdmin } from './access.js'
import { getSetting, setSetting } from './admin-settings.js'
import { secretsOf } from './auth/tokens.js'
import { EMAIL_LOG, EMAIL_SUPPRESSIONS } from './builtins.js'
import type { Config } from './config.js'
import { isEmail } from './document.js'
import { addressOf, type EmailAdapter, type SuppressionReason } from './email.js'
import { ForbiddenError, NotFoundError, QueryError, ValidationError } from './errors.js'
import type { Label } from './fields.js'
import type {
  IntegrationConfig,
  IntegrationField,
  IntegrationLogo,
  IntegrationTestResult,
} from './integrations.js'
import type { EasyCMS } from './local-api.js'
import { hmac, safeEqual } from './runtime/crypto.js'

/** What a provider's webhook says happened to an email it sent. */
export interface EmailEvent {
  /** The provider's id for the email: what `send()` returned. */
  readonly id: string
  readonly type: 'delivered' | 'bounced' | 'complained'
  /** The recipient it is about. */
  readonly address: string
  /** For `bounced`: `false` for a bounce that may pass (a full mailbox); it isn't kept. */
  readonly permanent?: boolean
  /** When, as ISO 8601. Default: now. */
  readonly at?: string
  /** The provider's words, e.g. why it bounced. */
  readonly detail?: string
}

/** A webhook request as a provider's `events` reads it. */
export interface EmailWebhookRequest {
  readonly headers: Headers
  /** The raw body, as signatures are made over it. */
  readonly body: string
}

/** An email provider an admin can connect and send with (`defineEmailProvider`). */
export interface EmailProvider {
  /** Lowercase letters, digits and `-`, e.g. `resend`. */
  readonly id: string
  readonly label: Label
  readonly description?: Label
  readonly icon?: string | IntegrationLogo
  readonly docs?: string
  /** The package it comes from, e.g. `@easy-cms/plugin-email`. */
  readonly plugin?: string
  /** What to fill in, e.g. an API key. A `from` field (the sender) is added after these. */
  readonly fields: readonly IntegrationField[]
  /** Environment variables by field (they win over the admin), e.g. `{ apiKey: 'RESEND_API_KEY' }`. */
  readonly env?: Readonly<Record<string, string>>
  /** The adapter that sends with these values (`from` among them). */
  readonly create: (values: Readonly<Record<string, string>>) => EmailAdapter
  /** Checks the values without sending, e.g. that the API key works. */
  readonly test?: (
    values: Readonly<Record<string, string>>,
  ) => Promise<IntegrationTestResult> | IntegrationTestResult
  /**
   * Delivery events from the provider's webhook. Throw when the request isn't the provider's
   * (a wrong signature): it is refused.
   */
  readonly events?: (
    request: EmailWebhookRequest,
    values: Readonly<Record<string, string>>,
  ) => readonly EmailEvent[] | Promise<readonly EmailEvent[]>
  /** How to add the webhook at the provider, shown with its URL in the admin. */
  readonly webhookSetup?: Label
}

const FROM_FIELD: IntegrationField = {
  name: 'from',
  label: { en: 'Send as', th: 'ส่งในนาม' },
  description: {
    en: 'e.g. My site <hello@example.com>: an address on a domain verified with the provider',
    th: 'เช่น My site <hello@example.com> ที่อยู่ต้องอยู่บนโดเมนที่ยืนยันกับผู้ให้บริการแล้ว',
  },
  placeholder: 'My site <hello@example.com>',
  required: true,
}

/** An email provider as an integration (category `email`), for `integrations` in a plugin. */
export function defineEmailProvider(provider: EmailProvider): IntegrationConfig {
  return {
    id: provider.id,
    label: provider.label,
    category: 'email',
    ...(provider.description ? { description: provider.description } : {}),
    ...(provider.icon ? { icon: provider.icon } : {}),
    ...(provider.docs ? { docs: provider.docs } : {}),
    ...(provider.plugin ? { plugin: provider.plugin } : {}),
    kind: 'fields',
    fields: [...provider.fields, FROM_FIELD],
    ...(provider.env ? { env: provider.env } : {}),
    ...(provider.test
      ? {
          test: (values: Readonly<Record<string, string>>) =>
            provider.test?.(values) ?? { ok: true },
        }
      : {}),
    email: {
      create: (values) => {
        const adapter = provider.create(values)
        return {
          ...adapter,
          name: provider.id,
          from: values.from || adapter.from,
          send: adapter.send.bind(adapter),
        }
      },
      ...(provider.events ? { events: provider.events } : {}),
      ...(provider.webhookSetup ? { webhookSetup: provider.webhookSetup } : {}),
    },
  }
}

/** The site sends email: an `email` adapter in the config, or providers to choose in the admin. */
export function hasEmail(config: Pick<Config, 'email' | 'integrations'>): boolean {
  return config.email !== undefined || (config.integrations ?? []).some((i) => i.email)
}

/** The connection an admin chose to send with. */
export interface ActiveEmail {
  integration: string
  connection: ID | 'env'
}

const SETTING = 'email'
/** Each server reads the admin's choice again after this long. */
const CACHE_MS = 30_000

/** Bounced and complained beat delivered; the first of those two stays. */
const RANK = { delivered: 1, bounced: 2, complained: 2 } as const

/** The email providers of a site: the one in use, its webhooks, the suppression list. */
export class EmailProviders {
  private cached: {
    at: number
    adapter: EmailAdapter | undefined
    active: ActiveEmail | null
  } | null = null

  constructor(private readonly cms: EasyCMS) {}

  /** The integrations that send email. */
  get definitions(): IntegrationConfig[] {
    return this.cms.config.integrations.filter((d) => d.email)
  }
  private definition(id: string): IntegrationConfig {
    const def = this.definitions.find((d) => d.id === id)
    if (!def) throw new NotFoundError('integrations', id)
    return def
  }

  /** The admin's choice, if any. */
  async active(): Promise<ActiveEmail | null> {
    if (this.definitions.length === 0) return null
    const saved = await getSetting<ActiveEmail | null>(this.cms, SETTING).catch(() => undefined)
    return saved?.integration ? saved : null
  }

  /**
   * The adapter that sends now: the connection an admin chose (read again every 30 seconds, so
   * every server follows a change), else the config's `email`.
   */
  async adapter(): Promise<EmailAdapter | undefined> {
    const now = Date.now()
    if (this.cached && now - this.cached.at < CACHE_MS) return this.cached.adapter
    const active = await this.active()
    let adapter = this.cms.config.email
    if (active) {
      try {
        adapter = await this.build(active)
      } catch (error) {
        this.cms.logger.error(
          `The email provider chosen in the admin can't be used, so the config's is: ${(error as Error).message}`,
          { error },
        )
      }
    }
    this.cached = { at: now, adapter, active }
    return adapter
  }

  private async build(active: ActiveEmail): Promise<EmailAdapter> {
    const def = this.definition(active.integration)
    const connection = await this.cms.integrations.byId(active.integration, active.connection)
    if (!connection) throw new Error(`${active.integration}: that connection is gone`)
    const email = def.email
    if (!email) throw new Error(`${active.integration} doesn't send email`)
    return email.create(connection.values, { cms: this.cms })
  }

  /**
   * Sends with a connection from now on, after a test email to the admin went out with it;
   * `null` goes back to the config's `email`. Audit-logged.
   */
  async use(
    user: AuthUser,
    choice: { integration: string; connection: ID | 'env' } | null,
    locale?: string,
  ): Promise<{ active: ActiveEmail | null; sentTo?: string }> {
    if (!isSystemAdmin(user)) throw new ForbiddenError()
    if (!choice) {
      await setSetting(this.cms, SETTING, null)
      this.cached = null
      await this.cms.audit.record({
        action: 'email.provider',
        target: 'email',
        user,
        detail: { provider: 'code' },
      })
      return { active: null }
    }
    const adapter = await this.build(choice).catch((error: Error) => {
      throw new ValidationError('email', [{ field: 'connection', message: error.message }])
    })
    const to = String(user.email ?? '')
    if (!isEmail(to))
      throw new ValidationError('email', [
        { field: 'to', message: 'your account has no email address' },
      ])
    const from = adapter.from
    if (!from) throw new ValidationError('email', [{ field: 'from', message: 'is required' }])
    const site = this.cms.config.admin.brand.name || 'Easy CMS'
    const th = locale === 'th' || (locale !== 'en' && this.cms.config.admin.locale === 'th')
    const label = this.labelOf(choice.integration)
    try {
      await adapter.send({
        to,
        from,
        subject: th ? `${site} ส่งอีเมลด้วย ${label} แล้ว` : `${site} now sends email with ${label}`,
        text: th
          ? `อีเมลทดสอบนี้ส่งด้วย ${label} จากผู้ส่ง ${from}\nตั้งแต่นี้อีเมลของ ${site} จะส่งด้วยบัญชีนี้\n\nเปลี่ยนโดย: ${to}`
          : `This test email was sent with ${label}, from ${from}.\nFrom now on ${site} sends its email with it.\n\nChanged by: ${to}`,
      })
    } catch (error) {
      throw new ValidationError('email', [
        {
          field: 'connection',
          message: `The test email to ${to} wasn't sent, so nothing changed: ${(error as Error).message}`,
        },
      ])
    }
    const active: ActiveEmail = { integration: choice.integration, connection: choice.connection }
    await setSetting(this.cms, SETTING, active)
    this.cached = null
    await this.cms.audit.record({
      action: 'email.provider',
      target: 'email',
      user,
      detail: { provider: choice.integration, connection: String(choice.connection) },
    })
    return { active, sentTo: to }
  }

  private labelOf(id: string): string {
    const label = this.definitions.find((d) => d.id === id)?.label ?? id
    return typeof label === 'string' ? label : (label.en ?? id)
  }

  /** Refuses to remove or turn off the connection that sends the site's email. */
  async guard(integration: string, connection?: ID | 'env'): Promise<void> {
    const active = await this.active()
    if (!active || active.integration !== integration) return
    if (connection !== undefined && String(active.connection) !== String(connection)) return
    throw new ValidationError('connections', [
      {
        field: 'connection',
        message:
          "This sends the site's email: choose another first (Integrations → Email), or go back to the code's",
      },
    ])
  }

  // --- Webhooks ----------------------------------------------------------------------------------

  /** The secret part of a connection's webhook URL. Changing `secret` changes it. */
  webhookToken(
    integration: string,
    connection: ID | 'env',
    secret = this.cms.config.secret,
  ): string {
    return hmac(secret, `email-webhook:${integration}:${connection}`, 'base64url').slice(0, 32)
  }

  /** The URL a provider posts delivery events to, for a connection. */
  webhookUrl(base: string, integration: string, connection: ID | 'env'): string {
    return `${base}/${integration}/webhook/${this.webhookToken(integration, connection)}`
  }

  /** Which connection a webhook token belongs to (tokens of earlier secrets still work). */
  private async connectionOf(integration: string, token: string) {
    for (const connection of await this.cms.integrations.connectionsOf(integration))
      for (const secret of secretsOf(this.cms.config)) {
        if (safeEqual(this.webhookToken(integration, connection.id, secret), token))
          return connection
      }
    return null
  }

  /**
   * Delivery events posted to a connection's webhook: the log says what happened, and bounces
   * and spam reports put the address on the suppression list.
   */
  async receive(integration: string, token: string, request: EmailWebhookRequest) {
    const def = this.definitions.find((d) => d.id === integration)
    const events = def?.email?.events
    if (!def || !events) throw new NotFoundError('integrations', integration)
    const connection = await this.connectionOf(integration, token)
    if (!connection) throw new ForbiddenError()
    let parsed: readonly EmailEvent[]
    try {
      parsed = await events(request, connection.values)
    } catch (error) {
      throw new QueryError(`Not a ${integration} webhook: ${(error as Error).message}`)
    }
    let recorded = 0
    for (const event of parsed) if (await this.record(integration, event)) recorded++
    return { received: parsed.length, recorded }
  }

  private async record(integration: string, event: EmailEvent): Promise<boolean> {
    if (event.type === 'bounced' && event.permanent === false) return false
    const at =
      event.at && !Number.isNaN(Date.parse(event.at))
        ? new Date(event.at).toISOString()
        : new Date().toISOString()
    let subject: string | null = null
    if (this.cms.config.collections.some((c) => c.slug === EMAIL_LOG) && event.id) {
      const { docs } = await this.cms.db.find({
        collection: EMAIL_LOG,
        where: { providerId: { equals: event.id } },
        sort: ['-createdAt'],
        limit: 1,
        page: 1,
      })
      const row = docs[0]
      if (row) {
        subject = typeof row.subject === 'string' ? row.subject : null
        const before = RANK[row.delivery as keyof typeof RANK] ?? 0
        if (RANK[event.type] > before) {
          const { id, ...rest } = row
          await this.cms.db.update({
            collection: EMAIL_LOG,
            id,
            data: {
              ...rest,
              delivery: event.type,
              deliveryAt: at,
              ...(event.type !== 'delivered' && event.detail
                ? { error: event.detail.slice(0, 500) }
                : {}),
              updatedAt: new Date().toISOString(),
            },
          })
        }
      }
    }
    if (event.type === 'delivered') return true
    await this.suppress(event.address, event.type, event.detail ?? null, integration)
    this.cms.systemEvent(event.type === 'bounced' ? 'email.bounced' : 'email.complained', {
      to: addressOf(event.address),
      subject,
      reason: event.detail ?? null,
      integration,
    })
    return true
  }

  // --- The suppression list ----------------------------------------------------------------------

  private get listed(): boolean {
    return this.cms.config.collections.some((c) => c.slug === EMAIL_SUPPRESSIONS)
  }

  /** Which of these addresses get no email, and why. */
  async suppressed(addresses: readonly string[]): Promise<Map<string, SuppressionReason>> {
    const out = new Map<string, SuppressionReason>()
    const wanted = [...new Set(addresses.map(addressOf))].filter(Boolean)
    if (!this.listed || wanted.length === 0) return out
    const { docs } = await this.cms.db.find({
      collection: EMAIL_SUPPRESSIONS,
      where: { address: { in: wanted } },
      sort: ['id'],
      limit: 0,
      page: 1,
    })
    for (const row of docs) out.set(String(row.address), row.reason as SuppressionReason)
    return out
  }

  /** Keeps an address off the site's email; a bounce wins over an earlier reason. */
  async suppress(
    address: string,
    reason: SuppressionReason,
    detail: string | null,
    source: string,
  ) {
    if (!this.listed) return
    const key = addressOf(address)
    const { docs } = await this.cms.db.find({
      collection: EMAIL_SUPPRESSIONS,
      where: { address: { equals: key } },
      sort: ['id'],
      limit: 1,
      page: 1,
    })
    const now = new Date().toISOString()
    const row = docs[0]
    if (row) {
      if (row.reason === 'bounced' || row.reason === reason) return
      const { id, ...rest } = row
      await this.cms.db.update({
        collection: EMAIL_SUPPRESSIONS,
        id,
        data: { ...rest, reason, detail, source, updatedAt: now },
      })
      return
    }
    await this.cms.db.create({
      collection: EMAIL_SUPPRESSIONS,
      data: { address: key, reason, detail, source, createdAt: now, updatedAt: now },
    })
  }

  /** The list, newest first; `q` finds addresses. */
  async list(q?: string, page = 1) {
    if (!this.listed) return { enabled: false, docs: [], page: 1, totalPages: 0, totalDocs: 0 }
    const where: Where | undefined = q?.trim()
      ? { address: { like: q.trim().toLowerCase() } }
      : undefined
    const found = await this.cms.db.find({
      collection: EMAIL_SUPPRESSIONS,
      ...(where ? { where } : {}),
      sort: ['-createdAt'],
      limit: 50,
      page,
    })
    return {
      enabled: true,
      docs: found.docs.map((d) => ({
        id: d.id,
        address: String(d.address),
        reason: d.reason as SuppressionReason,
        detail: (d.detail as string | null) ?? null,
        source: (d.source as string | null) ?? null,
        createdAt: String(d.createdAt),
      })),
      page,
      totalPages: found.totalPages,
      totalDocs: found.totalDocs,
    }
  }

  /** An admin adds an address. Audit-logged. */
  async add(user: AuthUser, address: unknown) {
    if (!this.listed) throw new NotFoundError(EMAIL_SUPPRESSIONS, '')
    const value = typeof address === 'string' ? addressOf(address) : ''
    if (!isEmail(value))
      throw new ValidationError(EMAIL_SUPPRESSIONS, [
        { field: 'address', message: 'must be an email address' },
      ])
    await this.suppress(value, 'manual', null, String(user.email ?? user.id))
    await this.cms.audit.record({
      action: 'email.suppress',
      target: 'email',
      user,
      detail: { address: addressOf(value) },
    })
    return { address: addressOf(value) }
  }

  /** An admin takes an address off: it gets email again. Audit-logged. */
  async remove(user: AuthUser, id: ID) {
    if (!this.listed) throw new NotFoundError(EMAIL_SUPPRESSIONS, id)
    const row = await this.cms.db.findById({ collection: EMAIL_SUPPRESSIONS, id })
    if (!row) throw new NotFoundError(EMAIL_SUPPRESSIONS, id)
    await this.cms.db.delete({ collection: EMAIL_SUPPRESSIONS, id })
    await this.cms.audit.record({
      action: 'email.unsuppress',
      target: 'email',
      user,
      detail: { address: String(row.address) },
    })
    return { deleted: 1 }
  }
}
