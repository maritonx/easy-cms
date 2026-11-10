import type { ID, Where } from '../access.js'
import { EMAIL_LOG, EMAIL_SUPPRESSIONS } from '../builtins.js'
import { isEmail } from '../document.js'
import type { EmailAdapter, EmailLogEntry, EmailSetting } from '../email.js'
import { TooManyRequestsError, ValidationError } from '../errors.js'
import type { EasyCMS } from '../local-api.js'

/** Settings → Email in the admin (`GET <api>/admin/email`). */
export interface AdminEmail {
  /** An `email` adapter is set in the config. */
  configured: boolean
  /** The adapter's name, e.g. `smtp`; `custom` when it has none. */
  name: string | null
  /** The default sender. */
  from: string | null
  /** What the adapter tells about itself (`describe()`), never secrets. */
  settings: EmailSetting[]
  /** The adapter can check its connection without sending (`verify()`). */
  canVerify: boolean
  /**
   * With email providers (`@easy-cms/plugin-email`): the connection an admin chose to send with
   * (`null`: the config's `email`, named by `code`).
   */
  providers?: {
    active: { integration: string; connection: ID | 'env'; label: string } | null
    code: string | null
  }
  /** The suppression list is kept. */
  suppressions: boolean
}

/**
 * A connection check or test email. `logged`: the adapter only prints emails to the server log
 * (`describe()` says `delivery: log`, as `consoleEmail()` does), so nothing was sent.
 */
export type EmailCheck = { ok: true; logged?: true } | { ok: false; error: string }

/** Test emails per admin in `WINDOW`: enough to fix settings, not to send mail with. */
const LIMIT = 5
const WINDOW = 10 * 60_000
/** Per CMS (one process can run several) and per admin. */
const sentAt = new WeakMap<EasyCMS, Map<string, number[]>>()

/** The adapter prints emails to the log instead of sending them (`delivery: log`). */
function logsOnly(adapter: EmailAdapter | undefined) {
  try {
    return (adapter?.describe?.() ?? []).some((s) => s.key === 'delivery' && s.value === 'log')
  } catch {
    return false
  }
}

const message = (error: unknown) =>
  error instanceof Error ? error.message || error.name : String(error)

export async function adminEmail(cms: EasyCMS): Promise<AdminEmail> {
  const adapter = await cms.emailAdapter().catch(() => undefined)
  const suppressions = cms.config.collections.some((c) => c.slug === EMAIL_SUPPRESSIONS)
  let providers: AdminEmail['providers']
  if (cms.emailProviders.definitions.length > 0) {
    const active = await cms.emailProviders.active()
    let label: string | null = null
    if (active) {
      const def = cms.emailProviders.definitions.find((d) => d.id === active.integration)
      const name = (await cms.integrations.byId(active.integration, active.connection))?.name
      const title =
        typeof def?.label === 'string' ? def.label : (def?.label.en ?? active.integration)
      label = name ? `${title} · ${name}` : title
    }
    providers = {
      active: active && label ? { ...active, label } : null,
      code: cms.config.email ? (cms.config.email.name ?? 'custom') : null,
    }
  }
  if (!adapter)
    return {
      configured: false,
      name: null,
      from: null,
      settings: [],
      canVerify: false,
      ...(providers ? { providers } : {}),
      suppressions,
    }
  let settings: EmailSetting[] = []
  try {
    settings = [...(adapter.describe?.() ?? [])].map((s) => ({
      key: String(s.key),
      value: s.value === null || s.value === undefined ? null : String(s.value),
      ...(s.source ? { source: String(s.source) } : {}),
    }))
  } catch {
    // An adapter that can't describe itself still sends.
  }
  return {
    configured: true,
    name: adapter.name ?? 'custom',
    from: adapter.from ?? null,
    settings,
    canVerify: typeof adapter.verify === 'function',
    ...(providers ? { providers } : {}),
    suppressions,
  }
}

