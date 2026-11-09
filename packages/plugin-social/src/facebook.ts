import { ChannelError, type SocialChannel, type SocialMessage } from './channel.js'
import { FACEBOOK } from './logos.js'

// Facebook Pages through the Graph API, without an SDK (#313). The Meta app's id and secret come
// entered in the admin, or from META_APP_ID and META_APP_SECRET; FACEBOOK_GRAPH_URL and FACEBOOK_DIALOG_URL point tests at
// a stand-in, FACEBOOK_GRAPH_VERSION picks another API version.

const version = () => process.env.FACEBOOK_GRAPH_VERSION ?? 'v26.0'
const graph = () =>
  `${(process.env.FACEBOOK_GRAPH_URL ?? 'https://graph.facebook.com').replace(/\/+$/, '')}/${version()}`
/** The Meta app's id and secret, entered in the admin or set as META_APP_ID and META_APP_SECRET. */
const app = (values: Readonly<Record<string, string>>) => {
  const id = values.appId
  const secret = values.appSecret
  if (!id || !secret)
    throw new Error('Enter your Meta app’s id and secret to connect Facebook Pages')
  return { id, secret }
}

type Answer = Record<string, unknown> & {
  error?: { message?: string; code?: number; error_subcode?: number }
}

/** Calls the Graph API; its errors as `ChannelError`, permanent when trying again won't help. */
async function call(path: string, init: { method?: string; params: Record<string, string> }) {
  const query = new URLSearchParams(init.params)
  const method = init.method ?? 'GET'
  let response: Response
  try {
    response = await fetch(method === 'GET' ? `${graph()}${path}?${query}` : `${graph()}${path}`, {
      method,
      ...(method === 'GET'
        ? {}
        : { body: query, headers: { 'content-type': 'application/x-www-form-urlencoded' } }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new ChannelError(`Facebook could not be reached: ${(error as Error).message}`)
  }
  const answer = (await response.json().catch(() => ({}))) as Answer
  if (!response.ok || answer.error) {
    const code = answer.error?.code
    const message = `Facebook: ${answer.error?.message ?? `HTTP ${response.status}`}`
    // 190: the token expired or was revoked; 10, 200: a permission the Page or app lacks.
    // 4, 17, 32, 613: rate limits, and 5xx: worth another try.
    const retry = response.status >= 500 || [1, 2, 4, 17, 32, 341, 613].includes(code ?? -1)
    throw new ChannelError(message, !retry)
  }
  return answer
}

export const facebook: SocialChannel = {
  integration: {
    id: 'facebook-page',
    label: 'Facebook Page',
    category: 'social',
    icon: FACEBOOK,
    description: {
      en: 'Posts to Facebook Pages you manage, through a Meta app of your own.',
      th: 'โพสต์ไปยังเพจ Facebook ที่คุณดูแล ผ่าน Meta app ของคุณเอง',
    },
    docs: 'https://easycms.dev/docs/social#facebook-page',
    plugin: '@easy-cms/plugin-social',
    kind: 'oauth',
    oauth: {
      app: {
        fields: [
          { name: 'appId', label: { en: 'App ID', th: 'App ID' }, required: true },
          {
            name: 'appSecret',
            label: { en: 'App secret', th: 'App secret' },
            secret: true,
            required: true,
          },
        ],
        env: { appId: 'META_APP_ID', appSecret: 'META_APP_SECRET' },
      },
      authorizeUrl: ({ redirectUri, state, app: keys }) => {
        const { id } = app(keys)
        const dialog = (process.env.FACEBOOK_DIALOG_URL ?? 'https://www.facebook.com').replace(
          /\/+$/,
          '',
        )
        const query = new URLSearchParams({
          client_id: id,
          redirect_uri: redirectUri,
          state,
          scope: 'pages_show_list,pages_manage_posts,pages_read_engagement',
          response_type: 'code',
        })
        return `${dialog}/${version()}/dialog/oauth?${query}`
      },
      // The code → a user token → a long-lived one → the Pages it manages, each with a Page token
      // that doesn't expire (until the user takes it back).
      exchange: async ({ code, redirectUri, app: keys }) => {
        const { id, secret } = app(keys)
        const short = await call('/oauth/access_token', {
          params: { client_id: id, client_secret: secret, redirect_uri: redirectUri, code },
        })
        const long = await call('/oauth/access_token', {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: id,
            client_secret: secret,
            fb_exchange_token: String(short.access_token ?? ''),
          },
        })
        const pages = await call('/me/accounts', {
          params: {
            fields: 'id,name,access_token',
            limit: '100',
            access_token: String(long.access_token ?? ''),
          },
        })
        const list = (Array.isArray(pages.data) ? pages.data : []) as {
          id: string
          name: string
          access_token: string
        }[]
        if (list.length === 0)
          throw new Error('This Facebook account manages no Page, or none was allowed')
        return {
          accounts: list.map((page) => ({
            id: page.id,
            name: page.name,
            values: { pageId: page.id, token: page.access_token },
          })),
        }
      },
    },
    // Checks the Page token without posting.
    async test(values) {
      try {
        const me = await call('/me', {
          params: { fields: 'name', access_token: values.token ?? '' },
        })
        return { ok: true, account: String(me.name ?? values.pageId ?? '') }
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
    },
  },
  async send(values, message: SocialMessage) {
    const token = values.token ?? ''
    const page = values.pageId ?? ''
    if (!token || !page) throw new ChannelError('The Page is not connected', true)
    // A photo post has no link card: the link goes after the text.
    const result = message.image
      ? await call(`/${page}/photos`, {
          method: 'POST',
          params: {
            url: message.image.url,
            caption: message.link ? `${message.text}\n\n${message.link}` : message.text,
            access_token: token,
          },
        })
      : await call(`/${page}/feed`, {
          method: 'POST',
          params: {
            message: message.text,
            ...(message.link ? { link: message.link } : {}),
            access_token: token,
          },
        })
    const id = String(result.post_id ?? result.id ?? '')
    return { url: id ? `https://www.facebook.com/${id}` : null }
  },
}
