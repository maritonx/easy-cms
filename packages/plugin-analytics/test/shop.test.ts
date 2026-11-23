import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  consoleEmail,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { ecommercePlugin, manualAdapter } from '@easy-cms/plugin-ecommerce'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { analyticsPlugin } from '../src/index.js'

// GA4's Measurement Protocol, recorded.
const hits: Record<string, unknown>[] = []
let server: Server
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      hits.push(JSON.parse(raw || '{}'))
      res.writeHead(204).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.GA4_MP_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.GA4_MEASUREMENT_ID = 'G-SHOP1'
  process.env.GA4_API_SECRET = 'secret'
})
afterAll(() => {
  delete process.env.GA4_MP_URL
  delete process.env.GA4_MEASUREMENT_ID
  delete process.env.GA4_API_SECRET
  server.close()
})

it("sends the shop's order to GA4 once the bank transfer is marked received", async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-ga4-shop-'))
  const cms = await createEasyCMS(
    defineConfig({
      secret: 'x'.repeat(32),
      db: sqlite({ url: 'file:./cms.db' }),
      serverURL: 'http://shop.test',
      email: consoleEmail({ log: () => {} }),
      plugins: [ecommercePlugin({ payments: { methods: [manualAdapter()] } }), analyticsPlugin()],
    }),
    { cwd, schema: 'push', logger: silentLogger, scheduler: false },
  )
  try {
    const handle = createRestHandler(cms)
    const call = async (path: string, body: unknown, token?: string) =>
      (await (
        await handle(
          new Request(`http://shop.test/api/cms${path}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: 'http://shop.test',
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
          }),
        )
      ).json()) as Record<string, any>
    const tea = await cms.create('products', {
      title: 'Jasmine tea',
      sku: 'TEA-1',
      priceInTHB: 25_000,
      status: 'published',
    })
    const added = await call('/shop/cart/add', { product: tea.id, quantity: 2, currency: 'THB' })
    const checkout = await call('/shop/checkout', {
      cart: { id: added.cart.id, secret: added.secret },
      method: 'bank-transfer',
      email: 'guest@example.com',
      shippingAddress: { name: 'A', line1: 'B', country: 'TH' },
      // What the shop's client sends with consent to analytics.
      analytics: {
        analytics: true,
        marketing: true,
        clientId: '111.222',
        sessions: { SHOP1: '1700000000' },
      },
    })
    expect(checkout.order.status).toBe('pending')
    // Not paid yet: nothing sent.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(hits).toHaveLength(0)

    await cms.create('users', { email: 'staff@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'staff@x.co', password: 'password123' })
    await call(`/shop/orders/${checkout.order.id}/paid`, {}, token)
    await vi.waitFor(() => expect(hits).toHaveLength(1))
    expect(hits[0]).toMatchObject({
      client_id: '111.222',
      consent: { ad_user_data: 'GRANTED', ad_personalization: 'GRANTED' },
      events: [
        {
          name: 'purchase',
          params: {
            transaction_id: checkout.order.orderNumber,
            currency: 'THB',
            items: [{ item_id: 'TEA-1', item_name: 'Jasmine tea', price: 250, quantity: 2 }],
            session_id: '1700000000',
          },
        },
      ],
    })
  } finally {
    await cms.destroy()
    try {
      rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // The OS cleans its temp directory.
    }
  }
})
