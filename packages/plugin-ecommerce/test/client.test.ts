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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createShopClient, ShopError } from '../src/client.js'
import { ecommercePlugin, manualAdapter } from '../src/index.js'

const mail = consoleEmail({ log: () => {} })
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  serverURL: 'http://shop.test',
  email: mail,
  plugins: [ecommercePlugin({ payments: { methods: [manualAdapter()] } })],
})

const ORIGIN = 'http://shop.test'
let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
let mug: number

/** A browser: requests to the handler, with its cookies. */
function browser() {
  const jar = new Map<string, string>()
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    headers.set('origin', ORIGIN)
    if (jar.size > 0) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
    const response = await handle(new Request(new URL(String(input), ORIGIN), { ...init, headers }))
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';')
      const eq = pair.indexOf('=')
      const value = pair.slice(eq + 1)
      if (/max-age=0/i.test(line) || value === '') jar.delete(pair.slice(0, eq))
      else jar.set(pair.slice(0, eq), value)
    }
    return response
  }
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  return { fetch: fetcher as typeof fetch, storage, store }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-shop-client-'))
  cms = await createEasyCMS(config, { cwd: dir, schema: 'push', logger: silentLogger })
  handle = createRestHandler(cms)
  mug = (await cms.create('products', { title: 'Mug', priceInTHB: 25_000, status: 'published' }))
    .id as number
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

describe('the shop client', () => {
  it('shops as a guest, remembering the cart', async () => {
    const b = browser()
    const shop = createShopClient({ fetch: b.fetch, storage: b.storage, locale: 'th' })
    const changes: number[] = []
    shop.subscribe((s) => changes.push(s.cart?.count ?? 0))
    await shop.load()
    expect(shop.getState()).toMatchObject({ loading: false, user: null, cart: null })
    const cart = await shop.addItem(mug, { quantity: 2 })
    expect(cart.total).toBe(50_000)
    expect(JSON.parse(b.store.get('easy-cms-cart') ?? '{}').id).toBe(cart.id)
    expect(changes.at(-1)).toBe(2)
    expect(shop.formatPrice(cart.total)).toBe('฿500.00')

    // A new page load finds it again.
    const again = createShopClient({ fetch: b.fetch, storage: b.storage })
    await again.load()
    expect(again.getState().cart?.id).toBe(cart.id)
    const line = again.getState().cart?.lines[0]?.id as string
    expect((await again.incrementItem(line)).count).toBe(3)
    expect((await again.decrementItem(line)).count).toBe(2)

    const paid = await again.checkout({
      method: 'bank-transfer',
      email: 'guest@example.com',
      shippingAddress: { name: 'A', line1: 'B', country: 'TH' },
    })
    expect(paid.order?.status).toBe('pending')
    expect(again.getState().cart).toBeNull()
    expect(b.store.has('easy-cms-cart')).toBe(false)
  })

  it('reports invalid input with its fields', async () => {
    const b = browser()
    const shop = createShopClient({ fetch: b.fetch, storage: b.storage })
    await shop.load()
    const error = await shop.addItem(mug, { quantity: 0 }).catch((e) => e)
    expect(error).toBeInstanceOf(ShopError)
    expect(error.status).toBe(400)
    expect(error.errors[0].field).toBe('quantity')
  })

  it('signs in with the cookie, keeps the guest cart, and sends the CSRF token', async () => {
    const b = browser()
    const shop = createShopClient({ fetch: b.fetch, storage: b.storage })
    await shop.load()
    await shop.addItem(mug)
    const user = await shop.login('cust@example.com', 'customer-1')
    expect(user.member).toBe(true)
    expect(shop.getState().cart?.count).toBe(1)
    // Cookie requests need the CSRF token: adding works.
    expect((await shop.addItem(mug)).count).toBe(2)
    const address = await shop.createAddress({ name: 'Cust', line1: '9 Silom', country: 'TH' })
    expect((await shop.addresses()).map((a) => a.id)).toEqual([address.id])
    const paid = await shop.checkout({ method: 'bank-transfer', address: address.id })
    expect(paid.order).not.toBeNull()
    const orders = await shop.orders()
    expect(orders.docs.map((o) => o.id)).toEqual([paid.order?.id])
    await shop.logout()
    expect(shop.getState()).toMatchObject({ user: null, cart: null })
  })
})
