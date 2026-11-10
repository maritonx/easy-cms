import { createHmac, timingSafeEqual } from 'node:crypto'
import { defineEmailProvider, type EmailEvent, type EmailWebhookRequest } from '@easy-cms/core'
import { RESEND } from './logos.js'
import { failure, json, list, parseBody } from './shared.js'

const api = () => process.env.RESEND_API_URL ?? 'https://api.resend.com'
/** Signed requests older than this are refused (replays). */
const TOLERANCE_S = 5 * 60

/**
 * Checks a Svix signature (Resend's webhooks): `svix-signature` lists `v1,<base64>` signatures of
 * `<id>.<timestamp>.<body>` with the secret after `whsec_`.
 */
export function verifySvix(request: EmailWebhookRequest, secret: string, now = Date.now()) {
  const id = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signatures = request.headers.get('svix-signature')
  if (!id || !timestamp || !signatures) throw new Error('the request is not signed')
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > TOLERANCE_S)
    throw new Error('the signature is too old')
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${request.body}`).digest()
  for (const part of signatures.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    const given = Buffer.from(value, 'base64')
    if (given.length === expected.length && timingSafeEqual(given, expected)) return
  }
  throw new Error('the signature does not match')
}

const TYPES: Record<string, EmailEvent['type']> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
}

/** Resend (resend.com): an API key, and a webhook for deliveries, bounces and spam reports. */
export const resend = defineEmailProvider({
  id: 'resend',
  label: 'Resend',
  description: {
    en: 'Email API for developers, with a free plan',
    th: 'บริการส่งอีเมลผ่าน API สำหรับนักพัฒนา มีแพ็กเกจฟรี',
  },
  icon: RESEND,
  docs: 'https://easycms.dev/docs/email#resend',
  plugin: '@easy-cms/plugin-email',
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      description: { en: 'Resend → API Keys (re_…)', th: 'Resend → API Keys (re_…)' },
      placeholder: 're_…',
      required: true,
      secret: true,
    },
    {
      name: 'webhookSecret',
      label: { en: 'Webhook signing secret', th: 'Signing secret ของ webhook' },
      description: {
        en: 'Optional: from Resend → Webhooks (whsec_…), to check its requests are Resend’s',
        th: 'ไม่บังคับ: จาก Resend → Webhooks (whsec_…) ใช้ตรวจว่าคำขอมาจาก Resend จริง',
      },
      placeholder: 'whsec_…',
      secret: true,
    },
  ],
  create: (values) => ({
    name: 'resend',
    apiVersion: 1,
    from: values.from,
    async send(message) {
      const response = await fetch(`${api()}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${values.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: message.from,
          to: list(message.to),
          ...(message.cc ? { cc: list(message.cc) } : {}),
          ...(message.bcc ? { bcc: list(message.bcc) } : {}),
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          subject: message.subject,
          ...(message.html ? { html: message.html } : {}),
          ...(message.text ? { text: message.text } : {}),
        }),
      })
      const body = await json(response)
      if (!response.ok) throw failure('Resend', response, body)
      return typeof body.id === 'string' ? { id: body.id } : undefined
    },
  }),
  async test(values) {
    const response = await fetch(`${api()}/domains`, {
      headers: { authorization: `Bearer ${values.apiKey}` },
    })
    const body = await json(response)
    // A key that may only send can't list domains: it still works.
    if (body.name === 'restricted_api_key') return { ok: true }
    if (!response.ok) return { ok: false, message: failure('Resend', response, body).message }
    const names = Array.isArray(body.data)
      ? (body.data as { name?: unknown }[]).map((d) => d.name).filter((n) => typeof n === 'string')
      : []
    return { ok: true, ...(names.length ? { account: names.join(', ') } : {}) }
  },
  events(request, values) {
    if (values.webhookSecret) verifySvix(request, values.webhookSecret)
    const event = parseBody(request.body) as {
      type?: string
      created_at?: string
      data?: { email_id?: string; to?: string[]; bounce?: { type?: string; message?: string } }
    }
    const type = TYPES[event.type ?? '']
    const id = event.data?.email_id
    if (!type || !id) return []
    return (event.data?.to ?? []).map((address) => ({
      id,
      type,
      address,
      ...(event.created_at ? { at: event.created_at } : {}),
      ...(type === 'bounced'
        ? {
            permanent: event.data?.bounce?.type !== 'Transient',
            ...(event.data?.bounce?.message ? { detail: event.data.bounce.message } : {}),
          }
        : {}),
    }))
  },
  webhookSetup: {
    en: 'In Resend → Webhooks, add this URL with the events email.delivered, email.bounced and email.complained, then paste its signing secret above.',
    th: 'ใน Resend → Webhooks เพิ่ม URL นี้ เลือก event email.delivered, email.bounced และ email.complained แล้วนำ signing secret มาวางในช่องด้านบน',
  },
})
