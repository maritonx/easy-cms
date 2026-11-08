import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { socialPlugin } from '../src/index.js'

// Facebook's Graph API and LINE's Messaging API, as far as the adapters use them (#313).
type Hit = {
  method: string
  path: string
  query: URLSearchParams
  body: string
  auth: string | undefined
}
const hits: Hit[] = []
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => {
      body += c
    })
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x')
      const path = url.pathname
      const form = new URLSearchParams(body)
      const query = req.method === 'GET' ? url.searchParams : form
      hits.push({ method: req.method ?? 'GET', path, query, body, auth: req.headers.authorization })
      const send = (status: number, data: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data))
      const token = query.get('access_token') ?? ''
      if (path.startsWith('/graph/v26.0/') && token === 'expired')
        return send(400, { error: { message: 'Error validating access token', code: 190 } })
      if (path === '/graph/v26.0/oauth/access_token')
        return query.get('grant_type') === 'fb_exchange_token'
          ? send(200, { access_token: 'long-user' })
          : send(200, { access_token: 'short-user' })
      if (path === '/graph/v26.0/me/accounts')
        return send(200, {
          data: [
            { id: 'p1', name: 'Easy CMS', access_token: 'page-1' },
            { id: 'p2', name: 'Easy CMS Dev', access_token: 'page-2' },
          ],
        })
      if (path === '/graph/v26.0/me')
        return send(200, { name: token === 'page-1' ? 'Easy CMS' : 'Other' })
      if (path === '/graph/v26.0/p1/feed') return send(200, { id: 'p1_123' })
      if (path === '/graph/v26.0/p1/photos') return send(200, { id: 'photo', post_id: 'p1_456' })
      const bearer = req.headers.authorization ?? ''
      if (path.startsWith('/line/') && bearer === 'Bearer revoked')
        return send(401, { message: 'Authentication failed' })
      if (path === '/line/v2/bot/info')
        return send(200, { displayName: 'Easy CMS', basicId: '@easycms' })
      if (path === '/line/v2/bot/insight/followers')
        return send(200, { status: 'ready', followers: 1200, targetedReaches: 1000 })
      if (path === '/line/v2/bot/message/quota') return send(200, { type: 'limited', value: 200 })
      if (path === '/line/v2/bot/message/quota/consumption') return send(200, { totalUsage: 150 })
      if (path === '/line/v2/bot/message/broadcast') return send(200, {})
      send(404, { error: { message: `Unknown ${path}` } })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  Object.assign(process.env, {
    META_APP_ID: 'app-1',
    META_APP_SECRET: 'app-secret',
    FACEBOOK_GRAPH_URL: `${base}/graph`,
    FACEBOOK_DIALOG_URL: `${base}/dialog`,
    LINE_API_URL: `${base}/line`,
  })
})
afterAll(() => {
  for (const key of [
    'META_APP_ID',
    'META_APP_SECRET',
    'FACEBOOK_GRAPH_URL',
    'FACEBOOK_DIALOG_URL',
    'LINE_API_URL',
  ])
    delete process.env[key]
  server.close()
})

const dirs: string[] = []
beforeEach(() => {
  hits.length = 0
})
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Windows may still hold the SQLite file; the OS cleans temp.
    }
  }
})

