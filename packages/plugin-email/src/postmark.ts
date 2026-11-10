import { defineEmailProvider, type EmailEvent } from '@easy-cms/core'
import { failure, json, list, parseBody } from './shared.js'

const api = () => process.env.POSTMARK_API_URL ?? 'https://api.postmarkapp.com'

interface PostmarkRecord {
  RecordType?: string
  MessageID?: string
  Recipient?: string
  Email?: string
  Type?: string
  Inactive?: boolean
  Description?: string
  DeliveredAt?: string
  BouncedAt?: string
}

/** Postmark (postmarkapp.com): a server token, and a webhook for deliveries, bounces and spam. */
export const postmark = defineEmailProvider({
  id: 'postmark',
  label: 'Postmark',
  description: {
    en: 'Transactional email known for reaching the inbox',
    th: 'บริการส่งอีเมลระบบที่ขึ้นชื่อเรื่องส่งถึงกล่องจดหมาย',
  },
  icon: 'mail',
  docs: 'https://easycms.dev/docs/email#postmark',
  plugin: '@easy-cms/plugin-email',
  fields: [
    {
      name: 'serverToken',
      label: 'Server API token',
      description: {
        en: 'Postmark → your server → API Tokens',
        th: 'Postmark → เซิร์ฟเวอร์ของคุณ → API Tokens',
      },
      required: true,
      secret: true,
    },
    {
      name: 'messageStream',
      label: 'Message stream',
      description: { en: 'Default: outbound', th: 'ค่าเริ่มต้น: outbound' },
      placeholder: 'outbound',
    },
  ],
  create: (values) => ({
    name: 'postmark',
    apiVersion: 1,
    from: values.from,
    async send(message) {
      const response = await fetch(`${api()}/email`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-postmark-server-token': values.serverToken ?? '',
        },
        body: JSON.stringify({
          From: message.from,
          To: list(message.to).join(', '),
          ...(message.cc ? { Cc: list(message.cc).join(', ') } : {}),
          ...(message.bcc ? { Bcc: list(message.bcc).join(', ') } : {}),
          ...(message.replyTo ? { ReplyTo: message.replyTo } : {}),
          Subject: message.subject,
          ...(message.html ? { HtmlBody: message.html } : {}),
          ...(message.text ? { TextBody: message.text } : {}),
          MessageStream: values.messageStream || 'outbound',
        }),
      })
      const body = await json(response)
      if (!response.ok || (typeof body.ErrorCode === 'number' && body.ErrorCode !== 0))
        throw failure('Postmark', response, body)
      return typeof body.MessageID === 'string' ? { id: body.MessageID } : undefined
    },
  }),
  async test(values) {
    const response = await fetch(`${api()}/server`, {
      headers: { accept: 'application/json', 'x-postmark-server-token': values.serverToken ?? '' },
    })
    const body = await json(response)
    if (!response.ok) return { ok: false, message: failure('Postmark', response, body).message }
    return { ok: true, ...(typeof body.Name === 'string' ? { account: body.Name } : {}) }
  },
  events(request) {
    const record = parseBody(request.body) as PostmarkRecord
    const id = record.MessageID
    if (!id) return []
    const out = (
      type: EmailEvent['type'],
      address: string | undefined,
      extra: Partial<EmailEvent>,
    ) => (address ? [{ id, type, address, ...extra }] : [])
    switch (record.RecordType) {
      case 'Delivery':
        return out(
          'delivered',
          record.Recipient,
          record.DeliveredAt ? { at: record.DeliveredAt } : {},
        )
      case 'Bounce':
        return out('bounced', record.Email, {
          permanent: record.Inactive === true || record.Type === 'HardBounce',
          ...(record.Description ? { detail: record.Description } : {}),
          ...(record.BouncedAt ? { at: record.BouncedAt } : {}),
        })
      case 'SpamComplaint':
        return out('complained', record.Email, record.BouncedAt ? { at: record.BouncedAt } : {})
      default:
        return []
    }
  },
  webhookSetup: {
    en: 'In Postmark → your server → Webhooks, add this URL with Delivery, Bounce and Spam Complaint.',
    th: 'ใน Postmark → เซิร์ฟเวอร์ของคุณ → Webhooks เพิ่ม URL นี้ แล้วเลือก Delivery, Bounce และ Spam Complaint',
  },
})
