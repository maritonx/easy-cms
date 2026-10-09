import { mkdtempSync, rmSync } from 'node:fs'
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
import { multiTenantPlugin } from '@easy-cms/plugin-multi-tenant'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  definePaymentAdapter,
  ecommercePlugin,
  manualAdapter,
  paymentSucceeded,
  SHOP_COLLECTIONS,
} from '../src/index.js'

/** A provider whose payments go through by webhook only. */
const later = definePaymentAdapter({
  name: 'later',
  label: 'Later',
  initiate: ({ transaction }) => ({ reference: `ref_${transaction.id}` }),
  confirm: async () => 'processing',
  endpoints: [
    {
      path: '/webhook',
      method: 'post',
      handler: async (req) => paymentSucceeded(String((await req.json()).reference)),
    },
  ],
})

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  serverURL: 'http://cms.test',
  email: consoleEmail({ log: () => {} }),
  plugins: [
    ecommercePlugin({ payments: { methods: [manualAdapter(), later] } }),
    multiTenantPlugin({ collections: [...SHOP_COLLECTIONS, 'media'] }),
  ],
})

let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
let a: number
let b: number
const products: Record<string, number> = {}

// biome-ignore lint/suspicious/noExplicitAny: response bodies, checked by the assertions
type Body = Record<string, any>

async function call(
  path: string,
  options: { host: string; body?: unknown; token?: string; method?: string },
): Promise<{ status: number; body: Body }> {
  const response = await handle(
    new Request(`http://${options.host}/api/cms${path}`, {
      method: options.method ?? 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    }),
  )
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : {} }
}

const idOf = (value: unknown) =>
  value && typeof value === 'object' ? (value as { id: unknown }).id : value

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-shop-tenants-'))
  cms = await createEasyCMS(config, { cwd: dir, schema: 'push', logger: silentLogger })
  handle = createRestHandler(cms)
  a = (await cms.create('tenants', { name: 'A', slug: 'a', domains: [{ domain: 'a.test' }] }))
    .id as number
  b = (await cms.create('tenants', { name: 'B', slug: 'b', domains: [{ domain: 'b.test' }] }))
    .id as number
  for (const [name, tenant] of [
    ['a', a],
    ['b', b],
  ] as const)
    products[name] = (
      await cms.create(
        'products',
        { title: `Tea ${name}`, priceInTHB: 10_000, status: 'published', inventory: 10 },
        { context: { tenant } },
      )
    ).id as number
  await cms.create('users', {
    email: 'cust@example.com',
    password: 'customer-1',
    role: 'customer',
    emailVerified: true,
  })
})

afterAll(async () => {
  await cms.destroy()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Windows may still hold the SQLite file; the OS cleans temp.
  }
})

async function buy(host: string, product: number, token?: string) {
  const added = await call('/shop/cart/add', {
    host,
    body: { product },
    ...(token ? { token } : {}),
  })
  expect(added.status).toBe(200)
  const cart = added.body.secret
    ? { cart: { id: added.body.cart.id, secret: added.body.secret } }
    : {}
  return call('/shop/checkout', {
    host,
    ...(token ? { token } : {}),
    body: {
      ...cart,
      method: 'bank-transfer',
      email: 'g@example.com',
      shippingAddress: { name: 'N', line1: 'L', country: 'TH' },
    },
  })
}

describe('a shop per tenant', () => {
  it('sells each tenant’s products on its own site only', async () => {
    const wrong = await call('/shop/cart/add', { host: 'a.test', body: { product: products.b } })
    expect(wrong.status).toBe(400)
  })

  it('numbers orders per tenant, and keeps them in it', async () => {
    const first = await buy('a.test', products.a as number)
    const second = await buy('b.test', products.b as number)
    expect(first.body.order.orderNumber).toBe('1001')
    expect(second.body.order.orderNumber).toBe('1001')
    const order = await cms.findById('orders', first.body.order.id)
    expect(idOf((order as Body).tenant)).toBe(a)
    expect(idOf(((await cms.findById('orders', second.body.order.id)) as Body).tenant)).toBe(b)
    expect((await buy('a.test', products.a as number)).body.order.orderNumber).toBe('1002')
  })

  it('makes the order in the checkout’s tenant when a webhook confirms it', async () => {
    const added = await call('/shop/cart/add', { host: 'b.test', body: { product: products.b } })
    const started = await call('/shop/checkout', {
      host: 'b.test',
      body: {
        cart: { id: added.body.cart.id, secret: added.body.secret },
        method: 'later',
        email: 'w@example.com',
      },
    })
    // The provider calls from nowhere in particular.
    const hook = await call('/shop/payments/later/webhook', {
      host: 'cms.test',
      body: { reference: `ref_${started.body.transaction}` },
    })
    const order = (await cms.findById('orders', hook.body.order)) as Body
    expect(idOf(order.tenant)).toBe(b)
    expect(order.orderNumber).toBe('1002')
  })

  it('lets one customer account shop on every tenant’s site', async () => {
    const { token } = await cms.auth.login({ email: 'cust@example.com', password: 'customer-1' })
    const inA = await buy('a.test', products.a as number, token)
    const inB = await buy('b.test', products.b as number, token)
    expect(inA.status).toBe(200)
    expect(inB.status).toBe(200)
    // Each site shows its own orders.
    const mine = await call('/orders', { host: 'a.test', token, method: 'GET' })
    expect(mine.body.docs.map((o: Body) => o.id)).toEqual([inA.body.order.id])
  })
})
