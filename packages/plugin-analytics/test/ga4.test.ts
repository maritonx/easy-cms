import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEasyCMS, createRestHandler, defineConfig, silentLogger } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { analyticsPlugin } from '../src/index.js'

// A stand-in for GA4's Measurement Protocol: records each hit; `status` decides the answer.
type Hit = { path: string; query: URLSearchParams; body: Record<string, unknown> }
const hits: Hit[] = []
let status = 204
let server: Server
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://ga.test')
      hits.push({ path: url.pathname, query: url.searchParams, body: JSON.parse(raw || '{}') })
      if (url.pathname === '/debug/mp/collect') {
        const bad = url.searchParams.get('api_secret') !== 'secret'
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            validationMessages: bad ? [{ description: 'Unknown API secret' }] : [],
          }),
        )
        return
      }
      res.writeHead(status).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.GA4_MP_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  delete process.env.GA4_MP_URL
  server.close()
})

const dirs: string[] = []
afterEach(() => {
  delete process.env.GA4_MEASUREMENT_ID
  delete process.env.GA4_API_SECRET
  hits.length = 0
  status = 204
  for (const dir of dirs.splice(0))
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // The OS cleans its temp directory.
    }
})

async function open(connected = true) {
  if (connected) {
    process.env.GA4_MEASUREMENT_ID = 'G-TEST123'
    process.env.GA4_API_SECRET = 'secret'
  } else {
    delete process.env.GA4_MEASUREMENT_ID
    delete process.env.GA4_API_SECRET
  }
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-ga4-'))
  dirs.push(cwd)
  return createEasyCMS(
    defineConfig({
      secret: 'x'.repeat(32),
      db: sqlite({ url: 'file:./cms.db' }),
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
      // The shop (@easy-cms/plugin-ecommerce) declares these.
      events: ['order.paid', 'order.refunded'],
      plugins: [analyticsPlugin()],
    }),
    { cwd, schema: 'push', logger: silentLogger, scheduler: false },
  )
}

/** An order as @easy-cms/plugin-ecommerce sends it with `order.paid`. */
const order = (
  analytics: unknown = {
    clientId: '123.456',
    sessions: { TEST123: '1700000000' },
    marketing: false,
  },
) => ({
  id: 7,
  orderNumber: '1001',
  currency: 'THB',
  total: 55_000,
  items: [{ product: 3, sku: 'TEA-1', title: 'Jasmine tea', unitPrice: 25_000, quantity: 2 }],
  analytics,
})

const collected = () => hits.filter((h) => h.path === '/mp/collect')
/** CI runs many packages at once: deliveries can take seconds. */
const WAIT = { timeout: 15_000, interval: 50 }

describe('GA4 from the server', () => {
  it('sends a paid order as a purchase, in baht, with the session, once', async () => {
    const cms = await open()
    try {
      cms.emit('order.paid', order())
      await vi.waitFor(() => expect(collected()).toHaveLength(1), WAIT)
      const [hit] = collected()
      expect(hit?.query.get('measurement_id')).toBe('G-TEST123')
      expect(hit?.query.get('api_secret')).toBe('secret')
      expect(hit?.body).toEqual({
        client_id: '123.456',
        consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
        events: [
          {
            name: 'purchase',
            params: {
              transaction_id: '1001',
              currency: 'THB',
              value: 550,
              items: [{ item_id: 'TEA-1', item_name: 'Jasmine tea', price: 250, quantity: 2 }],
              session_id: '1700000000',
              engagement_time_msec: 1,
            },
          },
        ],
      })
      // The same order paid again (a webhook sent twice) is not counted twice.
      cms.emit('order.paid', order())
      cms.emit('order.refunded', order())
      await vi.waitFor(() => expect(collected()).toHaveLength(2), WAIT)
      expect(collected()[1]?.body).toMatchObject({ events: [{ name: 'refund' }] })
    } finally {
      await cms.destroy()
    }
  })

  it('sends nothing without consent or without GA4', async () => {
    const cms = await open()
    try {
      cms.emit('order.paid', { ...order(null), id: 8, orderNumber: '2001' })
      const quiet = await open(false)
      try {
        quiet.emit('order.paid', { ...order(), id: 9, orderNumber: '2002' })
        await new Promise((resolve) => setTimeout(resolve, 500))
        // Only this test's orders: a slow delivery of an earlier test may still arrive.
        const ours = collected().filter((h) =>
          JSON.stringify(h.body).match(/"transaction_id":"200[12]"/),
        )
        expect(ours).toHaveLength(0)
      } finally {
        await quiet.destroy()
      }
    } finally {
      await cms.destroy()
    }
  })

  it('tries again later when Google fails', async () => {
    const cms = await open()
    try {
      status = 503
      cms.emit('order.paid', order())
      await vi.waitFor(() => expect(collected()).toHaveLength(1), WAIT)
      status = 204
      const job = cms.config.jobs.find((j) => j.name === 'analytics:ga4')
      // A minute later the job sends it again.
      await vi.waitFor(async () => {
        await job?.run({ cms: cms as never, now: new Date(Date.now() + 61_000) })
        expect(collected()).toHaveLength(2)
      }, WAIT)
    } finally {
      await cms.destroy()
    }
  })

  it('tells the page the server sends purchases, and tests the connection', async () => {
    const cms = await open()
    try {
      const handle = createRestHandler(cms)
      const script = await (
        await handle(new Request('http://site.test/api/cms/analytics.js'))
      ).text()
      expect(script).toContain('"serverPurchase":true')
      const ga4 = cms.config.integrations.find((i) => i.id === 'ga4')
      expect(
        await ga4?.test?.({ measurementId: 'G-TEST123', apiSecret: 'secret' }, {} as never),
      ).toEqual({
        ok: true,
        account: 'G-TEST123',
      })
      expect(
        await ga4?.test?.({ measurementId: 'G-TEST123', apiSecret: 'nope' }, {} as never),
      ).toEqual({
        ok: false,
        message: 'Unknown API secret',
      })
      expect(
        (await ga4?.test?.({ measurementId: 'UA-1', apiSecret: 'secret' }, {} as never))?.ok,
      ).toBe(false)
    } finally {
      await cms.destroy()
    }
    const quiet = await open(false)
    try {
      const handle = createRestHandler(quiet)
      const script = await (
        await handle(new Request('http://site.test/api/cms/analytics.js'))
      ).text()
      expect(script).toContain('"serverPurchase":false')
    } finally {
      await quiet.destroy()
    }
  })
})
