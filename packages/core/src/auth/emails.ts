import type { AuthUser } from '../access.js'

/** What the email functions in `auth.emails` receive. */
export interface PasswordEmailArgs {
  readonly user: AuthUser
  /** The page that sets the password; absent for `passwordChanged`. */
  readonly url?: string
  /** The admin language for the text: `en` or `th`. */
  readonly locale: string
  /** When the link stops working. */
  readonly expiresAt?: Date
}

/** An email's content: a subject, and text and/or HTML. */
export interface PasswordEmail {
  readonly subject: string
  readonly text: string
  readonly html?: string
}

export type PasswordEmailFn = (args: PasswordEmailArgs) => PasswordEmail | Promise<PasswordEmail>

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

/** A short email with one button: text and HTML from the same lines. */
function email(subject: string, lines: string[], button?: { label: string; url: string }) {
  const text = [...lines, ...(button ? ['', button.url] : [])].join('\n')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1f2328">${lines
    .map((line) => `<p>${esc(line)}</p>`)
    .join('')}${
    button
      ? `<p><a href="${esc(button.url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#2f6f5e;color:#fff;text-decoration:none;font-weight:600">${esc(button.label)}</a></p><p style="font-size:13px;color:#656d76">${esc(button.url)}</p>`
      : ''
  }</div>`
  return { subject, text, html }
}

const hours = (expiresAt: Date | undefined) =>
  Math.max(1, Math.round(((expiresAt?.getTime() ?? Date.now()) - Date.now()) / 3_600_000))
const days = (expiresAt: Date | undefined) => Math.max(1, Math.round(hours(expiresAt) / 24))

/** The default emails, in English and Thai. */
export const DEFAULT_PASSWORD_EMAILS: {
  resetPassword: PasswordEmailFn
  invite: PasswordEmailFn
  passwordChanged: PasswordEmailFn
} = {
  resetPassword: ({ url = '', locale, expiresAt }) =>
    locale === 'th'
      ? email(
          'ตั้งรหัสผ่านใหม่',
          [
            'มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ',
            `ลิงก์นี้ใช้ได้ครั้งเดียวภายใน ${hours(expiresAt)} ชั่วโมง ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้`,
          ],
          { label: 'ตั้งรหัสผ่านใหม่', url },
        )
      : email(
          'Reset your password',
          [
            'Someone asked to reset the password of your account.',
            `The link works once, within ${hours(expiresAt)} hour(s). If it wasn't you, ignore this email: your password stays the same.`,
          ],
          { label: 'Set a new password', url },
        ),
  invite: ({ url = '', locale, expiresAt, user }) =>
    locale === 'th'
      ? email(
          'คุณได้รับเชิญให้ใช้งานระบบจัดการเนื้อหา',
          [
            `มีบัญชีสำหรับ ${user.email} รอคุณอยู่ ตั้งรหัสผ่านเพื่อเริ่มใช้งาน`,
            `ลิงก์นี้ใช้ได้ภายใน ${days(expiresAt)} วัน`,
          ],
          { label: 'ตั้งรหัสผ่าน', url },
        )
      : email(
          "You're invited to the content admin",
          [
            `An account for ${user.email} is waiting for you. Set a password to start.`,
            `The link works within ${days(expiresAt)} day(s).`,
          ],
          { label: 'Set your password', url },
        ),
  passwordChanged: ({ locale }) =>
    locale === 'th'
      ? email('รหัสผ่านของคุณถูกเปลี่ยนแล้ว', [
          'รหัสผ่านของบัญชีคุณเพิ่งถูกเปลี่ยน และทุกเครื่องที่ login อยู่ถูกออกจากระบบแล้ว',
          'ถ้าคุณไม่ได้เปลี่ยนเอง ให้ขอตั้งรหัสผ่านใหม่ทันทีและแจ้งผู้ดูแลระบบ',
        ])
      : email('Your password was changed', [
          'The password of your account was just changed, and every device that was logged in has been signed out.',
          "If it wasn't you, reset your password now and tell your administrator.",
        ]),
}
