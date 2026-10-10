import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEasyCMS, createRestHandler, defineConfig, silentLogger } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ecommercePlugin } from '../src/index.js'
import { type StripeClient, stripeAdapter } from '../src/stripe.js'

/** Stripe as far as the adapter sees it. */
const intents = new Map<string, { id: string; status: string; amount: number; currency: string }>()
const calls: {
  create: Record<string, unknown>[]
  keys: (string | undefined)[]
  refunds: unknown[]
} = {
  create: [],
  keys: [],
  refunds: [],
}
const fake: StripeClient = {
  paymentIntents: {
    async create(params, options) {
      calls.create.push(params)
      calls.keys.push(options?.idempotencyKey)
      const id = `pi_${intents.size + 1}`
      const intent = {
        id,
        status: 'requires_payment_method',
        amount: params.amount as number,
        currency: params.currency as string,
      }
      intents.set(id, intent)
      return { ...intent, client_secret: `${id}_secret` }
    },
    async retrieve(id) {
      return intents.get(id) as { id: string; status: string; amount: number; currency: string }
    },
  },
  refunds: {
    async create(params) {
      calls.refunds.push(params)
      return {}
    },
  },
  webhooks: {
    async constructEventAsync(body, signature, secret) {
      if (signature !== `sig:${secret}`) throw new Error('bad signature')
      return JSON.parse(body)
    },
  },
}

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  plugins: [
    ecommercePlugin({
      payments: {
        methods: [
          stripeAdapter({
            secretKey: 'sk_test',
            publishableKey: 'pk_test',
            webhookSecret: 'whsec_test',
            client: fake,
          }),
        ],
      },
    }),
  ],
})

let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
let product: number

// biome-ignore lint/suspicious/noExplicitAny: response bodies, checked by the assertions
type Body = Record<string, any>

async function call(path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await handle(
    new Request(`http://shop.test/api/cms${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
  const text = await response.text()
  return { status: response.status, body: (text.startsWith('{') ? JSON.parse(text) : text) as Body }
}

async function startCheckout(): Promise<Body> {
  const added = await call('/shop/cart/add', { product })
  const cart = { id: added.body.cart.id, secret: added.body.secret }
  const started = await call('/shop/checkout', {
    cart,
    method: 'stripe',
    email: 'card@example.com',
  })
  expect(started.status).toBe(200)
  return { ...started.body, cart }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-shop-stripe-'))
  cms = await createEasyCMS(config, { cwd: dir, schema: 'push', logger: silentLogger })
  handle = createRestHandler(cms)
  product = (
    await cms.create('products', { title: 'Tea', priceInTHB: 12_345, status: 'published' })
  ).id as number
})

afterAll(async () => {
  await cms.destroy()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Windows may still hold the SQLite file; the OS cleans temp.
  }
})

describe('stripeAdapter', () => {
  it('starts a payment intent for the transaction, once', async () => {
    const started = await startCheckout()
    expect(started.payment).toEqual({ clientSecret: 'pi_1_secret', publishableKey: 'pk_test' })
    expect(calls.create.at(-1)).toMatchObject({
      amount: 12_345,
      currency: 'thb',
      receipt_email: 'card@example.com',
      metadata: { transaction: String(started.transaction) },
    })
    expect(calls.keys.at(-1)).toBe(`easy-cms-transaction-${started.transaction}`)
  })

  it('makes the order only once Stripe says the money is in', async () => {
    const started = await startCheckout()
    const intent = `pi_${intents.size}`
    expect(
      (await call('/shop/confirm', { transaction: started.transaction, cart: started.cart })).body
        .status,
    ).toBe('failed')
    ;(intents.get(intent) as { status: string }).status = 'succeeded'
    const confirmed = await call('/shop/confirm', {
      transaction: started.transaction,
      cart: started.cart,
    })
    expect(confirmed.body.order.status).toBe('paid')
  })

  it('refuses a payment of another amount', async () => {
    const started = await startCheckout()
    const intent = intents.get(`pi_${intents.size}`) as { status: string; amount: number }
    intent.status = 'succeeded'
    intent.amount = 1
    expect(
      (await call('/shop/confirm', { transaction: started.transaction, cart: started.cart })).body
        .order,
    ).toBeNull()
  })

  it('takes orders from signed webhooks', async () => {
    const started = await startCheckout()
    const id = `pi_${intents.size}`
    const event = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { id } } })
    expect(
      (await call('/shop/payments/stripe/webhook', event, { 'stripe-signature': 'nope' })).status,
    ).toBe(400)
    const ok = await call('/shop/payments/stripe/webhook', event, {
      'stripe-signature': 'sig:whsec_test',
    })
    expect(ok.body).toEqual({ received: true })
    const tx = (await cms.findById('transactions', started.transaction)) as Body
    expect(tx.status).toBe('succeeded')
    expect(tx.order).toBeTruthy()
  })

  it('refunds through Stripe', async () => {
    await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'admin@x.co', password: 'password123' })
    const order = (await cms.find('orders', { where: { status: { equals: 'paid' } }, limit: 1 }))
      .docs[0] as Body
    const refunded = await call(
      `/shop/orders/${order.id}/refunded`,
      {},
      { authorization: `Bearer ${token}` },
    )
    expect(refunded.body.order.status).toBe('refunded')
    expect(calls.refunds.at(-1)).toEqual({ payment_intent: expect.stringMatching(/^pi_/) })
  })
})
