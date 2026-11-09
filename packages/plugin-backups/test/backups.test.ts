import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AdminBackup,
  type AdminBackups,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { backupsPlugin, googleDrive, s3Compatible } from '../src/index.js'

// Google's OAuth and Drive API, as far as the destination uses them (#395).
type Hit = { method: string; path: string; search: URLSearchParams; body: Buffer }
const hits: Hit[] = []
const files = new Map<string, { name: string; body: Buffer }>()
const sessions = new Map<string, string>()
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x')
      const body = Buffer.concat(chunks)
      hits.push({ method: req.method ?? 'GET', path: url.pathname, search: url.searchParams, body })
      const send = (status: number, data: unknown, headers: Record<string, string> = {}) =>
        res
          .writeHead(status, { 'content-type': 'application/json', ...headers })
          .end(JSON.stringify(data))
      const form = new URLSearchParams(body.toString())
      if (url.pathname === '/token') {
        // The code says which refresh token comes back.
        if (form.get('grant_type') === 'authorization_code')
          return send(200, {
            access_token: 'a1',
            refresh_token: form.get('code') === 'revoked' ? 'revoked' : 'r1',
            expires_in: 3599,
          })
        if (form.get('refresh_token') === 'revoked')
          return send(400, {
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          })
        return send(200, { access_token: 'a2', expires_in: 3599 })
      }
      if (url.pathname === '/drive/v3/about')
        return send(200, { user: { emailAddress: 'me@gmail.test' } })
      if (url.pathname === '/drive/v3/files' && req.method === 'POST')
        return send(200, { id: 'folder-1' })
      if (url.pathname === '/drive/v3/files/folder-1')
        return send(200, { name: 'Easy CMS backups – cms.test', trashed: false })
      if (url.pathname === '/upload/drive/v3/files') {
        if (req.headers['x-upload-content-type'] !== 'application/octet-stream')
          return send(400, { error: { message: 'no type' } })
        const id = `s${sessions.size + 1}`
        sessions.set(id, String(JSON.parse(body.toString()).name))
        return send(200, {}, { location: `${base}/upload/session/${id}` })
      }
      const session = /^\/upload\/session\/(\w+)$/.exec(url.pathname)?.[1]
      if (session) {
        const id = `file-${files.size + 1}`
        files.set(id, { name: sessions.get(session) ?? '', body })
        return send(200, { id, webViewLink: `https://drive.test/${id}` })
      }
      if (url.pathname === '/drive/v3/files' && req.method === 'GET') {
        const name = /name = '([^']+)'/.exec(url.searchParams.get('q') ?? '')?.[1]
        const found = [...files].find(([, f]) => f.name === name)
        return send(200, { files: found ? [{ id: found[0] }] : [] })
      }
      const file = /^\/drive\/v3\/files\/(file-\d+)$/.exec(url.pathname)?.[1]
      if (file && req.method === 'DELETE') {
        files.delete(file)
        return res.writeHead(204).end()
      }
      if (file && url.searchParams.get('alt') === 'media')
        return res.writeHead(200).end(files.get(file)?.body)
      send(404, { error: { message: `Unknown ${url.pathname}` } })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  Object.assign(process.env, {
    GOOGLE_AUTH_URL: `${base}/auth`,
    GOOGLE_TOKEN_URL: `${base}/token`,
    GOOGLE_API_URL: base,
  })
})
afterAll(() => {
  for (const key of ['GOOGLE_AUTH_URL', 'GOOGLE_TOKEN_URL', 'GOOGLE_API_URL'])
    delete process.env[key]
  server.close()
})

/** A bucket in memory, answering as S3 does; `refuse` makes it answer 403. */
const bucket = new Map<string, Uint8Array>()
let refuse = false
const fakeS3 = (async (input: Request | string | URL, init?: RequestInit) => {
  const request = input instanceof Request ? input : new Request(input, init)
  const key = decodeURIComponent(new URL(request.url).pathname.split('/').slice(2).join('/'))
  if (refuse) return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
  if (request.method === 'PUT') {
    bucket.set(key, new Uint8Array(await request.arrayBuffer()))
    return new Response(null, { status: 200 })
  }
  if (request.method === 'DELETE') {
    bucket.delete(key)
    return new Response(null, { status: 204 })
  }
  const found = bucket.get(key)
  return found
    ? new Response(found as Uint8Array<ArrayBuffer>, { status: 200 })
    : new Response(null, { status: 404 })
}) as typeof fetch

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
beforeEach(() => {
  hits.length = 0
  files.clear()
  sessions.clear()
  bucket.clear()
  refuse = false
})

