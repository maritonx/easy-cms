import type { BackupDestination, IntegrationConfig } from '@easy-cms/core'
import { DestinationError } from './errors.js'
import { GOOGLE_DRIVE } from './logos.js'

// Google Drive as a backup destination (#395), without an SDK: OAuth with your own Google Cloud
// client (entered in the admin, or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), the `drive.file`
// scope (only the files this app makes), a folder of its own, resumable uploads.
// GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL and GOOGLE_API_URL point tests at a stand-in.

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER = 'application/vnd.google-apps.folder'
const authURL = () => process.env.GOOGLE_AUTH_URL ?? 'https://accounts.google.com/o/oauth2/v2/auth'
const tokenURL = () => process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token'
const api = () => (process.env.GOOGLE_API_URL ?? 'https://www.googleapis.com').replace(/\/+$/, '')

type App = Readonly<Record<string, string>>
type Answer = Record<string, unknown> & {
  error?: string | { message?: string; errors?: { reason?: string }[] }
  error_description?: string
}

/** Google's refusals trying again won't fix: access taken back, a full drive, no such folder. */
const LASTING = new Set([
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
  'storageQuotaExceeded',
  'insufficientPermissions',
  'notFound',
])

async function read(response: Response, what: string): Promise<Answer> {
  const answer = (await response.json().catch(() => ({}))) as Answer
  if (response.ok) return answer
  const reason = typeof answer.error === 'string' ? answer.error : answer.error?.errors?.[0]?.reason
  const message =
    answer.error_description ??
    (typeof answer.error === 'object' ? answer.error?.message : undefined) ??
    reason ??
    `HTTP ${response.status}`
  const lasting =
    LASTING.has(String(reason)) ||
    (response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429 &&
      response.status !== 408)
  throw new DestinationError(
    `Google Drive (${what}): ${message}${reason === 'invalid_grant' ? ' — connect the account again' : ''}`,
    lasting,
  )
}

async function call(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) })
  } catch (error) {
    throw new DestinationError(`Google Drive could not be reached: ${(error as Error).message}`)
  }
}

