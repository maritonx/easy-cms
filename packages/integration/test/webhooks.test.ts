import { createHmac } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { defineConfig, type WebhookPayload } from '@easy-cms/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

interface Received {
  headers: IncomingHttpHeaders
  body: string
  payload: WebhookPayload
}

let server: Server
let url = ''
let received: Received[] = []
/** Status codes to answer with, in order; then 204. */
let answers: number[] = []
/** While set, requests wait for it before being answered. */
let hold: Promise<void> | undefined

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      received.push({ headers: req.headers, body, payload: JSON.parse(body) })
      const status = answers.shift() ?? 204
      void (hold ?? Promise.resolve()).then(() => {
        res.statusCode = status
        res.end()
      })
    })
  })
  // Longer than the 5 s between retries, so a retry never reuses a socket the server just closed.
  server.keepAliveTimeout = 30_000
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
beforeEach(() => {
  received = []
  answers = []
  hold = undefined
})

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    webhooks: [
      { url: `${url}/all`, secret: 'hook-secret', headers: { authorization: 'Bearer abc' } },
      {
        url: `${url}/publish`,
        events: ['publish', 'unpublish'],
        collections: ['posts'],
        globals: [],
      },
    ],
    collections: [
      {
        slug: 'posts',
        drafts: true,
        versions: true,
        fields: [{ name: 'title', type: 'text' }],
      },
      { slug: 'notes', fields: [{ name: 'text', type: 'text' }] },
    ],
    globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }],
  })

