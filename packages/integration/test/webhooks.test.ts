import { createHmac } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { defineConfig, type WebhookPayload } from '@easy-cms/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

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

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      received.push({ headers: req.headers, body, payload: JSON.parse(body) })
      res.statusCode = answers.shift() ?? 204
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
beforeEach(() => {
  received = []
  answers = []
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
