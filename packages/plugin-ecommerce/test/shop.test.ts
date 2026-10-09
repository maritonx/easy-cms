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
import { formToken } from '@easy-cms/core/internal'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  definePaymentAdapter,
  ecommercePlugin,
  manualAdapter,
  type PaymentAdapter,
  paymentSucceeded,
} from '../src/index.js'

/** A card provider that says yes to every payment it started, and keeps what it did. */
const card = {
  started: [] as number[],
  refunded: [] as string[],
  answer: 'succeeded' as 'succeeded' | 'processing' | 'failed',
}
const fakeCard: PaymentAdapter = definePaymentAdapter({
  name: 'card',
  label: { en: 'Card', th: 'บัตร' },
  initiate: ({ transaction }) => {
    card.started.push(transaction.amount)
    return {
      data: { intent: `pi_${transaction.id}` },
      reference: `pi_${transaction.id}`,
      client: { clientSecret: `secret_${transaction.id}` },
    }
  },
  confirm: async () => card.answer,
  refund: async ({ transaction }) => {
    card.refunded.push(String(transaction.data.intent))
  },
  endpoints: [
    {
      path: '/webhook',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        return { result: await paymentSucceeded(String(body.reference)) }
      },
    },
  ],
})

const mail = consoleEmail({ log: () => {} })
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  serverURL: 'http://shop.test',
  email: mail,
  plugins: [
    ecommercePlugin({
      currencies: { supported: ['THB', 'USD'] },
      payments: {
        methods: [
          fakeCard,
          manualAdapter({
            instructions: { en: 'Pay to KBank 123-4-56789-0', th: 'โอนเข้า กสิกร 123-4-56789-0' },
          }),
        ],
      },
      // Flat-rate shipping, free from ฿1,000.
      totals: ({ cart, currency }) =>
        currency.code === 'THB' && cart.subtotal < 100_000
          ? [{ label: 'Shipping', amount: 5_000 }]
          : [],
      emails: { notify: 'shop@shop.test' },
    }),
  ],
})

const ORIGIN = 'http://shop.test'
let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
let adminToken = ''
let shirt: number
let mug: number
let red: number
let blue: number

