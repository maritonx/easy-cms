import type { IntegrationField } from '@easy-cms/core'
import { siTelegram } from 'simple-icons'
import { ChannelError, type NotifyChannel } from './channel.js'
import type { Notice } from './messages.js'

// Telegram's Bot API (https://core.telegram.org/bots/api). `TELEGRAM_API_URL` points tests at
// a stand-in server.
const api = () => (process.env.TELEGRAM_API_URL ?? 'https://api.telegram.org').replace(/\/$/, '')

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type Answer = { ok: boolean; result?: unknown; description?: string; error_code?: number }

async function call(token: string, method: string, body?: Record<string, unknown>) {
  if (!token) throw new ChannelError('No bot token', true)
  let response: Response
  try {
    response = await fetch(`${api()}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new ChannelError(`Telegram could not be reached: ${(error as Error).message}`)
  }
  const answer = (await response.json().catch(() => ({ ok: false }))) as Answer
  if (!answer.ok) {
    const code = answer.error_code ?? response.status
    // 401 a wrong token, 400 a wrong chat, 403 the bot was blocked: retrying won't help.
    throw new ChannelError(
      `Telegram: ${answer.description ?? `HTTP ${response.status}`}`,
      code === 400 || code === 401 || code === 403 || code === 404,
    )
  }
  return answer.result
}

const chatLabel = (chat: Record<string, unknown>) => {
  const name =
    chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username)
  return `${String(name ?? chat.id)} (${String(chat.type)})`
}

/** The chats the bot was written to, newest first, for the Chat ID's Find button. */
async function chats(token: string) {
  const updates = ((await call(token, 'getUpdates', { limit: 100 })) ?? []) as Record<
    string,
    unknown
  >[]
  const found = new Map<string, string>()
  for (const update of updates.reverse()) {
    const holder = (update.message ??
      update.channel_post ??
      update.my_chat_member ??
      update.edited_message) as { chat?: Record<string, unknown> } | undefined
    const chat = holder?.chat
    if (chat?.id !== undefined && !found.has(String(chat.id)))
      found.set(String(chat.id), chatLabel(chat))
  }
  return [...found].map(([value, label]) => ({ value, label }))
}

const fields: IntegrationField[] = [
  {
    name: 'token',
    label: { en: 'Bot token', th: 'Bot token' },
    description: {
      en: 'From @BotFather: /newbot, then copy the token.',
      th: 'จาก @BotFather: /newbot แล้วคัดลอก token',
    },
    secret: true,
    required: true,
  },
  {
    name: 'chatId',
    label: { en: 'Chat ID', th: 'Chat ID' },
    description: {
      en: 'Write to the bot (or add it to a group), then press Find.',
      th: 'ส่งข้อความหาบอท (หรือเพิ่มบอทเข้ากลุ่ม) แล้วกด ค้นหา',
    },
    required: true,
    lookup: (values) => chats(values.token ?? ''),
  },
]

export const telegram: NotifyChannel = {
  integration: {
    id: 'telegram',
    label: 'Telegram',
    category: 'notifications',
    description: {
      en: 'Tell admins about new orders, form answers and failures in a Telegram chat.',
      th: 'แจ้งผู้ดูแลเรื่องคำสั่งซื้อใหม่ ฟอร์ม และข้อผิดพลาดในแชต Telegram',
    },
    // A trademark of its owner, naming the service; from simple-icons (CC0), bundled at build time.
    icon: { paths: [{ d: siTelegram.path }], color: `#${siTelegram.hex}` },
    docs: 'https://easycms.dev/docs/notifications',
    plugin: '@easy-cms/plugin-notify',
    kind: 'fields',
    fields,
    env: { token: 'TELEGRAM_BOT_TOKEN' },
    // The bot's name; the plugin then sends a test message.
    async test(values) {
      const me = (await call(values.token ?? '', 'getMe')) as {
        username?: string
        first_name?: string
      }
      return { ok: true, account: me.username ? `@${me.username}` : (me.first_name ?? 'bot') }
    },
  },
  format(notice: Notice, link) {
    return [
      `<b>${html(notice.title)}</b>`,
      ...notice.lines.map(html),
      ...(link ? [`<a href="${html(link)}">${html(notice.open)}</a>`] : []),
    ].join('\n')
  },
  async send(values, text) {
    await call(values.token ?? '', 'sendMessage', {
      chat_id: values.chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
  },
}