/** Connects (and logs in) without sending. */
export async function verifyEmail(cms: EasyCMS): Promise<EmailCheck> {
  const adapter = await cms.emailAdapter()
  if (!adapter?.verify)
    return { ok: false, error: 'This email adapter cannot check its connection' }
  try {
    await adapter.verify()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

/** Sends a test email now, not through the queue, so the answer is the server's own. */
export async function sendTestEmail(
  cms: EasyCMS,
  user: { id: ID; email: string },
  to: unknown,
  locale: unknown,
): Promise<EmailCheck> {
  const adapter = await cms.emailAdapter()
  if (!adapter) return { ok: false, error: 'Email is not set up (`email` in the config)' }
  const address = typeof to === 'string' && to.trim() ? to.trim() : user.email
  if (!isEmail(address))
    throw new ValidationError('email', [{ field: 'to', message: 'must be an email address' }])
  const times = sentAt.get(cms) ?? new Map<string, number[]>()
  sentAt.set(cms, times)
  const key = String(user.id)
  const now = Date.now()
  const recent = (times.get(key) ?? []).filter((t) => now - t < WINDOW)
  if (recent.length >= LIMIT)
    throw new TooManyRequestsError('Too many test emails: try again in a few minutes')
  times.set(key, [...recent, now])

  const from = adapter.from
  if (!from) return { ok: false, error: 'No sender: set `from` on the email adapter' }
  const site = cms.config.admin.brand.name || 'Easy CMS'
  const th = locale === 'th' || (locale !== 'en' && cms.config.admin.locale === 'th')
  const time = new Date().toISOString()
  const subject = th ? `อีเมลทดสอบจาก ${site}` : `Test email from ${site}`
  const text = th
    ? `อีเมลนี้ส่งจากหน้า ตั้งค่า → อีเมล ของ ${site} เพื่อทดสอบการตั้งค่า\n\nส่งโดย: ${user.email}\nAdapter: ${adapter.name ?? 'custom'}\nผู้ส่ง: ${from}\nเวลา: ${time}`
    : `This email was sent from Settings → Email in ${site} to test the settings.\n\nSent by: ${user.email}\nAdapter: ${adapter.name ?? 'custom'}\nFrom: ${from}\nTime: ${time}`
  try {
    await adapter.send({ to: address, subject, text, from })
    return logsOnly(adapter) ? { ok: true, logged: true } : { ok: true }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

/** Settings → Email's log of emails sent (`GET <api>/admin/email/log`). */
export interface AdminEmailLog {
  /** `emailLog` isn't `false` and there is an `email` adapter. */
  enabled: boolean
  keepDays: number
  docs: (EmailLogEntry & { id: ID; createdAt: string })[]
  page: number
  totalPages: number
  totalDocs: number
  /** The kinds of email in the log, for the filter. */
  tags: string[]
  /** Delivery events come in: the log can be narrowed by them. */
  deliveries: boolean
}

const LOG_PAGE = 50

/** The log, newest first: `state`, `tag` and `q` (recipient or subject) narrow it; 50 a page. */
export async function adminEmailLog(cms: EasyCMS, url: URL): Promise<AdminEmailLog> {
  const enabled = cms.config.collections.some((c) => c.slug === EMAIL_LOG)
  const keepDays = (cms.config.emailLog === false ? undefined : cms.config.emailLog?.keepDays) ?? 30
  if (!enabled)
    return {
      enabled,
      keepDays,
      docs: [],
      page: 1,
      totalPages: 0,
      totalDocs: 0,
      tags: [],
      deliveries: false,
    }
  const state = url.searchParams.get('state')
  const tag = url.searchParams.get('tag')
  const q = url.searchParams.get('q')?.trim()
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const where: Where[] = []
  if (state === 'sent' || state === 'pending' || state === 'failed' || state === 'skipped')
    where.push({ state: { equals: state } })
  const delivery = url.searchParams.get('delivery')
  if (delivery === 'delivered' || delivery === 'bounced' || delivery === 'complained')
    where.push({ delivery: { equals: delivery } })
  if (tag) where.push({ tag: { equals: tag } })
  if (q) where.push({ or: [{ to: { like: q } }, { subject: { like: q } }] })
  const found = await cms.db.find({
    collection: EMAIL_LOG,
    ...(where.length ? { where: { and: where } } : {}),
    sort: ['-createdAt'],
    limit: LOG_PAGE,
    page,
  })
  const recent = await cms.db.find({
    collection: EMAIL_LOG,
    sort: ['-createdAt'],
    limit: 500,
    page: 1,
  })
  const tags = [
    ...new Set(recent.docs.map((d) => d.tag).filter((t): t is string => typeof t === 'string')),
  ].sort()
  return {
    enabled,
    keepDays,
    docs: found.docs as unknown as AdminEmailLog['docs'],
    page,
    totalPages: found.totalPages,
    totalDocs: found.totalDocs,
    tags,
    deliveries: cms.emailProviders.definitions.some((d) => d.email?.events),
  }
}
