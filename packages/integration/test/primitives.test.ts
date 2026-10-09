import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ConfigError, defineConfig, type WebhookPayload } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** What plugins such as a shop build on: compare-and-set updates, counters, jobs and events. */
let server: Server
let url = ''
const received: { path: string; payload: WebhookPayload }[] = []
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      received.push({ path: req.url ?? '', payload: JSON.parse(body) })
      res.statusCode = 204
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const runs: string[] = []
const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    events: ['order.paid'],
    jobs: [
      { name: 'shop:often', run: () => void runs.push('often') },
      { name: 'shop:hourly', every: 3600, run: () => void runs.push('hourly') },
      {
        name: 'shop:broken',
        run: () => {
          throw new Error('boom')
        },
      },
    ],
    webhooks: [
      { url: `${url}/paid`, events: ['order.paid'] },
      { url: `${url}/content`, events: ['create'] },
    ],
    collections: [
      {
        slug: 'orders',
        fields: [
          { name: 'status', type: 'text' },
          { name: 'stock', type: 'number' },
          { name: 'title', type: 'text' },
        ],
      },
    ],
  })

describe('update with where', () => {
  it('saves only while the stored document matches: one of two concurrent calls wins', async () => {
    const cms = await open(config())
    try {
      const order = await cms.create('orders', { status: 'pending' })
      const pending = { status: { equals: 'pending' } }
      const results = await Promise.all([
        cms.update('orders', order.id, { status: 'paid', title: 'a' }, { where: pending }),
        cms.update('orders', order.id, { status: 'paid', title: 'b' }, { where: pending }),
      ])
      expect(results.filter((r) => r !== null)).toHaveLength(1)
      expect(await cms.update('orders', order.id, { title: 'c' }, { where: pending })).toBeNull()
      expect((await cms.findById('orders', order.id))?.status).toBe('paid')
    } finally {
      await cms.destroy()
    }
  })
})

describe('increment', () => {
  it('adds in one statement and keeps within min', async () => {
    const cms = await open(config())
    try {
      const order = await cms.create('orders', { stock: 3 })
      const taken = await Promise.all(
        [1, 2, 3, 4, 5].map(() => cms.increment('orders', order.id, 'stock', -1, { min: 0 })),
      )
      expect(taken.filter((v) => v !== null)).toHaveLength(3)
      expect((await cms.findById('orders', order.id))?.stock).toBe(0)
      expect(await cms.increment('orders', order.id, 'stock', 2)).toBe(2)
      // An empty value counts as 0.
      const empty = await cms.create('orders', {})
      expect(await cms.increment('orders', empty.id, 'stock', 1)).toBe(1)
      await expect(cms.increment('orders', order.id, 'title', 1)).rejects.toThrow(/number/)
      // `null` means out of bounds only: a document that isn't there is an error.
      await expect(cms.increment('orders', 999_999, 'stock', 1)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    } finally {
      await cms.destroy()
    }
  })
})

describe('jobs', () => {
  it('run with the scheduled jobs, at most as often as `every`', async () => {
    const cms = await open(config())
    try {
      runs.length = 0
      const now = new Date()
      expect((await cms.runJobs(now)).jobs).toEqual({ ran: 2, failed: 1 })
      await cms.runJobs(new Date(now.getTime() + 60_000))
      expect(runs).toEqual(['often', 'hourly', 'often'])
      await cms.runJobs(new Date(now.getTime() + 3_601_000))
      expect(runs.filter((r) => r === 'hourly')).toHaveLength(2)
    } finally {
      await cms.destroy()
    }
  })

  it('need unique names', async () => {
    await expect(
      open(
        defineConfig({
          ...config(),
          jobs: [
            { name: 'a', run: () => {} },
            { name: 'a', run: () => {} },
          ],
        }),
      ),
    ).rejects.toThrow(ConfigError)
  })
})

describe('events', () => {
  it('go only to webhooks that list them', async () => {
    const cms = await open(config())
    try {
      received.length = 0
      cms.emit('order.paid', { orderNumber: 'A-1' }, { collection: 'orders', id: 1 })
      await cms.flushWebhooks()
      expect(received.map((r) => r.path)).toEqual(['/paid'])
      expect(received[0]?.payload).toMatchObject({
        event: 'order.paid',
        collection: 'orders',
        doc: { orderNumber: 'A-1' },
      })
      expect(() => cms.emit('order.lost', {})).toThrow(/Unknown event/)
    } finally {
      await cms.destroy()
    }
  })

  it('must be declared for webhooks to list them', async () => {
    await expect(
      open(defineConfig({ ...config(), events: [], webhooks: [{ url, events: ['order.paid'] }] })),
    ).rejects.toThrow(/unknown event/)
  })
})