/** A fresh access token from the refresh token (they last an hour). */
async function accessToken(app: App, refreshToken: string): Promise<string> {
  const response = await call(
    tokenURL(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: app.clientId ?? '',
        client_secret: app.clientSecret ?? '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    },
    'token',
  )
  return String((await read(response, 'token')).access_token ?? '')
}

/** Google Drive, for backups. */
export const googleDrive: IntegrationConfig = {
  id: 'google-drive',
  label: 'Google Drive',
  category: 'backups',
  icon: GOOGLE_DRIVE,
  description: {
    en: 'Keeps backups in a folder of your Google Drive, through a Google Cloud app of your own.',
    th: 'เก็บ backup ในโฟลเดอร์ของ Google Drive ผ่านแอป Google Cloud ของคุณเอง',
  },
  docs: 'https://easycms.dev/docs/backups#google-drive',
  plugin: '@easy-cms/plugin-backups',
  kind: 'oauth',
  consent: {
    text: {
      en: 'Backups of the whole database, users’ emails included, are sent to Google Drive. Set backups.encryptionKey to encrypt them first.',
      th: 'backup ของทั้งฐานข้อมูล รวมอีเมลของผู้ใช้ จะถูกส่งไปยัง Google Drive ตั้ง backups.encryptionKey เพื่อเข้ารหัสก่อนส่ง',
    },
    policy: 'https://policies.google.com/privacy',
  },
  oauth: {
    app: {
      fields: [
        { name: 'clientId', label: { en: 'Client ID', th: 'Client ID' }, required: true },
        {
          name: 'clientSecret',
          label: { en: 'Client secret', th: 'Client secret' },
          secret: true,
          required: true,
        },
      ],
      env: { clientId: 'GOOGLE_CLIENT_ID', clientSecret: 'GOOGLE_CLIENT_SECRET' },
    },
    authorizeUrl: ({ redirectUri, state, app }) => {
      const query = new URLSearchParams({
        client_id: app.clientId ?? '',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        // A refresh token, every time: backups run while nobody is signed in.
        access_type: 'offline',
        prompt: 'consent',
        state,
      })
      return `${authURL()}?${query}`
    },
    // The code → tokens → the account's email → a folder of its own for this site's backups.
    exchange: async ({ code, redirectUri, app }) => {
      const tokens = await read(
        await call(
          tokenURL(),
          {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: app.clientId ?? '',
              client_secret: app.clientSecret ?? '',
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          },
          'token',
        ),
        'token',
      )
      const refreshToken = String(tokens.refresh_token ?? '')
      if (!refreshToken) throw new Error('Google gave no refresh token: connect the account again')
      const auth = { authorization: `Bearer ${String(tokens.access_token ?? '')}` }
      const about = await read(
        await call(`${api()}/drive/v3/about?fields=user(emailAddress)`, { headers: auth }, 'about'),
        'about',
      )
      const email = String(
        (about.user as { emailAddress?: string } | undefined)?.emailAddress ?? '',
      )
      const site = new URL(redirectUri).host
      const folder = await read(
        await call(
          `${api()}/drive/v3/files?fields=id`,
          {
            method: 'POST',
            headers: { ...auth, 'content-type': 'application/json' },
            body: JSON.stringify({ name: `Easy CMS backups – ${site}`, mimeType: FOLDER }),
          },
          'folder',
        ),
        'folder',
      )
      return {
        values: { refreshToken, folderId: String(folder.id ?? '') },
        ...(email ? { account: email } : {}),
      }
    },
  },
  // The token still works and the folder is still there (not in the bin).
  async test(values, { app }) {
    try {
      const token = await accessToken(app, values.refreshToken ?? '')
      const folder = await read(
        await call(
          `${api()}/drive/v3/files/${encodeURIComponent(values.folderId ?? '')}?fields=name,trashed`,
          { headers: { authorization: `Bearer ${token}` } },
          'folder',
        ),
        'folder',
      )
      if (folder.trashed) return { ok: false, message: 'The backups folder is in the bin' }
      return { ok: true, account: String(folder.name ?? '') }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  },
  backups(values, { app }): BackupDestination {
    const folderId = values.folderId ?? ''
    let token: Promise<string> | undefined
    const auth = async () => {
      token ??= accessToken(app, values.refreshToken ?? '')
      return { authorization: `Bearer ${await token}` }
    }
    /** The file's id in the folder by name, or `null`. */
    const find = async (name: string): Promise<string | null> => {
      const q = `name = '${name.replace(/['\\]/g, '\\$&')}' and '${folderId}' in parents and trashed = false`
      const found = await read(
        await call(
          `${api()}/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' })}`,
          { headers: await auth() },
          'find',
        ),
        'find',
      )
      return (found.files as { id: string }[] | undefined)?.[0]?.id ?? null
    }
    return {
      // A resumable upload: the session first, then the file in one request.
      async put(name, data) {
        const session = await call(
          `${api()}/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink`,
          {
            method: 'POST',
            headers: {
              ...(await auth()),
              'content-type': 'application/json; charset=UTF-8',
              'x-upload-content-type': 'application/octet-stream',
              'x-upload-content-length': String(data.byteLength),
            },
            body: JSON.stringify({ name, parents: [folderId] }),
          },
          'upload',
        )
        if (!session.ok) await read(session, 'upload')
        const location = session.headers.get('location')
        if (!location) throw new DestinationError('Google Drive (upload): no upload address')
        const file = await read(
          await call(
            location,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/octet-stream' },
              body: data as Uint8Array<ArrayBuffer>,
            },
            'upload',
          ),
          'upload',
        )
        return file.webViewLink ? { link: String(file.webViewLink) } : undefined
      },
      async get(name) {
        const id = await find(name)
        if (!id) return null
        const response = await call(
          `${api()}/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
          { headers: await auth() },
          'download',
        )
        if (!response.ok) await read(response, 'download')
        return new Uint8Array(await response.arrayBuffer())
      },
      async delete(name) {
        const id = await find(name)
        if (!id) return
        const response = await call(
          `${api()}/drive/v3/files/${encodeURIComponent(id)}`,
          { method: 'DELETE', headers: await auth() },
          'delete',
        )
        if (!response.ok && response.status !== 404) await read(response, 'delete')
      },
    }
  },
}
