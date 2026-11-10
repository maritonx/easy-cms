import { defineEmailProvider, type EmailEvent } from '@easy-cms/core'
import { BREVO } from './logos.js'
import { failure, json, list, parseAddress, parseBody } from './shared.js'

const api = () => process.env.BREVO_API_URL ?? 'https://api.brevo.com/v3'

/** Brevo's events, by what they mean here. */
const EVENTS: Record<string, { type: EmailEvent['type']; permanent?: boolean }> = {
  delivered: { type: 'delivered' },
  hard_bounce: { type: 'bounced', permanent: true },
  invalid_email: { type: 'bounced', permanent: true },
  soft_bounce: { type: 'bounced', permanent: false },
  spam: { type: 'complained' },
  complaint: { type: 'complained' },
}

/** Brevo (brevo.com, formerly Sendinblue): an API key, and a webhook for deliveries, bounces and spam. */
export const brevo = defineEmailProvider({
  id: 'brevo',
  label: 'Brevo',
  description: {
    en: 'Email with a generous free plan (300 a day)',
    th: 'บริการส่งอีเมลที่มีแพ็กเกจฟรีวันละ 300 ฉบับ',
  },
  icon: BREVO,
  docs: 'https://easycms.dev/docs/email#brevo',
  plugin: '@easy-cms/plugin-email',
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      description: {
        en: 'Brevo → SMTP & API → API Keys (xkeysib-…)',
        th: 'Brevo → SMTP & API → API Keys (xkeysib-…)',
      },
      placeholder: 'xkeysib-…',
      required: true,
      secret: true,
    },
  ],
  create: (values) => ({
    name: 'brevo',
    apiVersion: 1,
    from: values.from,
    async send(message) {
      const people = (value: string | readonly string[] | undefined) =>
        list(value).map(parseAddress)
      const response = await fetch(`${api()}/smtp/email`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': values.apiKey ?? '',
        },
        body: JSON.stringify({
          sender: parseAddress(message.from),
          to: people(message.to),
          ...(message.cc ? { cc: people(message.cc) } : {}),
          ...(message.bcc ? { bcc: people(message.bcc) } : {}),
          ...(message.replyTo ? { replyTo: parseAddress(message.replyTo) } : {}),
          subject: message.subject,
          ...(message.html ? { htmlContent: message.html } : {}),
          ...(message.text ? { textContent: message.text } : {}),
        }),
      })
      const body = await json(response)
      if (!response.ok) throw failure('Brevo', response, body)
      return typeof body.messageId === 'string' ? { id: body.messageId } : undefined
    },
  }),
  async test(values) {
    const response = await fetch(`${api()}/account`, {
      headers: { accept: 'application/json', 'api-key': values.apiKey ?? '' },
    })
    const body = await json(response)
    if (!response.ok) return { ok: false, message: failure('Brevo', response, body).message }
    const account = body.companyName ?? body.email
    return { ok: true, ...(typeof account === 'string' ? { account } : {}) }
  },
  events(request) {
    const event = parseBody(request.body) as {
      event?: string
      email?: string
      'message-id'?: string
      date?: string
      reason?: string
    }
    const meaning = EVENTS[event.event ?? '']
    const id = event['message-id']
    if (!meaning || !id || !event.email) return []
    return [
      {
        id,
        type: meaning.type,
        address: event.email,
        ...(meaning.permanent !== undefined ? { permanent: meaning.permanent } : {}),
        ...(event.reason ? { detail: event.reason } : {}),
        ...(event.date ? { at: event.date } : {}),
      },
    ]
  },
  webhookSetup: {
    en: 'In Brevo → Transactional → Settings → Webhook, add this URL with Delivered, Hard bounce, Soft bounce and Complaint.',
    th: 'ใน Brevo → Transactional → Settings → Webhook เพิ่ม URL นี้ แล้วเลือก Delivered, Hard bounce, Soft bounce และ Complaint',
  },
})