async function open() {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-backups-'))
  dirs.push(cwd)
  const cms = await createEasyCMS(
    defineConfig({
      secret: 'x'.repeat(32),
      db: sqlite({ url: 'file:./cms.db' }),
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
      plugins: [backupsPlugin({ destinations: [googleDrive, s3Compatible({ fetch: fakeS3 })] })],
    }),
    { cwd, schema: 'push', logger: silentLogger, scheduler: false },
  )
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  const { token } = await cms.auth.login({ email: 'admin@x.co', password: 'password123' })
  const handle = createRestHandler(cms)
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const res = await handle(
      new Request(`http://cms.test/api/cms${path}`, {
        method,
        redirect: 'manual',
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    )
    const text = await res.text()
    let parsed: Record<string, any> = {}
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {}
    return { status: res.status, res, body: parsed }
  }
  const backUp = async (): Promise<AdminBackup> => {
    const started = await call('/admin/backups', 'POST')
    expect(started.status).toBe(202)
    for (let i = 0; i < 400; i++) {
      const row = ((await call('/admin/backups')).body as AdminBackups).backups.find(
        (b) => b.id === started.body.id,
      )
      if (row && (row.state === 'done' || row.state === 'failed')) return row
      await new Promise((r) => setTimeout(r, 25))
    }
    throw new Error('the backup did not finish')
  }
  return { cms, call, backUp }
}

describe('Google Drive', () => {
  it('connects through Google with the app’s keys, and keeps backups in a folder of its own', async () => {
    const { cms, call, backUp } = await open()
    // The app's keys first, then the policy, then Google.
    expect(
      (await call('/admin/integrations/google-drive/authorize', 'POST', { name: 'Drive' })).status,
    ).toBe(400)
    await call('/admin/integrations/google-drive/app', 'PUT', {
      values: { clientId: 'client-1', clientSecret: 'secret-1' },
    })
    await call('/admin/integrations/google-drive/consent', 'POST')
    const started = await call('/admin/integrations/google-drive/authorize', 'POST', {
      name: 'Drive',
    })
    const authorize = new URL(started.body.url)
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      client_id: 'client-1',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      redirect_uri: 'http://cms.test/api/cms/admin/integrations/google-drive/callback',
    })
    const back = await call(
      `/admin/integrations/google-drive/callback?code=c1&state=${encodeURIComponent(authorize.searchParams.get('state') ?? '')}`,
    )
    expect(back.res.headers.get('location')).toContain('connected=1')
    const conn = await cms.integrations.get('google-drive')
    expect(conn?.values).toEqual({ refreshToken: 'r1', folderId: 'folder-1' })
    const folder = hits.find((h) => h.path === '/drive/v3/files' && h.method === 'POST')
    expect(JSON.parse(String(folder?.body))).toEqual({
      name: 'Easy CMS backups – cms.test',
      mimeType: 'application/vnd.google-apps.folder',
    })
    const card = (await call('/admin/integrations')).body.integrations.find(
      (i: { id: string }) => i.id === 'google-drive',
    )
    expect(card.connections[0].account).toBe('me@gmail.test')
    expect(
      (
        await call(
          `/admin/integrations/google-drive/connections/${card.connections[0].id}/test`,
          'POST',
        )
      ).body,
    ).toEqual({
      ok: true,
      account: 'Easy CMS backups – cms.test',
    })

    // Only to the drive: uploaded in a resumable session, downloaded and deleted there.
    await call('/admin/backups/settings', 'PUT', {
      server: false,
      destinations: [{ connection: `google-drive:${conn?.name}` }],
    })
    const backup = await backUp()
    expect(backup.copies[`google-drive:${conn?.name}`]).toMatchObject({
      state: 'done',
      link: 'https://drive.test/file-1',
    })
    expect(files.get('file-1')?.name).toBe(backup.filename)
    const download = await call(`/admin/backups/${backup.id}/download`)
    expect(download.status).toBe(200)
    expect((await call(`/admin/backups/${backup.id}`, 'DELETE')).status).toBe(200)
    expect(files.size).toBe(0)
  })

  it('gives up at once when Google took access back, and says so on the card', async () => {
    const { cms, call, backUp } = await open()
    await call('/admin/integrations/google-drive/app', 'PUT', {
      values: { clientId: 'client-1', clientSecret: 'secret-1' },
    })
    // Connected with a refresh token Google later took back.
    await call('/admin/integrations/google-drive/consent', 'POST')
    const started = await call('/admin/integrations/google-drive/authorize', 'POST', {
      name: 'Old',
    })
    const state = new URL(started.body.url).searchParams.get('state') ?? ''
    await call(
      `/admin/integrations/google-drive/callback?code=revoked&state=${encodeURIComponent(state)}`,
    )
    expect((await cms.integrations.get('google-drive'))?.values.refreshToken).toBe('revoked')
    await call('/admin/backups/settings', 'PUT', {
      destinations: [{ connection: 'google-drive:Old' }],
    })
    const backup = await backUp()
    expect(backup.state).toBe('done')
    expect(backup.copies['google-drive:Old']).toMatchObject({
      state: 'failed',
      error: expect.stringContaining(
        'Token has been expired or revoked. — connect the account again',
      ),
    })
    const card = (await call('/admin/integrations')).body.integrations.find(
      (i: { id: string }) => i.id === 'google-drive',
    )
    expect(card.connections[0].lastError).toContain('connect the account again')
  })
})

describe('S3-compatible storage', () => {
  it('checks the bucket when connecting, and keeps backups under its folder', async () => {
    const { call, backUp } = await open()
    await call('/admin/integrations/s3-backups/consent', 'POST')
    const made = await call('/admin/integrations/s3-backups/connections', 'POST', {
      name: 'R2',
      values: {
        endpoint: 'https://acct.r2.test',
        bucket: 'site-backups',
        prefix: 'cms/',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    })
    expect(made.status).toBe(201)
    // The check file was written and removed again.
    expect(bucket.size).toBe(0)
    await call('/admin/backups/settings', 'PUT', {
      destinations: [{ connection: 's3-backups:R2', keep: 3 }],
    })
    const backup = await backUp()
    expect(backup.copies['s3-backups:R2']?.state).toBe('done')
    expect([...bucket.keys()]).toEqual([`cms/${backup.filename}`])
  })

  it('refuses keys without access when connecting', async () => {
    const { call } = await open()
    await call('/admin/integrations/s3-backups/consent', 'POST')
    refuse = true
    const made = await call('/admin/integrations/s3-backups/connections', 'POST', {
      name: 'Bad',
      values: { bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' },
    })
    expect(made.status).toBe(400)
    expect(JSON.stringify(made.body)).toContain('S3:')
  })
})
