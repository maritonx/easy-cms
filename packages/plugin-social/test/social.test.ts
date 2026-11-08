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
  resolveConfig,
  silentLogger,
  verifyWebhook,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { socialPlugin } from '../src/index.js'

// A stand-in for Make or n8n: each path answers as `answers[path]` says, and records what came.
type Hit = {
  path: string
  headers: Record<string, string>
  raw: string
  body: Record<string, unknown>
}
const hits: Hit[] = []
const answers: Record<string, number> = {}
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
    })
    req.on('end', () => {
      const path = req.url ?? '/'
      hits.push({
        path,
        headers: req.headers as Record<string, string>,
        raw,
        body: JSON.parse(raw || '{}'),
      })
      const status = answers[path] ?? 200
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(status < 300 ? JSON.stringify({ url: `https://x.test/status${path}` }) : 'nope')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

const dirs: string[] = []
beforeEach(() => {
  hits.length = 0
  for (const key of Object.keys(answers)) delete answers[key]
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

const config = (extra: Partial<Config> = {}) =>
  defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
    auth: { rbac: true },
    collections: [
      {
        slug: 'posts',
        drafts: true,
        useAsTitle: 'title',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'slug', type: 'text' },
          { name: 'excerpt', type: 'textarea' },
          { name: 'cover', type: 'upload' },
        ],
      },
    ],
    plugins: [
      socialPlugin({
        collections: ['posts'],
        url: ({ doc }) => `https://blog.test/${String(doc.slug)}`,
      }),
    ],
    ...extra,
  })