describe('webhooks (FR-HOOK)', () => {
  it('sends signed events for creates, updates, deletes and publishing (FR-HOOK-01)', async () => {
    const cms = await open(config())
    const post = await cms.create('posts', { title: 'Draft' })
    await cms.update('posts', post.id, { status: 'published' })
    await cms.update('posts', post.id, { title: 'Live edit', status: 'draft' }) // draft only
    await cms.unpublish('posts', post.id)
    await cms.delete('posts', post.id)
    await cms.updateGlobal('site', { name: 'Site' })
    await cms.flushWebhooks()

    const all = received.filter((r) => r.headers.authorization === 'Bearer abc')
    expect(all.map((r) => r.payload.event)).toEqual([
      'create',
      'update',
      'publish',
      'draft',
      'update',
      'unpublish',
      'delete',
      'update',
    ])
    const [first] = all
    expect(first?.payload).toMatchObject({
      event: 'create',
      collection: 'posts',
      id: post.id,
      doc: { id: post.id, title: 'Draft', status: 'draft' },
    })
    expect(first?.headers['content-type']).toBe('application/json')
    const signature = createHmac('sha256', 'hook-secret')
      .update(first?.body ?? '')
      .digest('hex')
    expect(first?.headers['x-easy-cms-signature']).toBe(`sha256=${signature}`)
    expect(all.at(-1)?.payload).toMatchObject({
      event: 'update',
      global: 'site',
      doc: { name: 'Site' },
    })

    // The filtered webhook only gets publish/unpublish of posts.
    const filtered = received.filter((r) => r.headers.authorization === undefined)
    expect(filtered.map((r) => r.payload.event)).toEqual(['publish', 'unpublish'])
    await cms.destroy()
  })

  it('retries server errors and never blocks or breaks the save (FR-HOOK-02)', async () => {
    const cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        webhooks: [{ url: `${url}/flaky` }],
        collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
      }),
    )
    answers = [503]
    const note = await cms.create('notes', { text: 'x' })
    expect(note.text).toBe('x')
    await cms.flushWebhooks()
    expect(received.map((r) => r.payload.event)).toEqual(['create', 'create'])
    // Same delivery id on the retry, so receivers can ignore duplicates.
    expect(received[0]?.headers['x-easy-cms-delivery']).toBe(
      received[1]?.headers['x-easy-cms-delivery'],
    )
    await cms.destroy()
  })

  it('keeps failed deliveries in the database and retries them later (FR-HOOK-03)', async () => {
    const cwd = tempProject()
    const flaky = defineConfig({
      secret: SECRET,
      db: db(),
      webhooks: [{ url: `${url}/down`, secret: 'hook-secret' }],
      collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
    })
    const first = await open(flaky, cwd)
    answers = [503, 503, 503]
    const note = await first.create('notes', { text: 'x' })
    await first.flushWebhooks()
    expect(received).toHaveLength(3) // the first attempt and two quick retries
    const deliveries = () =>
      rawQuery(cwd, `select state, attempts, error from ${table(cwd, 'webhook_deliveries')}`)
    expect(await deliveries()).toMatchObject([
      { state: 'pending', attempts: 3, error: 'status 503' },
    ])
    // Not due yet.
    expect(await first.retryWebhooks()).toEqual({ sent: 0, failed: 0 })
    await first.destroy()

    // A restart loses nothing: the next process retries once the time comes.
    const second = await open(flaky, cwd)
    const inAMinute = new Date(Date.now() + 61_000)
    expect(await second.runJobs(inAMinute)).toEqual({
      ran: 0,
      failed: 0,
      webhooks: { sent: 1, failed: 0 },
    })
    expect(received).toHaveLength(4)
    const [firstTry, , , retry] = received
    expect(retry?.payload).toEqual(firstTry?.payload)
    expect(retry?.payload).toMatchObject({ event: 'create', id: note.id })
    expect(retry?.headers['x-easy-cms-delivery']).toBe(firstTry?.headers['x-easy-cms-delivery'])
    expect(retry?.headers['x-easy-cms-signature']).toBe(firstTry?.headers['x-easy-cms-signature'])
    expect(await deliveries()).toEqual([])
    await second.destroy()
  })

  it('saves a delivery before the first attempt, so a process stopping mid-send loses nothing', async () => {
    const cwd = tempProject()
    const config = defineConfig({
      secret: SECRET,
      db: db(),
      webhooks: [{ url: `${url}/slow` }],
      collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
    })
    let release = () => {}
    hold = new Promise((resolve) => {
      release = resolve
    })
    const stopping = await open(config, cwd)
    await stopping.create('notes', { text: 'x' })
    await expect.poll(() => received.length).toBe(1) // the first attempt is in flight
    expect(
      await rawQuery(cwd, `select state, attempts from ${table(cwd, 'webhook_deliveries')}`),
    ).toMatchObject([{ state: 'pending', attempts: 0 }])

    // Another process picks it up once the claim of the first one has run out.
    hold = undefined
    const next = await open(config, cwd)
    expect(await next.retryWebhooks()).toEqual({ sent: 0, failed: 0 })
    expect(await next.retryWebhooks(new Date(Date.now() + 6 * 60_000))).toEqual({
      sent: 1,
      failed: 0,
    })
    expect(received.map((r) => r.headers['x-easy-cms-delivery'])).toEqual([
      received[0]?.headers['x-easy-cms-delivery'],
      received[0]?.headers['x-easy-cms-delivery'],
    ])
    release()
    await stopping.destroy()
    await next.destroy()
  })

  it('gives up after about a day of retries', async () => {
    const cwd = tempProject()
    const cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        webhooks: [{ url: `${url}/gone` }],
        collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
      }),
      cwd,
    )
    answers = Array(20).fill(500)
    await cms.create('notes', { text: 'x' })
    await cms.flushWebhooks()
    let now = Date.now()
    const results = []
    for (let i = 0; i < 6; i++) {
      now += 13 * 3_600_000
      results.push(await cms.retryWebhooks(new Date(now)))
    }
    expect(results.map((r) => r.failed)).toEqual([0, 0, 0, 0, 0, 1])
    expect(received).toHaveLength(9)
    expect(
      await rawQuery(cwd, `select state, attempts from ${table(cwd, 'webhook_deliveries')}`),
    ).toMatchObject([{ state: 'failed', attempts: 9 }])
    expect(await cms.retryWebhooks(new Date(now + 86_400_000))).toEqual({ sent: 0, failed: 0 })
    await cms.destroy()
  })

  it('validates webhook config', async () => {
    const { validateConfig } = await import('@easy-cms/core')
    const issues = validateConfig({
      secret: SECRET,
      db: db(),
      webhooks: [
        { url: 'ftp://x', events: ['published' as never], collections: ['nope'], globals: ['nah'] },
      ],
    })
    expect(issues.map((i) => i.path)).toEqual([
      'webhooks[0].url',
      'webhooks[0].events',
      'webhooks[0].collections',
      'webhooks[0].globals',
    ])
  })
})
