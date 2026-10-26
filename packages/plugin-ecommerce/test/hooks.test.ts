// First: a DOM, before Vue reads `document` as it loads.
import './dom.js'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createShopClient, type ShopClient, ShopError } from '../src/client.js'
import * as react from '../src/react.js'
import * as vue from '../src/vue.js'
import { openShop } from './shop-server.js'

/** The React hooks and Vue composables over a real shop: they follow the client's state. */

let server: Awaited<ReturnType<typeof openShop>>
beforeAll(async () => {
  server = await openShop()
})
afterAll(() => server.close())

const client = (): ShopClient => {
  const b = server.browser()
  return createShopClient({ fetch: b.fetch, storage: b.storage, locale: 'th' })
}

/** Waits for React or Vue to catch up with the server. */
const until = (check: () => unknown) => vi.waitFor(() => expect(check()).toBeTruthy())

/** Everything the hooks return, from the last render. */
type Hooks<T> = { [K in keyof T]: T[K] extends (...args: never[]) => infer R ? R : never }

const reactHooks = {
  cart: react.useCart,
  customer: react.useCustomer,
  payments: react.usePayments,
  currency: react.useCurrency,
  addresses: react.useAddresses,
  orders: () => react.useOrders(),
}

function renderReact(shop: ShopClient) {
  const seen: { current: Hooks<typeof reactHooks> | null } = { current: null }
  // biome-ignore lint/correctness/noComponentHookFactories: a probe that reads the hooks for one render
  function Probe() {
    seen.current = Object.fromEntries(
      Object.entries(reactHooks).map(([name, hook]) => [name, hook()]),
    ) as Hooks<typeof reactHooks>
    return null
  }
  const root = createRoot(document.createElement('div'))
  act(() => root.render(createElement(react.ShopProvider, { client: shop }, createElement(Probe))))
  const now = () => seen.current as Hooks<typeof reactHooks>
  return { now, unmount: () => act(() => root.unmount()) }
}
// React warns unless it knows it runs under a test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('React hooks', () => {
  it('load the shop, and follow the cart through checkout', async () => {
    const view = renderReact(client())
    await until(() => !view.now().cart.loading)
    expect(view.now().payments.paymentMethods.map((m) => m.name)).toEqual(['bank-transfer'])
    expect(view.now().cart.cart).toBeNull()

    await act(() => view.now().cart.addItem(server.mug, { quantity: 2 }))
    expect(view.now().cart.cart?.count).toBe(2)
    expect(view.now().currency.formatPrice(view.now().cart.cart?.total ?? 0)).toBe('฿500.00')
    const line = view.now().cart.cart?.lines[0]?.id as string
    await act(() => view.now().cart.incrementItem(line))
    expect(view.now().cart.cart?.count).toBe(3)
    await act(() => view.now().cart.updateItem(line, 1))
    expect(view.now().cart.cart?.count).toBe(1)

    const paid = await act(() =>
      view.now().payments.checkout({
        method: 'bank-transfer',
        email: 'react@example.com',
        shippingAddress: { name: 'R', line1: '1 Silom', country: 'TH' },
      }),
    )
    expect(paid.order?.status).toBe('pending')
    expect(view.now().cart.cart).toBeNull()
    expect(view.now().cart.busy).toBe(false)
    view.unmount()
  })

  it('pass on errors, and are not busy after one', async () => {
    const view = renderReact(client())
    await until(() => !view.now().cart.loading)
    const error = await act(() =>
      view
        .now()
        .cart.addItem(server.mug, { quantity: 0 })
        .catch((e: unknown) => e),
    )
    expect(error).toBeInstanceOf(ShopError)
    expect(view.now().cart.busy).toBe(false)
    view.unmount()
  })

  it('load addresses and orders when the customer signs in, and drop them on sign-out', async () => {
    const view = renderReact(client())
    await until(() => !view.now().customer.loading)
    expect(view.now().orders.orders).toEqual([])
    await act(() => view.now().customer.login('cust@example.com', 'customer-1'))
    expect(view.now().customer.user?.email).toBe('cust@example.com')

    const address = await act(() =>
      view.now().addresses.createAddress({ name: 'Cust', line1: '9 Silom', country: 'TH' }),
    )
    expect(view.now().addresses.addresses.map((a) => a.id)).toContain(address.id)

    await act(() => view.now().cart.addItem(server.mug))
    const paid = await act(() =>
      view.now().payments.checkout({ method: 'bank-transfer', address: address.id }),
    )
    // useOrders loads again for a new customer, not for each order: sign in again to see it.
    await act(() => view.now().customer.logout())
    expect(view.now().customer.user).toBeNull()
    expect(view.now().addresses.addresses).toEqual([])
    expect(view.now().orders.orders).toEqual([])
    await act(() => view.now().customer.login('cust@example.com', 'customer-1'))
    await until(() => view.now().orders.orders.some((o) => o.id === paid.order?.id))
    await until(() => view.now().addresses.addresses.length > 0)
    view.unmount()
  })

  it("leave addresses empty when they can't load, without an unhandled error", async () => {
    const shop = client()
    await shop.load()
    await shop.login('cust@example.com', 'customer-1')
    const failing = {
      ...shop,
      addresses: () => Promise.reject(new ShopError('Session expired', 401)),
    }
    const view = renderReact(failing)
    await until(() => !view.now().addresses.loading)
    expect(view.now().addresses.addresses).toEqual([])
    await expect(view.now().addresses.reload()).rejects.toThrow('Session expired')
    view.unmount()
  })

  it('need the provider', () => {
    const root = createRoot(document.createElement('div'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // biome-ignore lint/correctness/noComponentHookFactories: a component rendered once, outside the provider
    function Lonely() {
      react.useCart()
      return null
    }
    expect(() => act(() => root.render(createElement(Lonely)))).toThrow('put <ShopProvider>')
    spy.mockRestore()
  })
})