async function open() {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-channels-'))
  dirs.push(cwd)
  const config: Config = defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
    // Public image URLs for the channels.
    serverURL: 'https://cms.example',
    collections: [],
    plugins: [socialPlugin()],
  })
  const cms = await createEasyCMS(config, {
    cwd,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
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
    return {
      status: res.status,
      res,
      body: (text ? JSON.parse(text) : null) as Record<string, any>,
    }
  }
  return { cms, call }
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

describe('Facebook Page', () => {
  it('connects a Page through OAuth, posts text with a link and a photo with its caption', async () => {
    const { cms, call } = await open()
    const started = await call('/admin/integrations/facebook-page/authorize', 'POST', {
      name: 'Page',
    })
    const authorize = new URL(started.body.url)
    expect(authorize.pathname).toBe('/dialog/v26.0/dialog/oauth')
    expect(authorize.searchParams.get('client_id')).toBe('app-1')
    expect(authorize.searchParams.get('scope')).toBe(
      'pages_show_list,pages_manage_posts,pages_read_engagement',
    )
    // Back from Facebook: two Pages to choose from.
    const back = await call(
      `/admin/integrations/facebook-page/callback?code=good&state=${encodeURIComponent(authorize.searchParams.get('state') ?? '')}`,
    )
    const pending = new URL(back.res.headers.get('location') ?? '').searchParams.get('pending')
    const choices = await call(`/admin/integrations/facebook-page/pending/${pending}`)
    expect(choices.body.accounts.map((a: { name: string }) => a.name)).toEqual([
      'Easy CMS',
      'Easy CMS Dev',
    ])
    expect(
      hits
        .find((h) => h.query.get('grant_type') === 'fb_exchange_token')
        ?.query.get('fb_exchange_token'),
    ).toBe('short-user')
    await call(`/admin/integrations/facebook-page/pending/${pending}`, 'POST', { account: 'p1' })
    const page = await cms.integrations.get('facebook-page')
    expect(page?.values).toEqual({ pageId: 'p1', token: 'page-1' })
    expect(
      (
        await call(
          `/admin/integrations/facebook-page/connections/${(await call('/admin/integrations')).body.integrations.find((i: { id: string }) => i.id === 'facebook-page').connections[0].id}/test`,
          'POST',
        )
      ).body,
    ).toEqual({ ok: true, account: 'Easy CMS' })

    const connection = `facebook-page:${page?.name}`
    const text = await cms.create('social-posts', {
      title: 'Out now',
      text: 'Our guide is out',
      link: 'https://easycms.dev/guide',
      channels: [{ connection }],
    })
    hits.length = 0
    const now = await call('/social/post', 'POST', { post: text.id, action: 'now' })
    expect(now.body.delivery.channels[connection]).toMatchObject({
      state: 'posted',
      url: 'https://www.facebook.com/p1_123',
    })
    const feed = hits.find((h) => h.path.endsWith('/p1/feed')) as Hit
    expect(Object.fromEntries(feed.query)).toEqual({
      message: 'Our guide is out',
      link: 'https://easycms.dev/guide',
      access_token: 'page-1',
    })

    const media = await cms.upload({ data: new Uint8Array(png), name: 'cover.png' })
    const photo = await cms.create('social-posts', {
      title: 'Pic',
      text: 'A new cover',
      link: 'https://easycms.dev/guide',
      image: media.id,
      channels: [{ connection }],
    })
    hits.length = 0
    const posted = await call('/social/post', 'POST', { post: photo.id, action: 'now' })
    expect(posted.body.delivery.channels[connection].url).toBe('https://www.facebook.com/p1_456')
    const photos = hits.find((h) => h.path.endsWith('/p1/photos')) as Hit
    expect(photos.query.get('caption')).toBe('A new cover\n\nhttps://easycms.dev/guide')
    expect(photos.query.get('url')).toMatch(/^https:\/\/cms\.example\//)
  })

  it('gives up on an expired token and says so on the card', async () => {
    const { cms, call } = await open()
    // A connection whose Page token was taken back.
    await cms.db.create({
      collection: 'connections',
      data: {
        kind: 'connection',
        integration: 'facebook-page',
        name: 'Old',
        isDefault: true,
        values: { pageId: 'p1', token: 'expired' },
        secret: null,
        account: null,
        lastUsedAt: null,
        lastError: null,
        enabled: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    const social = await cms.create('social-posts', {
      title: 'x',
      text: 'x',
      channels: [{ connection: 'facebook-page:Old' }],
    })
    const now = await call('/social/post', 'POST', { post: social.id, action: 'now' })
    expect(now.body.delivery.channels['facebook-page:Old']).toMatchObject({
      state: 'failed',
      attempts: 1,
      error: 'Facebook: Error validating access token',
    })
    const card = (await call('/admin/integrations')).body.integrations.find(
      (i: { id: string }) => i.id === 'facebook-page',
    )
    expect(card.connections[0].lastError).toContain('Error validating access token')
  })
})

describe('LINE OA', () => {
  it('connects with a token, says the reach and quota first, and broadcasts a card', async () => {
    const { cms, call } = await open()
    const made = await call('/admin/integrations/line-oa/connections', 'POST', {
      name: 'Main',
      values: { token: 'line-token', readMore: 'อ่านต่อ' },
    })
    expect(made.status).toBe(201)
    const card = (await call('/admin/integrations')).body.integrations.find(
      (i: { id: string }) => i.id === 'line-oa',
    )
    expect(card.connections[0].account).toBe('Easy CMS @easycms')

    const media = await cms.upload({ data: new Uint8Array(png), name: 'cover.png' })
    const social = await cms.create('social-posts', {
      title: 'คู่มือใหม่',
      text: 'อ่านคู่มือการติดตั้งฉบับใหม่ได้แล้ววันนี้',
      link: 'https://easycms.dev/th/guide',
      image: media.id,
      channels: [{ connection: 'line-oa:Main' }],
    })
    const check = await call('/social/post', 'POST', { post: social.id, action: 'check' })
    expect(check.body.notes['line-oa:Main']).toEqual({
      info: 'Reaches about 1,000 followers · messages this month: 150 / 200',
      warning: expect.stringContaining('goes over the month’s free messages'),
    })
    hits.length = 0
    const now = await call('/social/post', 'POST', { post: social.id, action: 'now' })
    expect(now.body.delivery.channels['line-oa:Main']).toMatchObject({ state: 'posted', url: null })
    const broadcast = hits.find((h) => h.path === '/line/v2/bot/message/broadcast') as Hit
    expect(broadcast.auth).toBe('Bearer line-token')
    const [message] = JSON.parse(broadcast.body).messages
    expect(message).toMatchObject({
      type: 'flex',
      altText: 'คู่มือใหม่: อ่านคู่มือการติดตั้งฉบับใหม่ได้แล้ววันนี้',
      contents: {
        type: 'bubble',
        hero: { type: 'image', url: expect.stringMatching(/^https:\/\/cms\.example\//) },
        body: {
          contents: [
            { type: 'text', text: 'คู่มือใหม่', weight: 'bold' },
            { type: 'text', text: 'อ่านคู่มือการติดตั้งฉบับใหม่ได้แล้ววันนี้' },
          ],
        },
        footer: {
          contents: [
            {
              type: 'button',
              action: { type: 'uri', label: 'อ่านต่อ', uri: 'https://easycms.dev/th/guide' },
            },
          ],
        },
      },
    })
    // The channel's limit, for the admin's counter.
    const channels = await call('/social/channels')
    expect(
      channels.body.channels.find((c: { id: string }) => c.id === 'line-oa:Main').maxLength,
    ).toBe(300)
  })

  it('refuses a revoked token without trying again', async () => {
    const { cms, call } = await open()
    expect(
      (
        await call('/admin/integrations/line-oa/connections', 'POST', {
          name: 'Old',
          values: { token: 'revoked' },
        })
      ).status,
    ).toBe(400)
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'revoked'
    try {
      const social = await cms.create('social-posts', {
        title: 'x',
        text: 'x',
        channels: [{ connection: 'line-oa:Environment' }],
      })
      const now = await call('/social/post', 'POST', { post: social.id, action: 'now' })
      expect(now.body.delivery.channels['line-oa:Environment']).toMatchObject({
        state: 'failed',
        error: 'LINE: Authentication failed',
      })
    } finally {
      delete process.env.LINE_CHANNEL_ACCESS_TOKEN
    }
  })
})
