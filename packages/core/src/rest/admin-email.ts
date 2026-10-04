import type { ID } from '../access.js'
import type { EmailSetting } from '../email.js'
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
}

export type EmailCheck = { ok: true } | { ok: false; error: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Test emails per admin in `WINDOW`: enough to fix settings, not to send mail with. */
const LIMIT = 5
const WINDOW = 10 * 60_000
/** Per CMS (one process can run several) and per admin. */
const sentAt = new WeakMap<EasyCMS, Map<string, number[]>>()

const message = (error: unknown) =>
  error instanceof Error ? error.message || error.name : String(error)

export function adminEmail(cms: EasyCMS): AdminEmail {
  const adapter = cms.config.email
  if (!adapter) return { configured: false, name: null, from: null, settings: [], canVerify: false }
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
  }
}

/** Connects (and logs in) without sending. */
export async function verifyEmail(cms: EasyCMS): Promise<EmailCheck> {
  const adapter = cms.config.email
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
  const adapter = cms.config.email
  if (!adapter) return { ok: false, error: 'Email is not set up (`email` in the config)' }
  const address = typeof to === 'string' && to.trim() ? to.trim() : user.email
  if (!EMAIL.test(address))
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
    return { ok: true }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}
