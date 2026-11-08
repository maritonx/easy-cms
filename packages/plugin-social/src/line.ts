import { ChannelError, type SocialChannel, type SocialMessage } from './channel.js'
import { LINE } from './logos.js'

// LINE Official Accounts through the Messaging API, without an SDK (#313): a broadcast to every
// follower, as a card. LINE_API_URL points tests at a stand-in.

const api = () => (process.env.LINE_API_URL ?? 'https://api.line.me').replace(/\/+$/, '')
/** Characters of text on the card; the notification (altText) takes at most 400. */
const MAX_TEXT = 300

async function call(path: string, token: string, body?: unknown) {
  if (!token) throw new ChannelError('No channel access token', true)
  let response: Response
  try {
    response = await fetch(`${api()}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new ChannelError(`LINE could not be reached: ${(error as Error).message}`)
  }
  const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const details = Array.isArray(answer.details)
      ? ` (${(answer.details as { message?: string }[]).map((d) => d.message).join('; ')})`
      : ''
    throw new ChannelError(
      `LINE: ${String(answer.message ?? `HTTP ${response.status}`)}${details}`,
      response.status !== 429 && response.status < 500,
    )
  }
  return answer
}

const cut = (text: string, max: number) => {
  const chars = [...text]
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : text
}

/** The card: the image, the title, the text and Read more. */
export function flexMessage(message: SocialMessage, readMore: string) {
  if (message.image && !message.image.url.startsWith('https://'))
    throw new ChannelError('LINE shows images only from https addresses', true)
  const title = message.title.trim()
  const text = cut(message.text.trim(), MAX_TEXT)
  return {
    type: 'flex',
    altText: cut([title, text].filter(Boolean).join(': '), 400),
    contents: {
      type: 'bubble',
      ...(message.image
        ? {
            hero: {
              type: 'image',
              url: message.image.url,
              size: 'full',
              aspectRatio: '20:13',
              aspectMode: 'cover',
              ...(message.link ? { action: { type: 'uri', uri: message.link } } : {}),
            },
          }
        : {}),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          ...(title
            ? [{ type: 'text', text: cut(title, 120), weight: 'bold', size: 'lg', wrap: true }]
            : []),
          { type: 'text', text, size: 'sm', color: '#555555', wrap: true },
        ],
      },
      ...(message.link
        ? {
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  action: { type: 'uri', label: readMore, uri: message.link },
                },
              ],
            },
          }
        : {}),
    },
  }
}

export const line: SocialChannel = {
  maxLength: MAX_TEXT,
  integration: {
    id: 'line-oa',
    label: 'LINE OA',
    category: 'social',
    icon: LINE,
    description: {
      en: 'Broadcasts each post as a card to your LINE Official Account’s followers',
      th: 'broadcast แต่ละโพสต์เป็นการ์ดถึงผู้ติดตาม LINE Official Account ของคุณ',
    },
    docs: 'https://easycms.dev/docs/social#line-oa',
    plugin: '@easy-cms/plugin-social',
    kind: 'fields',
    fields: [
      {
        name: 'token',
        label: { en: 'Channel access token', th: 'Channel access token' },
        description: {
          en: 'LINE Developers → your Messaging API channel → Channel access token (long-lived).',
          th: 'LINE Developers → Messaging API channel ของคุณ → Channel access token (long-lived)',
        },
        secret: true,
        required: true,
      },
      {
        name: 'readMore',
        label: { en: 'Button text', th: 'ข้อความบนปุ่ม' },
        placeholder: 'Read more',
        description: { en: 'Empty: "Read more".', th: 'ถ้าว่าง: "Read more"' },
      },
    ],
    env: { token: 'LINE_CHANNEL_ACCESS_TOKEN' },
    async test(values) {
      try {
        const bot = await call('/v2/bot/info', values.token ?? '')
        return { ok: true, account: [bot.displayName, bot.basicId].filter(Boolean).join(' ') }
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
    },
  },
  // Followers (yesterday's count, when LINE has it) and this month's message quota.
  async preview(values) {
    const token = values.token ?? ''
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
    const [followers, quota, used] = await Promise.all([
      call(`/v2/bot/insight/followers?date=${yesterday}`, token).catch(() => null),
      call('/v2/bot/message/quota', token).catch(() => null),
      call('/v2/bot/message/quota/consumption', token).catch(() => null),
    ])
    const reach =
      followers?.status === 'ready'
        ? Number(followers.targetedReaches ?? followers.followers)
        : null
    const limit = quota?.type === 'limited' ? Number(quota.value) : null
    const spent = used ? Number(used.totalUsage ?? 0) : null
    const parts = [
      reach !== null ? `Reaches about ${reach.toLocaleString('en')} followers` : null,
      limit !== null && spent !== null
        ? `messages this month: ${spent.toLocaleString('en')} / ${limit.toLocaleString('en')}`
        : null,
    ].filter(Boolean)
    const over = reach !== null && limit !== null && spent !== null && spent + reach > limit
    return {
      ...(parts.length ? { info: parts.join(' · ') } : {}),
      ...(over
        ? {
            warning:
              'This broadcast goes over the month’s free messages: LINE charges for the rest, or refuses them',
          }
        : {}),
    }
  },
  async send(values, message) {
    await call('/v2/bot/message/broadcast', values.token ?? '', {
      messages: [flexMessage(message, values.readMore?.trim() || 'Read more')],
    })
    // A broadcast has no address of its own.
    return { url: null }
  },
}
