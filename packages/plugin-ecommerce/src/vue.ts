/**
 * Vue composables for the shop: `app.use(shopPlugin())` (or `provideShop()` in a component),
 * then `useCart`, `useCustomer`, `usePayments`, `useAddresses`, `useOrders` and `useCurrency`.
 */
import {
  type App,
  computed,
  type InjectionKey,
  inject,
  onScopeDispose,
  provide,
  readonly,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  createShopClient,
  type ShopClient,
  type ShopClientOptions,
  type ShopState,
} from './client.js'

export * from './client.js'

const KEY: InjectionKey<{ client: ShopClient; state: { value: ShopState } }> =
  Symbol('easy-cms-shop')

function setup(client: ShopClient) {
  const state = shallowRef(client.getState())
  client.subscribe((next) => {
    state.value = next
  })
  // Loads settings, customer and cart in the browser (not while rendering on the server).
  if (typeof window !== 'undefined') void client.load().catch(() => {})
  return { client, state }
}

/** A Vue plugin that gives every component the shop: `app.use(shopPlugin({ api }))`. */
export function shopPlugin(options: ShopClientOptions & { client?: ShopClient } = {}) {
  return {
    install(app: App) {
      app.provide(KEY, setup(options.client ?? createShopClient(options)))
    },
  }
}

/** Gives the components below this one the shop (instead of `shopPlugin`). */
export function provideShop(options: ShopClientOptions & { client?: ShopClient } = {}): ShopClient {
  const shop = setup(options.client ?? createShopClient(options))
  provide(KEY, shop)
  return shop.client
}

function useShopContext() {
  const shop = inject(KEY, null)
  if (!shop) throw new Error('useShop: install shopPlugin() or call provideShop() first')
  return shop
}

/** The shop's client, for everything the composables don't cover. */
export function useShop(): ShopClient {
  return useShopContext().client
}

/** The cart and what to do with it. */
export function useCart() {
  const { client, state } = useShopContext()
  return {
    cart: computed(() => state.value.cart),
    loading: computed(() => state.value.loading),
    busy: computed(() => state.value.busy),
    addItem: client.addItem,
    updateItem: client.updateItem,
    incrementItem: client.incrementItem,
    decrementItem: client.decrementItem,
    removeItem: client.removeItem,
    clearCart: client.clearCart,
    refreshCart: client.refreshCart,
  }
}

/** The signed-in customer, and signing in, out and up. */
export function useCustomer() {
  const { client, state } = useShopContext()
  return {
    user: computed(() => state.value.user),
    loading: computed(() => state.value.loading),
    login: client.login,
    logout: client.logout,
    signup: client.signup,
    verifyEmail: client.verifyEmail,
    forgotPassword: client.forgotPassword,
    resetPassword: client.resetPassword,
  }
}

/** The payment methods, and paying for the cart. */
export function usePayments() {
  const { client, state } = useShopContext()
  return {
    paymentMethods: computed(() => state.value.settings?.paymentMethods ?? []),
    checkout: client.checkout,
    confirm: client.confirm,
  }
}

/** Currencies, the cart's, and amounts for people. */
export function useCurrency() {
  const { client, state } = useShopContext()
  return {
    // Read the state, so they follow the cart's currency.
    currency: computed(() => {
      void state.value
      return client.currency()
    }),
    currencies: computed(() => state.value.settings?.currencies ?? []),
    setCurrency: client.setCurrency,
    formatPrice: (amount: number, code?: string) => {
      void state.value
      return client.formatPrice(amount, code)
    },
  }
}

/** The customer's saved addresses. */
export function useAddresses() {
  const { client, state } = useShopContext()
  const addresses = ref<Awaited<ReturnType<ShopClient['addresses']>>>([])
  const loading = ref(false)
  const reload = async () => {
    if (!state.value.user) {
      addresses.value = []
      return
    }
    loading.value = true
    try {
      addresses.value = await client.addresses()
    } finally {
      loading.value = false
    }
  }
  const stop = watch(
    () => state.value.user,
    () => void reload(),
    { immediate: true },
  )
  onScopeDispose(stop)
  return {
    addresses: readonly(addresses),
    loading: readonly(loading),
    reload,
    createAddress: async (...args: Parameters<ShopClient['createAddress']>) => {
      const saved = await client.createAddress(...args)
      await reload()
      return saved
    },
    updateAddress: async (...args: Parameters<ShopClient['updateAddress']>) => {
      const saved = await client.updateAddress(...args)
      await reload()
      return saved
    },
    deleteAddress: async (...args: Parameters<ShopClient['deleteAddress']>) => {
      await client.deleteAddress(...args)
      await reload()
    },
  }
}

/** The customer's orders, newest first. */
export function useOrders(options: { page?: number; limit?: number } = {}) {
  const { client, state } = useShopContext()
  const result = shallowRef<Awaited<ReturnType<ShopClient['orders']>> | null>(null)
  const stop = watch(
    () => state.value.user,
    async (user) => {
      result.value = user ? await client.orders(options).catch(() => null) : null
    },
    { immediate: true },
  )
  onScopeDispose(stop)
  return {
    orders: computed(() => result.value?.docs ?? []),
    totalPages: computed(() => result.value?.totalPages ?? 0),
  }
}