async function open(c: Config = config()) {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-social-'))
  dirs.push(cwd)
  const cms = await createEasyCMS(c, {
    cwd,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
  const handle = createRestHandler(cms)
  const tokens: Record<string, string> = {}
  const login = async (email: string, role: string) => {
    await cms.create('users', { email, password: 'password123', role })
    tokens[email] = (await cms.auth.login({ email, password: 'password123' })).token
  }
  await login('admin@x.co', 'admin')
  const call = async (path: string, method = 'GET', body?: unknown, who = 'admin@x.co') => {
    const res = await handle(
      new Request(`http://cms.test/api/cms${path}`, {
        method,
        headers: {
          authorization: `Bearer ${tokens[who]}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    )
    const text = await res.text()
    return { status: res.status, body: (text ? JSON.parse(text) : null) as Record<string, any> }
  }
  const connect = (name: string, path: string, secret?: string) =>
    call('/admin/integrations/social-webhook/connections', 'POST', {
      name,
      values: { url: `${base}${path}`, ...(secret ? { secret } : {}) },
    })
  return { cms, call, login, connect }
}

const deliveryOf = async (cms: Awaited<ReturnType<typeof open>>['cms'], id: unknown) =>
  ((await cms.findById('social-posts', id as string, { depth: 0 })) as Record<string, any>).delivery

describe('socialPlugin config', () => {
  it('adds the social posts collection, the webhook channel, Share and the job', async () => {
    const resolved = await resolveConfig(config())
    const posts = resolved.collections.find((c) => c.slug === 'social-posts')
    expect(posts?.fields.map((f) => ('name' in f ? f.name : ''))).toEqual([
      'title',
      'text',
      'link',
      'image',
      'source',
      'channels',
      'delivery',
      'nextAt',
      'createdBy',
    ])
    expect(posts?.admin?.permissions).toEqual(['publish'])
    expect(resolved.integrations.map((i) => i.id)).toContain('social-webhook')
    expect(resolved.collections.find((c) => c.slug === 'posts')?.admin?.sidebar).toEqual([
      { tag: 'ecms-social-share' },
    ])
    expect(resolved.jobs.map((j) => j.name)).toContain('social:send')
    expect(resolved.events).toEqual(expect.arrayContaining(['social.posted', 'social.failed']))
  })
})

describe('socialPlugin', () => {
  it('shares a document, posts to each channel on its own, and retries the one that failed', async () => {
    const { cms, call, connect } = await open()
    expect((await connect('Make', '/make', 'make-secret')).status).toBe(201)
    expect((await connect('n8n', '/n8n')).status).toBe(201)
    hits.length = 0
    const events: { event: string; data: unknown }[] = []
    cms.on('social.posted', (m) => void events.push(m))
    cms.on('social.failed', (m) => void events.push(m))

    const post = await cms.create('posts', {
      title: 'Hello',
      slug: 'hello',
      excerpt: 'A first post',
      status: 'published',
    })
    const shared = await call('/social/share', 'POST', { collection: 'posts', id: post.id })
    expect(shared.status).toBe(200)
    const social = (await cms.findById('social-posts', shared.body.id, { depth: 0 })) as Record<
      string,
      any
    >
    expect(social).toMatchObject({
      title: 'Hello',
      text: 'A first post',
      link: 'https://blog.test/hello',
      channels: [{ connection: 'social-webhook:Make' }, { connection: 'social-webhook:n8n' }],
    })

    // n8n is down: Make posts, n8n waits a minute.
    answers['/n8n'] = 502
    const now = await call('/social/post', 'POST', { post: social.id, action: 'now' })
    expect(now.status).toBe(200)
    expect(now.body.delivery.channels['social-webhook:Make']).toMatchObject({
      state: 'posted',
      url: 'https://x.test/status/make',
      attempts: 1,
    })
    expect(now.body.delivery.channels['social-webhook:n8n']).toMatchObject({
      state: 'sending',
      attempts: 1,
      error: expect.stringContaining('502'),
    })
    // Signed like Easy CMS's webhooks, with the post's text, link and source.
    const make = hits.find((h) => h.path === '/make') as Hit
    expect(verifyWebhook(make.raw, make.headers, 'make-secret')).toMatchObject({
      text: 'A first post',
      link: 'https://blog.test/hello',
      channel: 'social-webhook:Make',
      source: { collection: 'posts', id: post.id },
      image: null,
    })
    expect(events.map((e) => e.event)).toEqual(['social.posted'])

    // The job tries again after a minute: n8n is back.
    delete answers['/n8n']
    await cms.runJobs(new Date(Date.now() + 2 * 60_000))
    expect((await deliveryOf(cms, social.id)).channels['social-webhook:n8n']).toMatchObject({
      state: 'posted',
      attempts: 2,
    })
    // Make posted once, not again.
    expect(hits.filter((h) => h.path === '/make')).toHaveLength(1)
    expect((await call('/social/post', 'POST', { post: social.id, action: 'now' })).status).toBe(
      400,
    )
  })

  it('gives a channel up on a refusal, and Retry sends only it', async () => {
    const { cms, call, connect } = await open()
    await connect('Make', '/make')
    await connect('n8n', '/n8n')
    hits.length = 0
    const failed: unknown[] = []
    cms.on('social.failed', ({ data }) => void failed.push(data))
    const social = await cms.create('social-posts', {
      title: 'News',
      text: 'Hi',
      channels: [
        { connection: 'social-webhook:Make' },
        { connection: 'social-webhook:n8n', text: 'Hi, n8n' },
      ],
    })
    answers['/n8n'] = 400
    await call('/social/post', 'POST', { post: social.id, action: 'now' })
    let delivery = await deliveryOf(cms, social.id)
    expect(delivery.channels['social-webhook:n8n']).toMatchObject({ state: 'failed', attempts: 1 })
    expect(hits.find((h) => h.path === '/n8n')?.body.text).toBe('Hi, n8n')
    await new Promise((r) => setTimeout(r, 10))
    expect(failed).toEqual([
      expect.objectContaining({
        channel: 'social-webhook:n8n',
        error: expect.stringContaining('400'),
      }),
    ])
    // The connection says so on the Integrations page.
    const overview = await call('/admin/integrations')
    const card = overview.body.integrations.find((i: { id: string }) => i.id === 'social-webhook')
    expect(card.connections.find((c: { name: string }) => c.name === 'n8n').lastError).toContain(
      '400',
    )

    delete answers['/n8n']
    expect(
      (
        await call('/social/post', 'POST', {
          post: social.id,
          action: 'retry',
          channel: 'social-webhook:Make',
        })
      ).status,
    ).toBe(400)
    await call('/social/post', 'POST', {
      post: social.id,
      action: 'retry',
      channel: 'social-webhook:n8n',
    })
    delivery = await deliveryOf(cms, social.id)
    expect(delivery.channels['social-webhook:n8n'].state).toBe('posted')
    expect(hits.filter((h) => h.path === '/make')).toHaveLength(1)

    // A channel that posted keeps its text and stays on the post.
    await cms.update('social-posts', social.id, {
      channels: [{ connection: 'social-webhook:n8n', text: 'Changed' }],
    })
    const kept = (await cms.findById('social-posts', social.id, { depth: 0 })) as Record<
      string,
      any
    >
    expect(kept.channels).toEqual([
      expect.objectContaining({ connection: 'social-webhook:n8n', text: 'Hi, n8n' }),
      expect.objectContaining({ connection: 'social-webhook:Make' }),
    ])
  })

  it('schedules, cancels, and waits a while for an unpublished source', async () => {
    const { cms, call, connect } = await open()
    await connect('Make', '/make')
    hits.length = 0
    const draft = await cms.create('posts', { title: 'Soon', slug: 'soon' })
    const social = await cms.create('social-posts', {
      title: 'Soon',
      text: 'Soon',
      source: draft.id,
      channels: [{ connection: 'social-webhook:Make' }],
    })
    const at = new Date(Date.now() + 10 * 60_000)
    expect(
      (
        await call('/social/post', 'POST', {
          post: social.id,
          action: 'schedule',
          postAt: new Date(Date.now() - 1000).toISOString(),
        })
      ).status,
    ).toBe(400)
    await call('/social/post', 'POST', {
      post: social.id,
      action: 'schedule',
      postAt: at.toISOString(),
    })
    expect((await deliveryOf(cms, social.id)).channels['social-webhook:Make'].state).toBe(
      'scheduled',
    )
    await cms.runJobs(new Date(Date.now() + 60_000))
    expect(hits).toHaveLength(0)
    await call('/social/post', 'POST', { post: social.id, action: 'cancel' })
    expect((await deliveryOf(cms, social.id)).channels['social-webhook:Make'].state).toBe('waiting')
    await cms.runJobs(new Date(at.getTime() + 60_000))
    expect(hits).toHaveLength(0)

    // Scheduled again; the source is still a draft at that time: it waits, then gives up.
    await call('/social/post', 'POST', {
      post: social.id,
      action: 'schedule',
      postAt: at.toISOString(),
    })
    await cms.runJobs(new Date(at.getTime() + 120_000))
    expect((await deliveryOf(cms, social.id)).channels['social-webhook:Make'].state).toBe('sending')
    expect(hits).toHaveLength(0)
    await cms.runJobs(new Date(at.getTime() + 2 * 3_600_000))
    expect((await deliveryOf(cms, social.id)).channels['social-webhook:Make']).toMatchObject({
      state: 'failed',
      error: expect.stringContaining('isn’t published'),
    })
  })

  it('posts on time once the source is published', async () => {
    const { cms, call, connect } = await open()
    await connect('Make', '/make')
    hits.length = 0
    const page = await cms.create('posts', { title: 'Out', slug: 'out', status: 'published' })
    const social = await cms.create('social-posts', {
      title: 'Out',
      text: 'Out now',
      source: page.id,
      channels: [{ connection: 'social-webhook:Make' }],
    })
    const at = new Date(Date.now() + 5 * 60_000)
    await call('/social/post', 'POST', {
      post: social.id,
      action: 'schedule',
      postAt: at.toISOString(),
    })
    await cms.runJobs(new Date(at.getTime() + 1000))
    expect(hits.map((h) => h.body.text)).toEqual(['Out now'])
    expect((await deliveryOf(cms, social.id)).channels['social-webhook:Make'].state).toBe('posted')
  })

  it('needs the right to post, and a public image', async () => {
    const { cms, call, connect, login } = await open()
    await connect('Make', '/make')
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    const media = await cms.upload({ data: new Uint8Array(png), name: 'dot.png' })
    const social = await cms.create('social-posts', {
      title: 'Pic',
      text: 'Pic',
      image: media.id,
      channels: [{ connection: 'social-webhook:Make' }],
    })
    // Said before posting, then refused when posting.
    expect((await call('/social/post', 'POST', { post: social.id, action: 'check' })).body).toEqual(
      {
        problems: ['Set `serverURL` so channels can fetch the image'],
        notes: {},
      },
    )
    const refused = await call('/social/post', 'POST', { post: social.id, action: 'now' })
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.body)).toContain('serverURL')

    // A role that may write posts but not post them.
    await call('/admin/roles', 'POST', {
      key: 'writer',
      name: 'Writer',
      permissions: { collections: { 'social-posts': ['read', 'create', 'update'] } },
    })
    await login('w@x.co', 'writer')
    expect((await call('/social/channels', 'GET', undefined, 'w@x.co')).body.canPost).toBe(false)
    expect(
      (await call('/social/post', 'POST', { post: social.id, action: 'now' }, 'w@x.co')).status,
    ).toBe(403)
    const roles = await call('/admin/roles')
    expect(
      roles.body.collections.find((c: { slug: string }) => c.slug === 'social-posts').ops,
    ).toContain('publish')
    const channels = await call('/social/channels')
    expect(channels.body).toEqual({
      channels: [{ id: 'social-webhook:Make', label: 'Webhook (social) · Make', icon: 'link' }],
      canPost: true,
    })
  })
})

describe('Write with AI', () => {
  // A provider of the test's own: an integration whose key comes from the environment.
  const asked: { system?: string; prompt: string }[] = []
  let answer = '"Our first post is out: read how we started."'
  const withAi = (): Config => {
    const base = config()
    return {
      ...base,
      plugins: [
        ...(base.plugins ?? []),
        (c: Config): Config => ({
          ...c,
          integrations: [
            ...(c.integrations ?? []),
            {
              id: 'fake-ai',
              label: 'Fake AI',
              category: 'ai',
              kind: 'fields',
              fields: [{ name: 'key', required: true, secret: true }],
              env: { key: 'FAKE_AI_KEY' },
            },
          ],
          ai: {
            providers: [
              {
                integration: 'fake-ai',
                generate: async (_values, request) => {
                  asked.push(request)
                  return { text: answer, usage: { input: 10, output: 5 } }
                },
              },
            ],
          },
        }),
      ],
    }
  }

  it('writes the text from the shared document, for a channel when named', async () => {
    process.env.FAKE_AI_KEY = 'k'
    try {
      const { cms, call, login } = await open(withAi())
      expect(cms.config.aiFeatures.map((f) => f.id)).toContain('social')
      const page = await cms.create('posts', {
        title: 'How we started',
        excerpt: 'The story of the first week',
        status: 'published',
      })
      const social = await cms.create('social-posts', { title: 'x', text: 'x', source: page.id })
      const written = await call('/social/ai', 'POST', {
        post: social.id,
        doc: { title: 'x', text: 'x', source: page.id },
      })
      expect(written.body).toEqual({ text: 'Our first post is out: read how we started.' })
      expect(asked.at(-1)?.prompt).toContain('How we started\n\nThe story of the first week')
      expect(asked.at(-1)?.system).toContain('At most 500 characters')
      // Before the post is saved: its title, without a source.
      await call('/social/ai', 'POST', { post: null, doc: { title: 'Launch day' } })
      expect(asked.at(-1)?.prompt).toBe('The page:\n\nLaunch day')
      // Too long: cut to the channel's limit.
      answer = 'x'.repeat(600)
      const cut = await call('/social/ai', 'POST', { post: social.id, doc: { title: 'T' } })
      expect([...(cut.body.text as string)]).toHaveLength(500)

      expect((await call('/social/ai', 'POST', { post: social.id, doc: {} })).status).toBe(400)
      await call('/admin/roles', 'POST', {
        key: 'reader',
        name: 'Reader',
        permissions: { collections: { 'social-posts': ['read'] } },
      })
      await login('r@x.co', 'reader')
      expect(
        (await call('/social/ai', 'POST', { post: social.id, doc: { title: 'T' } }, 'r@x.co'))
          .status,
      ).toBe(403)
    } finally {
      delete process.env.FAKE_AI_KEY
    }
  })
})
