/**
 * React hooks for the shop: `<ShopProvider>` around the app, then `useCart`, `useCustomer`,
 * `usePayments`, `useAddresses`, `useOrders` and `useCurrency`.
 */
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  createShopClient,
  type ShopClient,
  type ShopClientOptions,
  type ShopState,
} from './client.js'

export * from './client.js'

const ShopContext = createContext<ShopClient | null>(null)

export interface ShopProviderProps extends ShopClientOptions {
  /** A client of your own, e.g. made once for the app; by default one is made from the options. */
  readonly client?: ShopClient
  readonly children?: ReactNode
}

/** Gives the components below it the shop, loading settings, customer and cart on mount. */
export function ShopProvider(props: ShopProviderProps) {
  const { client: given, children, api, storage, storageKey, locale } = props
  const client = useMemo(
    () =>
      given ??
      createShopClient({
        ...(api !== undefined ? { api } : {}),
        ...(storage !== undefined ? { storage } : {}),
        ...(storageKey !== undefined ? { storageKey } : {}),
        ...(locale !== undefined ? { locale } : {}),
      }),
    [given, api, storage, storageKey, locale],
  )
  useEffect(() => {
    void client.load().catch(() => {})
  }, [client])
  return createElement(ShopContext.Provider, { value: client }, children)
}

/** The shop's client, for everything the hooks don't cover. */
export function useShop(): ShopClient {
  const client = useContext(ShopContext)
  if (!client) throw new Error('useShop: put <ShopProvider> around the app')
  return client
}

function useShopState(): ShopState {
  const client = useShop()
  return useSyncExternalStore(client.subscribe, client.getState, client.getState)
}

/** The cart and what to do with it. */
export function useCart() {
  const client = useShop()
  const state = useShopState()
  return {
    cart: state.cart,
    loading: state.loading,
    busy: state.busy,
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
  const client = useShop()
  const state = useShopState()
  return {
    user: state.user,
    loading: state.loading,
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
  const client = useShop()
  const state = useShopState()
  return {
    paymentMethods: state.settings?.paymentMethods ?? [],
    checkout: client.checkout,
    confirm: client.confirm,
  }
}

/** Currencies, the cart's, and amounts for people. */
export function useCurrency() {
  const client = useShop()
  const state = useShopState()
  return {
    currency: client.currency(),
    currencies: state.settings?.currencies ?? [],
    setCurrency: client.setCurrency,
    formatPrice: client.formatPrice,
  }
}

/** The customer's saved addresses. */
export function useAddresses() {
  const client = useShop()
  const { user } = useShopState()
  const [addresses, setAddresses] = useState<Awaited<ReturnType<ShopClient['addresses']>>>([])
  const [loading, setLoading] = useState(false)
  const reload = useCallback(async () => {
    if (!user) return setAddresses([])
    setLoading(true)
    try {
      setAddresses(await client.addresses())
    } finally {
      setLoading(false)
    }
  }, [client, user])
  useEffect(() => {
    void reload()
  }, [reload])
  return {
    addresses,
    loading,
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
  const client = useShop()
  const { user } = useShopState()
  const [result, setResult] = useState<Awaited<ReturnType<ShopClient['orders']>> | null>(null)
  const { page, limit } = options
  useEffect(() => {
    if (!user) return setResult(null)
    let current = true
    void client
      .orders({ ...(page ? { page } : {}), ...(limit ? { limit } : {}) })
      .then((r) => current && setResult(r))
      .catch(() => current && setResult(null))
    return () => {
      current = false
    }
  }, [client, user, page, limit])
  return {
    orders: result?.docs ?? [],
    totalPages: result?.totalPages ?? 0,
    loading: !result && !!user,
  }
}
