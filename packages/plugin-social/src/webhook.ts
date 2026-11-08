import { createHmac, randomUUID } from 'node:crypto'
import { ChannelError, type SocialChannel, type SocialMessage } from './channel.js'

// A URL that gets each post as signed JSON: a Make, n8n or Zapier scenario that posts it to LinkedIn or
// anywhere else. Signed like Easy CMS's webhooks, so `verifyWebhook` checks it.

async function post(values: Readonly<Record<string, string>>, body: Record<string, unknown>) {
  const url = values.url ?? ''
  if (!/^https?:\/\//.test(url)) throw new ChannelError('The webhook URL is not http(s)', true)
  const json = JSON.stringify(body)
  const delivery = randomUUID()
  const timestamp = Math.floor(Date.now() / 1000)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-easy-cms-event': 'social.post',
    'x-easy-cms-delivery': delivery,
    'x-easy-cms-timestamp': String(timestamp),
  }
  if (values.secret)
    headers['x-easy-cms-signature-v2'] =
      `v1=${createHmac('sha256', values.secret).update(`${delivery}.${timestamp}.${json}`).digest('hex')}`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: json,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new ChannelError(`The webhook could not be reached: ${(error as Error).message}`)
  }
  const text = await response.text().catch(() => '')
  if (!response.ok)
    throw new ChannelError(
      `The webhook answered ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      response.status >= 400 && response.status < 500 && response.status !== 429,
    )
  try {
    const answer = JSON.parse(text) as { url?: unknown }
    return { url: typeof answer.url === 'string' ? answer.url : null }
  } catch {
    return { url: null }
  }
}

export const webhook: SocialChannel = {
  integration: {
    id: 'social-webhook',
    label: { en: 'Webhook (social)', th: 'Webhook (โซเชียล)' },
    category: 'social',
    description: {
      en: 'Posts go to a URL as signed JSON: a Make, n8n or Zapier scenario that posts to LinkedIn, Threads, Discord or anywhere else',
      th: 'ส่งโพสต์เป็น JSON ที่ลงลายเซ็นไปยัง URL เช่น scenario ของ Make, n8n หรือ Zapier ที่โพสต์ต่อไปยัง LinkedIn, Threads, Discord หรือที่อื่น',
    },
    icon: 'link',
    docs: 'https://easycms.dev/docs/social',
    plugin: '@easy-cms/plugin-social',
    kind: 'fields',
    fields: [
      { name: 'url', label: 'URL', type: 'url', required: true },
      {
        name: 'secret',
        label: { en: 'Signing secret', th: 'Secret สำหรับลงลายเซ็น' },
        description: {
          en: 'Signs each post (x-easy-cms-signature-v2), as Easy CMS webhooks are.',
          th: 'ใช้ลงลายเซ็นทุกโพสต์ (x-easy-cms-signature-v2) แบบเดียวกับ webhook ของ Easy CMS',
        },
        secret: true,
      },
    ],
    // Test sends `{ test: true }`: the scenario can ignore it.
    async test(values) {
      try {
        await post(values, { test: true })
        return { ok: true, account: new URL(values.url ?? '').host }
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
    },
  },
  send: (values, message: SocialMessage) => post(values, { ...message }),
}
