import { createHmac, randomBytes } from 'node:crypto'
import { ChannelError, type SocialChannel, type SocialMessage } from './channel.js'
import { X } from './logos.js'
import { X_MAX, xLength } from './shared.js'

// X through its API v2, without an SDK (#380): OAuth 1.0a with your own app's keys and the access
// token X makes for your account, which doesn't expire. X_API_URL points tests at a stand-in.

const api = () => (process.env.X_API_URL ?? 'https://api.x.com').replace(/\/+$/, '')

/** What X's API charges, as of November 2026 (docs.x.com/x-api/getting-started/pricing). */
const COST = { post: '$0.015', withLink: '$0.20' }

/** RFC 3986, as OAuth 1.0a signs. */
const enc = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )

type Keys = Readonly<Record<string, string>>

/** The `Authorization` header of an OAuth 1.0a request (query parameters signed; JSON bodies aren't). */
export function oauthHeader(
  method: string,
  url: string,
  keys: Keys,
  now = Math.floor(Date.now() / 1000),
  nonce = randomBytes(16).toString('hex'),
) {
  const target = new URL(url)
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.apiKey ?? '',
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(now),
    oauth_token: keys.accessToken ?? '',
    oauth_version: '1.0',
  }
  const params = [...Object.entries(oauth), ...target.searchParams.entries()]
    .map(([k, v]) => [enc(k), enc(v)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const base = [method.toUpperCase(), enc(`${target.origin}${target.pathname}`), enc(params)].join(
    '&',
  )
  const signature = createHmac(
    'sha1',
    `${enc(keys.apiSecret ?? '')}&${enc(keys.accessTokenSecret ?? '')}`,
  )
    .update(base)
    .digest('base64')
  return `OAuth ${Object.entries({ ...oauth, oauth_signature: signature })
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
    .join(', ')}`
}

/** What to do about X's refusals, said on the card. */
function hint(status: number, message: string) {
  if (status === 401)
    return ' (check the four keys: making new ones in the X console replaces the old ones)'
  if (status === 402) return ' (add credits in console.x.com)'
  if (status === 403 && !/duplicate/i.test(message))
    return ' (the app needs Read and Write permission: set it, then make the access token again)'
  return ''
}

async function call(path: string, keys: Keys, body?: unknown) {
  for (const key of ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'])
    if (!keys[key]) throw new ChannelError(`X: ${key} is missing`, true)
  const url = `${api()}${path}`
  const method = body === undefined ? 'GET' : 'POST'
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: oauthHeader(method, url, keys),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new ChannelError(`X could not be reached: ${(error as Error).message}`)
  }
  const answer = (await response.json().catch(() => ({}))) as {
    data?: Record<string, string>
    title?: string
    detail?: string
    errors?: { message?: string; detail?: string }[]
  }
  if (!response.ok || (!answer.data && answer.errors?.length)) {
    const said =
      answer.detail ??
      answer.errors?.[0]?.detail ??
      answer.errors?.[0]?.message ??
      answer.title ??
      `HTTP ${response.status}`
    throw new ChannelError(
      `X: ${said}${hint(response.status, said)}`,
      response.status !== 429 && response.status < 500,
    )
  }
  return answer.data ?? {}
}

/** The account's @username by access token, once per server: the post's address needs it. */
const usernames = new Map<string, string>()
async function username(keys: Keys) {
  const known = usernames.get(keys.accessToken ?? '')
  if (known) return known
  const me = await call('/2/users/me', keys)
  if (me.username) usernames.set(keys.accessToken ?? '', me.username)
  return me.username ?? null
}

/** The text and the link, as one post X takes; a link counts 23 however long it is. */
export function postText(message: SocialMessage) {
  const text = message.text.trim()
  const full = [text, message.link].filter(Boolean).join('\n\n')
  if (xLength(full) > X_MAX)
    throw new ChannelError(
      `X: the post is ${xLength(full)} of ${X_MAX} characters (a link counts 23): shorten X’s text`,
      true,
    )
  return full
}

export const x: SocialChannel = {
  // The text beside a link: 280, less the link (23) and the blank line before it.
  maxLength: X_MAX - 25,
  counting: 'x',
  integration: {
    id: 'x',
    label: 'X',
    category: 'social',
    icon: X,
    description: {
      en: 'Posts to your X account through your own X app. X charges for each post.',
      th: 'โพสต์ไปยังบัญชี X ของคุณผ่านแอป X ของคุณเอง X คิดเงินต่อโพสต์',
    },
    docs: 'https://easycms.dev/docs/social#x',
    plugin: '@easy-cms/plugin-social',
    kind: 'fields',
    fields: [
      {
        name: 'apiKey',
        label: { en: 'API key', th: 'API key' },
        description: {
          en: 'console.x.com → your app → Keys and tokens → OAuth 1.0 keys: Consumer key.',
          th: 'console.x.com → แอปของคุณ → Keys and tokens → OAuth 1.0 keys: Consumer key',
        },
        required: true,
      },
      {
        name: 'apiSecret',
        label: { en: 'API secret', th: 'API secret' },
        secret: true,
        required: true,
      },
      {
        name: 'accessToken',
        label: { en: 'Access token', th: 'Access token' },
        description: {
          en: 'Same page → Access token: made after the app has Read and Write permission.',
          th: 'หน้าเดียวกัน → Access token: สร้างหลังตั้งแอปเป็น Read and Write แล้ว',
        },
        secret: true,
        required: true,
      },
      {
        name: 'accessTokenSecret',
        label: { en: 'Access token secret', th: 'Access token secret' },
        secret: true,
        required: true,
      },
    ],
    env: {
      apiKey: 'X_API_KEY',
      apiSecret: 'X_API_SECRET',
      accessToken: 'X_ACCESS_TOKEN',
      accessTokenSecret: 'X_ACCESS_TOKEN_SECRET',
    },
    async test(values) {
      try {
        const me = await call('/2/users/me', values)
        if (me.username) usernames.set(values.accessToken ?? '', me.username)
        return { ok: true, account: me.username ? `@${me.username}` : (me.name ?? 'X') }
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
    },
  },
  // X's API has no balance to read: what this post costs.
  async preview(_values, draft) {
    return {
      info: draft?.link
        ? `X API: about ${COST.withLink} for a post with a link`
        : `X API: about ${COST.post} a post`,
    }
  },
  async send(values, message) {
    const post = await call('/2/tweets', values, { text: postText(message) })
    if (!post.id) return { url: null }
    const name = await username(values).catch(() => null)
    return { url: `https://x.com/${name ?? 'i/web'}/status/${post.id}` }
  },
}
