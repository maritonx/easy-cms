import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createShopClient, ShopError } from '../src/client.js'
import { openShop } from './shop-server.js'

let server: Awaited<ReturnType<typeof openShop>>
let mug: number
const browser = () => server.browser()

beforeAll(async () => {
  server = await openShop()
  mug = server.mug
})
afterAll(() => server.close())

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
