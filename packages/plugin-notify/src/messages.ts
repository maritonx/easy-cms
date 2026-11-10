import type { EventMessage } from '@easy-cms/core'

export type Language = 'en' | 'th'

/** The events admins can be told about. */
export const NOTIFY_EVENTS = [
  'form.submitted',
  'order.created',
  'scheduled.failed',
  'delivery.failed',
  'backup.failed',
  'integration.failed',
  'social.failed',
  'email.bounced',
  'email.complained',
] as const
/** Sent only to chats that tick them (#404): a mailing can bounce many. */
export const OPT_IN_EVENTS = ['email.bounced', 'email.complained'] as const
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number]

export const EVENT_LABELS: Record<NotifyEvent, { en: string; th: string }> = {
  'form.submitted': { en: 'A form was sent', th: 'มีคนส่งฟอร์ม' },
  'order.created': { en: 'A new order', th: 'คำสั่งซื้อใหม่' },
  'scheduled.failed': { en: 'Scheduled publishing failed', th: 'การเผยแพร่ตามเวลาล้มเหลว' },
  'delivery.failed': { en: 'A webhook or email gave up', th: 'Webhook หรืออีเมลส่งไม่สำเร็จ' },
  'backup.failed': { en: 'A backup failed', th: 'การสำรองข้อมูลล้มเหลว' },
  'integration.failed': { en: 'An integration failed', th: 'การเชื่อมต่อล้มเหลว' },
  'social.failed': { en: 'A social post failed', th: 'โพสต์โซเชียลไม่สำเร็จ' },
  'email.bounced': { en: 'An email bounced', th: 'อีเมลตีกลับ' },
  'email.complained': { en: 'An email was reported as spam', th: 'อีเมลถูกแจ้งเป็นสแปม' },
}

/** A message for people: a title, some lines, and a page of the admin. */
export interface Notice {
  readonly title: string
  readonly lines: readonly string[]
  /** A path of the admin, e.g. `/backups`. */
  readonly path?: string | undefined
  /** The link's words. */
  readonly open: string
}

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

function money(amount: unknown, currency: unknown, language: Language): string {
  if (typeof amount !== 'number' || typeof currency !== 'string') return ''
  try {
    const format = new Intl.NumberFormat(language, { style: 'currency', currency })
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2
    return format.format(amount / 10 ** digits)
  } catch {
    return `${amount} ${currency}`
  }
}

const T = {
  en: {
    form: 'Form',
    from: 'From',
    order: 'Order',
    total: 'Total',
    email: 'Email',
    document: 'Document',
    error: 'Error',
    post: 'Post',
    channel: 'Channel',
    to: 'To',
    subject: 'Subject',
    attempts: 'Attempts',
    connection: 'Connection',
    publish: 'publish',
    unpublish: 'unpublish',
    open: 'Open in the admin',
    dropped: (n: number, limit: number) =>
      `${n} more notifications were not sent: at most ${limit} an hour.`,
    test: 'Easy CMS: test message. Notifications will arrive in this chat.',
  },
  th: {
    form: 'ฟอร์ม',
    from: 'จาก',
    order: 'คำสั่งซื้อ',
    total: 'ยอดรวม',
    email: 'อีเมล',
    document: 'เอกสาร',
    error: 'ข้อผิดพลาด',
    post: 'โพสต์',
    channel: 'ช่องทาง',
    to: 'ถึง',
    subject: 'หัวข้อ',
    attempts: 'จำนวนครั้ง',
    connection: 'การเชื่อมต่อ',
    publish: 'เผยแพร่',
    unpublish: 'เลิกเผยแพร่',
    open: 'เปิดในหน้า admin',
    dropped: (n: number, limit: number) =>
      `มีการแจ้งเตือนอีก ${n} รายการที่ไม่ได้ส่ง: ส่งได้ไม่เกิน ${limit} รายการต่อชั่วโมง`,
    test: 'Easy CMS: ข้อความทดสอบ การแจ้งเตือนจะส่งมาที่แชตนี้',
  },
}
export const texts = (language: Language) => T[language]

/** What to say about an event; `null` for events it doesn't know. */
export function noticeOf(message: EventMessage, language: Language): Notice | null {
  const notice = describe(message, language)
  return notice && { ...notice, open: T[language].open }
}

function describe(message: EventMessage, language: Language): Omit<Notice, 'open'> | null {
  const t = T[language]
  const d = message.data as Data
  const event = message.event as NotifyEvent
  if (!(NOTIFY_EVENTS as readonly string[]).includes(event)) return null
  const title = EVENT_LABELS[event][language]
  const line = (label: string, value: unknown) => (str(value) ? [`${label}: ${str(value)}`] : [])
  const about = message.about
  const docPath =
    about?.collection && about.id !== undefined
      ? `/collections/${about.collection}/${about.id}`
      : undefined
  switch (event) {
    case 'form.submitted': {
      // Only the form's name and who sent it: answers can be personal.
      const form = (d.form ?? {}) as Data
      return {
        title,
        lines: [...line(t.form, form.title ?? form.id), ...line(t.from, d.email)],
        path: docPath,
      }
    }
    case 'order.created':
      return {
        title,
        lines: [
          ...line(t.order, d.orderNumber ? `#${str(d.orderNumber)}` : d.id),
          ...line(t.total, money(d.total, d.currency, language)),
          ...line(t.email, d.email),
        ],
        path: docPath,
      }
    case 'scheduled.failed': {
      const action = d.action === 'unpublish' ? t.unpublish : d.action ? t.publish : ''
      const target = d.global ?? (d.collection ? `${str(d.collection)} ${str(d.doc)}` : '')
      return {
        title,
        lines: [
          ...line(t.document, `${str(target)}${action ? ` (${action})` : ''}`.trim()),
          ...line(t.error, d.error),
        ],
        path: '/jobs?tab=scheduled',
      }
    }
    case 'delivery.failed':
      return {
        title,
        lines: [
          ...line(t.to, d.url ?? d.to),
          ...line(t.attempts, d.attempts),
          ...line(t.error, d.error),
        ],
        path: '/deliveries',
      }
    case 'backup.failed':
      return { title, lines: line(t.error, d.error), path: '/backups' }
    case 'social.failed': {
      // From @easy-cms/plugin-social (#312): a channel given up on.
      const post = (d.post ?? {}) as Data
      return {
        title,
        lines: [
          ...line(t.post, post.title ?? post.id),
          ...line(t.channel, d.channel),
          ...line(t.error, d.error),
        ],
        path: docPath,
      }
    }
    case 'integration.failed':
      return {
        title,
        lines: [
          ...line(t.connection, d.name ? `${str(d.integration)} · ${str(d.name)}` : d.integration),
          ...line(t.error, d.error),
        ],
        path: '/integrations',
      }
    case 'email.bounced':
    case 'email.complained':
      return {
        title,
        lines: [...line(t.to, d.to), ...line(t.subject, d.subject), ...line(t.error, d.reason)],
        path: '/email',
      }
  }
}