// biome-ignore lint/suspicious/noExplicitAny: response bodies, checked by the assertions
type Body = Record<string, any>

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Body }> {
  const response = await handle(
    new Request(`${ORIGIN}/api/cms${path}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    }),
  )
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : {} }
}

/** A document by id, as the assertions read it. */
const doc = async (collection: string, id: unknown) =>
  (await cms.findById(collection as never, id as never)) as unknown as Body

const idOf = (value: unknown) =>
  value && typeof value === 'object' ? (value as { id: unknown }).id : value

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-shop-'))
  cms = await createEasyCMS(config, { cwd: dir, schema: 'push', logger: silentLogger })
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@shop.test', password: 'password123', role: 'admin' })
  adminToken = (await cms.auth.login({ email: 'admin@shop.test', password: 'password123' })).token

  mug = (
    await cms.create('products', {
      title: 'Mug',
      priceInTHB: 25_000,
      priceInUSD: 800,
      inventory: 3,
      sku: 'MUG',
      status: 'published',
    })
  ).id as number
  const color = (await cms.create('variant-types', { name: 'Color' })).id
  const r = (await cms.create('variant-options', { type: color, label: 'Red' })).id
  const b = (await cms.create('variant-options', { type: color, label: 'Blue' })).id
  shirt = (
    await cms.create('products', {
      title: 'Shirt',
      priceInTHB: 50_000,
      variantTypes: [color],
      status: 'published',
    })
  ).id as number
  red = (await cms.create('variants', { product: shirt, options: [r], inventory: 5, sku: 'SH-R' }))
    .id as number
  // Blue costs more, and isn't counted.
  blue = (await cms.create('variants', { product: shirt, options: [b], priceInTHB: 55_000 }))
    .id as number
})

afterAll(async () => {
  await cms.destroy()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Windows may still hold the SQLite file; the OS cleans temp.
  }
})

describe('setup', () => {
  it('adds customers as site members who sign up', () => {
    expect(cms.config.auth.roles).toContain('customer')
    expect(cms.config.auth.members.roles).toEqual(['customer'])
    expect(cms.config.auth.members.signup?.role).toBe('customer')
  })

  it('tells pages the currencies and payment methods', async () => {
    const { body } = await call('GET', '/shop/config')
    expect(body.currencies.map((c: { code: string }) => c.code)).toEqual(['THB', 'USD'])
    expect(body.paymentMethods).toEqual([
      { name: 'card', label: 'Card' },
      { name: 'bank-transfer', label: 'Bank transfer' },
    ])
    expect(body).toMatchObject({ defaultCurrency: 'THB', guests: true, countries: ['TH'] })
  })

  it('keeps prices as whole amounts', async () => {
    await expect(cms.create('products', { title: 'Bad', priceInTHB: 12.5 })).rejects.toThrow(
      /whole amount/,
    )
  })

  it('names variants after their options', async () => {
    expect((await doc('variants', red)).title).toBe('Red')
  })
})

describe('a guest', () => {
  let cart: { id: number; secret: string }

  it('gets a cart with a secret when adding the first item', async () => {
    const added = await call('POST', '/shop/cart/add', { body: { product: mug, quantity: 2 } })
    expect(added.status).toBe(200)
    expect(typeof added.body.secret).toBe('string')
    cart = { id: added.body.cart.id, secret: added.body.secret }
    expect(added.body.cart).toMatchObject({
      currency: 'THB',
      count: 2,
      subtotal: 50_000,
      adjustments: [{ label: 'Shipping', amount: 5_000 }],
      total: 55_000,
    })
    expect(added.body.cart.lines[0]).toMatchObject({
      product: { title: 'Mug' },
      unitPrice: 25_000,
      quantity: 2,
      stock: 3,
      available: true,
    })
  })

  it('needs the secret to see or change the cart', async () => {
    expect((await call('POST', '/shop/cart', { body: { cart } })).body.cart.id).toBe(cart.id)
    expect(
      (await call('POST', '/shop/cart', { body: { cart: { id: cart.id, secret: 'nope' } } })).body
        .cart,
    ).toBeNull()
    const other = await call('POST', '/shop/cart/clear', {
      body: { cart: { id: cart.id, secret: 'nope' } },
    })
    expect(other.status).toBe(404)
  })

  it('can’t take more than is in stock, or a product without its variant', async () => {
    const more = await call('POST', '/shop/cart/add', { body: { cart, product: mug, quantity: 2 } })
    expect(more.status).toBe(400)
    expect(more.body.errors[0].message).toBe('only 3 left')
    expect((await call('POST', '/shop/cart/add', { body: { cart, product: shirt } })).status).toBe(
      400,
    )
    const wrong = await call('POST', '/shop/cart/add', {
      body: { cart, product: mug, variant: red },
    })
    expect(wrong.status).toBe(400)
  })

  it('adds variants at their own price, and changes quantities', async () => {
    const added = await call('POST', '/shop/cart/add', {
      body: { cart, product: shirt, variant: blue },
    })
    const line = added.body.cart.lines.find((l: Body) => l.variant?.id === blue)
    expect(line).toMatchObject({ unitPrice: 55_000, variant: { title: 'Blue' }, stock: null })
    // Over ฿1,000: no shipping.
    expect(added.body.cart.adjustments).toEqual([])
    const updated = await call('POST', '/shop/cart/update', {
      body: { cart, line: line.id, quantity: 0 },
    })
    expect(updated.body.cart.lines).toHaveLength(1)
  })

  it('pays by bank transfer: the order waits for the money, and stock is taken', async () => {
    const before = mail.sent.length
    const paid = await call('POST', '/shop/checkout', {
      body: {
        cart,
        method: 'bank-transfer',
        email: 'Guest@Example.com',
        locale: 'th',
        shippingAddress: {
          name: 'Somchai',
          line1: '1 Sukhumvit',
          province: 'Bangkok',
          country: 'TH',
        },
      },
    })
    expect(paid.status).toBe(200)
    expect(paid.body.order).toMatchObject({ orderNumber: '1001', status: 'pending' })
    expect(paid.body.payment.instructions).toBe('โอนเข้า กสิกร 123-4-56789-0')
    const order = await doc('orders', paid.body.order.id)
    expect(order).toMatchObject({
      email: 'guest@example.com',
      currency: 'THB',
      subtotal: 50_000,
      total: 55_000,
      payment: 'โอนเงิน',
      paymentMethod: 'bank-transfer',
      locale: 'th',
      stockShort: false,
    })
    expect(order.items[0]).toMatchObject({
      title: 'Mug',
      sku: 'MUG',
      unitPrice: 25_000,
      quantity: 2,
    })
    expect(order.shippingAddress).toMatchObject({ name: 'Somchai', province: 'Bangkok' })
    expect((await doc('products', mug)).inventory).toBe(1)
    // The cart is bought: it's gone for the guest.
    expect((await call('POST', '/shop/cart', { body: { cart } })).body.cart).toBeNull()
    await cms.flushEmails()
    const sent = mail.sent.slice(before)
    expect(sent.map((m) => m.to)).toEqual(['guest@example.com', 'shop@shop.test'])
    expect(sent[0]?.text).toContain('โอนเข้า กสิกร')
  })

  it('needs an address the shop sends to', async () => {
    const added = await call('POST', '/shop/cart/add', { body: { product: mug } })
    const ref = { id: added.body.cart.id, secret: added.body.secret }
    const checkout = await call('POST', '/shop/checkout', {
      body: {
        cart: ref,
        method: 'card',
        email: 'g@example.com',
        shippingAddress: { name: 'A', line1: 'B', country: 'US' },
      },
    })
    expect(checkout.status).toBe(400)
    expect(checkout.body.errors).toEqual([
      { field: 'shippingAddress.country', message: 'is not a country the shop sends to' },
    ])
  })
})

describe('paying by card', () => {
  async function checkout(quantity = 1) {
    const added = await call('POST', '/shop/cart/add', {
      body: { product: shirt, variant: red, quantity },
    })
    const cart = { id: added.body.cart.id, secret: added.body.secret }
    const started = await call('POST', '/shop/checkout', {
      body: { cart, method: 'card', email: 'card@example.com' },
    })
    expect(started.status).toBe(200)
    return { cart, started: started.body }
  }

  it('makes the order once, however often it is confirmed', async () => {
    card.answer = 'succeeded'
    const { started } = await checkout(2)
    expect(started.payment).toEqual({ clientSecret: `secret_${started.transaction}` })
    expect(started.order).toBeNull()
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        call('POST', '/shop/confirm', { body: { transaction: started.transaction } }),
      ),
    )
    const numbers = new Set(results.map((r) => r.body.order?.orderNumber))
    expect(numbers.size).toBe(1)
    expect(results[0]?.body.order.status).toBe('paid')
    expect(await cms.count('orders', { where: { email: { equals: 'card@example.com' } } })).toBe(1)
    expect((await doc('variants', red)).inventory).toBe(3)
    const tx = await doc('transactions', started.transaction)
    expect(tx).toMatchObject({ status: 'succeeded', reference: `pi_${started.transaction}` })
    expect(idOf(tx.order)).toBe(results[0]?.body.order.id)
  })

  it('makes no order while the provider hasn’t taken the money', async () => {
    card.answer = 'processing'
    const { started } = await checkout()
    const result = await call('POST', '/shop/confirm', {
      body: { transaction: started.transaction },
    })
    expect(result.body).toEqual({ status: 'processing', order: null })
    // The provider's webhook makes it.
    const hook = await call('POST', '/shop/payments/card/webhook', {
      body: { reference: `pi_${started.transaction}` },
    })
    expect(hook.body.result.order).toBeDefined()
    const again = await call('POST', '/shop/confirm', {
      body: { transaction: started.transaction },
    })
    expect(again.body.order.id).toBe(hook.body.result.order)
    card.answer = 'succeeded'
  })

  it('marks the order when stock ran out meanwhile', async () => {
    const { started } = await checkout(1)
    // Someone else bought the rest.
    const current = (await doc('variants', red)).inventory as number
    await cms.update('variants', red, { inventory: 0 })
    const result = await call('POST', '/shop/confirm', {
      body: { transaction: started.transaction },
    })
    const order = await doc('orders', result.body.order.id)
    expect(order.stockShort).toBe(true)
    expect((await doc('variants', red)).inventory).toBe(0)
    await cms.update('variants', red, { inventory: current })
  })
})

describe('orders in the admin', () => {
  async function bankOrder() {
    const added = await call('POST', '/shop/cart/add', { body: { product: mug } })
    const cart = { id: added.body.cart.id, secret: added.body.secret }
    const paid = await call('POST', '/shop/checkout', {
      body: {
        cart,
        method: 'bank-transfer',
        email: 'admin-flow@example.com',
        shippingAddress: { name: 'A', line1: 'B', country: 'TH' },
      },
    })
    return paid.body.order as { id: number; orderNumber: string }
  }
  const act = (id: number, action: string) =>
    call('POST', `/shop/orders/${id}/${action}`, { token: adminToken, body: {} })

  it('moves along: payment received, sent, refunded', async () => {
    await cms.update('products', mug, { inventory: 5 })
    const order = await bankOrder()
    expect((await doc('products', mug)).inventory).toBe(4)
    const before = mail.sent.length
    expect((await act(order.id, 'paid')).body.order.status).toBe('paid')
    await cms.flushEmails()
    expect(mail.sent.slice(before)[0]?.subject).toBe(`Payment received: ${order.orderNumber}`)
    // Can't be paid twice.
    expect((await act(order.id, 'paid')).status).toBe(400)
    expect((await act(order.id, 'fulfilled')).body.order.status).toBe('fulfilled')
    expect((await act(order.id, 'refunded')).body.order.status).toBe('refunded')
    expect((await doc('products', mug)).inventory).toBe(5)
  })

  it('cancels an unpaid order, putting its items back', async () => {
    const order = await bankOrder()
    expect((await doc('products', mug)).inventory).toBe(4)
    expect((await act(order.id, 'cancelled')).body.order.status).toBe('cancelled')
    expect((await doc('products', mug)).inventory).toBe(5)
  })

  it('refunds card payments with the provider', async () => {
    const added = await call('POST', '/shop/cart/add', { body: { product: mug } })
    const cart = { id: added.body.cart.id, secret: added.body.secret }
    const started = await call('POST', '/shop/checkout', {
      body: { cart, method: 'card', email: 'refund@example.com' },
    })
    const confirmed = await call('POST', '/shop/confirm', {
      body: { transaction: started.body.transaction },
    })
    await act(confirmed.body.order.id, 'refunded')
    expect(card.refunded).toContain(`pi_${started.body.transaction}`)
    expect((await doc('transactions', started.body.transaction)).status).toBe('refunded')
  })

  it('are for staff only', async () => {
    const order = await bankOrder()
    expect((await call('POST', `/shop/orders/${order.id}/paid`, { body: {} })).status).toBe(401)
    expect((await call('GET', '/shop/overview')).status).toBe(401)
    const overview = await call('GET', '/shop/overview', { token: adminToken })
    expect(overview.body.pending).toBeGreaterThan(0)
    expect(overview.body.month.THB.orders).toBeGreaterThan(0)
  })
})

describe('customers', () => {
  let token = ''
  let userId: number

  it('sign up and confirm their email', async () => {
    const signup = await call('POST', '/users/signup', {
      body: {
        email: 'cust@example.com',
        password: 'customer-1',
        token: formToken('x'.repeat(32), 'easy-cms-signup', Date.now() - 5_000),
      },
    })
    expect(signup.status).toBe(202)
    await cms.flushEmails()
    const link = mail.sent.at(-1)?.text?.match(/https?:\/\/\S+/)?.[0] ?? ''
    const verified = await call('POST', '/users/verify-email', {
      body: { token: new URL(link).searchParams.get('token') },
    })
    expect(verified.body.user).toMatchObject({ role: 'customer', member: true })
    userId = verified.body.user.id
  })

  it('keep their guest cart when they sign in', async () => {
    const added = await call('POST', '/shop/cart/add', { body: { product: mug } })
    const guest = { id: added.body.cart.id, secret: added.body.secret }
    token = (await cms.auth.login({ email: 'cust@example.com', password: 'customer-1' })).token
    const merged = await call('POST', '/shop/cart/merge', { token, body: { cart: guest } })
    expect(merged.body.cart.count).toBe(1)
    // Theirs now: no secret needed, and the secret alone no longer opens it.
    expect((await call('POST', '/shop/cart', { token, body: {} })).body.cart.id).toBe(guest.id)
    expect((await call('POST', '/shop/cart', { body: { cart: guest } })).body.cart).toBeNull()
  })

  it('save addresses, pay with them, and see only their own orders', async () => {
    const address = await call('POST', '/addresses', {
      token,
      body: { name: 'Cust', line1: '9 Silom', country: 'TH', customer: 1 },
    })
    expect(address.status).toBe(201)
    // Always their own.
    expect(idOf(address.body.customer)).toBe(userId)
    const paid = await call('POST', '/shop/checkout', {
      token,
      body: { method: 'bank-transfer', address: address.body.id },
    })
    expect(paid.status).toBe(200)
    const order = await doc('orders', paid.body.order.id)
    expect(order).toMatchObject({
      email: 'cust@example.com',
      shippingAddress: { line1: '9 Silom' },
    })
    expect(idOf(order.customer)).toBe(userId)
    const mine = await call('GET', '/orders', { token })
    expect(mine.body.docs.map((o: Body) => o.id)).toEqual([order.id])
    expect((await call('GET', '/transactions', { token })).status).toBe(403)
    expect((await call('GET', '/products', { token })).body.docs.length).toBeGreaterThan(0)
    expect((await call('POST', '/products', { token, body: { title: 'Free' } })).status).toBe(403)
  })
})

describe('upkeep', () => {
  it('lets payments stuck in processing be tried again', async () => {
    const added = await call('POST', '/shop/cart/add', { body: { product: shirt, variant: blue } })
    const cart = { id: added.body.cart.id, secret: added.body.secret }
    const started = await call('POST', '/shop/checkout', {
      body: { cart, method: 'card', email: 'stuck@example.com' },
    })
    const id = started.body.transaction
    // A process stopped after claiming it.
    await cms.update('transactions', id, { status: 'processing' })
    await cms.runJobs(new Date(Date.now() + 11 * 60_000))
    expect((await doc('transactions', id)).status).toBe('pending')
    const confirmed = await call('POST', '/shop/confirm', { body: { transaction: id } })
    expect(confirmed.body.order.status).toBe('paid')
  })
})