const vueComposables = {
  cart: vue.useCart,
  customer: vue.useCustomer,
  payments: vue.usePayments,
  currency: vue.useCurrency,
  addresses: vue.useAddresses,
  orders: () => vue.useOrders(),
}

function mountVue(shop: ShopClient) {
  let seen: Hooks<typeof vueComposables> | null = null
  const Probe = defineComponent({
    setup() {
      seen = Object.fromEntries(
        Object.entries(vueComposables).map(([name, use]) => [name, use()]),
      ) as Hooks<typeof vueComposables>
      return () => h('div')
    },
  })
  const app = createApp(Probe)
  app.use(vue.shopPlugin({ client: shop }))
  app.mount(document.createElement('div'))
  return {
    now: () => seen as unknown as Hooks<typeof vueComposables>,
    unmount: () => app.unmount(),
  }
}

describe('Vue composables', () => {
  it('load the shop, and follow the cart through checkout', async () => {
    const view = mountVue(client())
    const { cart, payments, currency } = view.now()
    await until(() => !cart.loading.value)
    expect(payments.paymentMethods.value.map((m) => m.name)).toEqual(['bank-transfer'])

    await cart.addItem(server.mug, { quantity: 2 })
    expect(cart.cart.value?.count).toBe(2)
    expect(currency.currency.value?.code).toBe('THB')
    expect(currency.formatPrice(cart.cart.value?.total ?? 0)).toBe('฿500.00')
    const line = cart.cart.value?.lines[0]?.id as string
    await cart.decrementItem(line)
    expect(cart.cart.value?.count).toBe(1)

    const paid = await payments.checkout({
      method: 'bank-transfer',
      email: 'vue@example.com',
      shippingAddress: { name: 'V', line1: '2 Sathorn', country: 'TH' },
    })
    expect(paid.order?.status).toBe('pending')
    expect(cart.cart.value).toBeNull()
    view.unmount()
  })

  it('pass on errors, and are not busy after one', async () => {
    const view = mountVue(client())
    const { cart } = view.now()
    await until(() => !cart.loading.value)
    const error = await cart.addItem(server.mug, { quantity: 0 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ShopError)
    expect(cart.busy.value).toBe(false)
    view.unmount()
  })

  it('load addresses and orders when the customer signs in, and drop them on sign-out', async () => {
    const view = mountVue(client())
    const { customer, addresses, orders, cart, payments } = view.now()
    await until(() => !customer.loading.value)
    await customer.login('cust@example.com', 'customer-1')
    expect(customer.user.value?.email).toBe('cust@example.com')
    await until(() => addresses.addresses.value.length > 0)

    await cart.addItem(server.mug)
    const [saved] = addresses.addresses.value
    if (!saved) throw new Error('the address from the React test is gone')
    const paid = await payments.checkout({ method: 'bank-transfer', address: saved.id })
    await customer.logout()
    await nextTick()
    await until(() => orders.orders.value.length === 0 && addresses.addresses.value.length === 0)
    await customer.login('cust@example.com', 'customer-1')
    await until(() => orders.orders.value.some((o) => o.id === paid.order?.id))
    view.unmount()
  })

  it("leave addresses empty when they can't load, without an unhandled error", async () => {
    const shop = client()
    await shop.load()
    await shop.login('cust@example.com', 'customer-1')
    const view = mountVue({
      ...shop,
      addresses: () => Promise.reject(new ShopError('Session expired', 401)),
    })
    const { addresses } = view.now()
    await until(() => !addresses.loading.value)
    expect(addresses.addresses.value).toEqual([])
    view.unmount()
  })

  it('need the plugin or provideShop()', () => {
    const app = createApp(
      defineComponent({
        setup() {
          // biome-ignore lint/correctness/useHookAtTopLevel: a Vue composable in setup(), not a React hook
          vue.useCart()
          return () => null
        },
      }),
    )
    const errors: unknown[] = []
    app.config.errorHandler = (error) => void errors.push(error)
    app.config.warnHandler = () => {}
    app.mount(document.createElement('div'))
    expect(String(errors[0])).toContain('install shopPlugin()')
  })
})
