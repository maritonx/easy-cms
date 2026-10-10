/**
 * The shop for pages, without a framework: cart, customer, checkout, addresses and orders over
 * the REST API, with a guest's cart kept in `localStorage`. `/react` and `/vue` wrap it.
 */
import {
  type Address,
  type CartView,
  type CheckoutResult,
  type ConfirmResult,
  type Currency,
  formatPrice,
  type ShopSettings,
} from './shared.js'

export * from './shared.js'

type ID = string | number

export interface ShopClientOptions {
  /** Where the CMS's REST API is. Default `/api/cms`. */
  readonly api?: string
  /** Where a guest's cart is remembered. Default `localStorage` in a browser; `null` for none. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** The key under which it is remembered. Default `easy-cms-cart`. */
  readonly storageKey?: string
  /** `en` or `th`: the language of emails and messages. Default `en`. */
  readonly locale?: string
  readonly fetch?: typeof fetch
}

/** The signed-in customer (or staff member). */
export interface ShopUser {
  readonly id: ID
  readonly email: string
  readonly name?: string | null
  readonly role: string
  readonly [field: string]: unknown
}

export interface ShopState {
  readonly settings: ShopSettings | null
  readonly user: ShopUser | null
  readonly cart: CartView | null
  /** True until `load()` finishes the first time. */
  readonly loading: boolean
  /** Waiting for the server, e.g. while adding to the cart. */
  readonly busy: boolean
}

/** An error from the API: its message and, for invalid input, which fields and why. */
export class ShopError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: readonly { field: string; message: string }[] = [],
  ) {
    super(message)
    this.name = 'ShopError'
  }
}

export interface ShopClient {
  getState(): ShopState
  /** Calls `listener` after every change; returns the way to stop. */
  subscribe(listener: (state: ShopState) => void): () => void
  /** Loads the shop's settings, the customer and the cart. Call once on start. */
  load(): Promise<void>
  /** The cart again from the server. */
  refreshCart(): Promise<CartView | null>

  addItem(product: ID, options?: { variant?: ID | null; quantity?: number }): Promise<CartView>
  /** Sets a line's quantity; 0 removes it. */
  updateItem(line: string, quantity: number): Promise<CartView>
  incrementItem(line: string): Promise<CartView>
  decrementItem(line: string): Promise<CartView>
  removeItem(line: string): Promise<CartView>
  clearCart(): Promise<CartView | null>
  setCurrency(code: string): Promise<CartView>
  /** The cart's currency, or the shop's default. */
  currency(): Currency | null
  /** An amount for people, in the cart's currency or `code`'s. */
  formatPrice(amount: number, code?: string): string

  /** Signs in; a guest's cart joins the customer's. */
  login(email: string, password: string): Promise<ShopUser>
  logout(): Promise<void>
  /**
   * Creates an account. With email confirmation (the default) resolves `{ verify: true }`: a link
   * is on its way; otherwise signs in.
   */
  signUp(data: { email: string; password: string; name?: string; turnstile?: string }): Promise<{
    verify: boolean
  }>
  /** Confirms the email from the link's `token`, and signs in. */
  verifyEmail(token: string): Promise<ShopUser>
  forgotPassword(email: string): Promise<void>
  /** Sets a new password from the link's `token`, and signs in. */
  resetPassword(token: string, password: string): Promise<ShopUser>

  /**
   * Starts paying for the cart with a payment method: its `payment` holds what the method needs
   * on the page (Stripe's `clientSecret`; a bank transfer's `instructions`).
   */
  checkout(input: {
    method: string
    /** Guests give theirs; signed-in customers use their account's. */
    email?: string
    shippingAddress?: Address
    /** A saved address of the customer instead. */
    address?: ID
  }): Promise<CheckoutResult>
  /** After the payment on the page (e.g. Stripe's `confirmPayment`): makes the order. */
  confirm(transaction: ID, input?: Record<string, unknown>): Promise<ConfirmResult>

  addresses(): Promise<(Address & { id: ID })[]>
  createAddress(address: Address): Promise<Address & { id: ID }>
  updateAddress(id: ID, address: Partial<Address>): Promise<Address & { id: ID }>
  deleteAddress(id: ID): Promise<void>
  /** The customer's orders, newest first. */
  orders(options?: { page?: number; limit?: number }): Promise<{
    docs: Record<string, unknown>[]
    totalDocs: number
    totalPages: number
    page: number
  }>
}

interface StoredCart {
  id: ID
  secret: string
}

const defaultStorage = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function createShopClient(options: ShopClientOptions = {}): ShopClient {
  const api = (options.api ?? '/api/cms').replace(/\/+$/, '')
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const key = options.storageKey ?? 'easy-cms-cart'
  const locale = options.locale ?? 'en'
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  let state: ShopState = { settings: null, user: null, cart: null, loading: true, busy: false }
  const listeners = new Set<(state: ShopState) => void>()
  const set = (patch: Partial<ShopState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state)
  }
  let csrf: string | undefined
  let signupToken: { token: string; at: number } | undefined

  const remembered = (): StoredCart | null => {
    try {
      const raw = storage?.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as StoredCart
      return parsed && typeof parsed.secret === 'string' ? parsed : null
    } catch {
      return null
    }
  }
  const remember = (cart: StoredCart | null) => {
    try {
      if (cart) storage?.setItem(key, JSON.stringify(cart))
      else storage?.removeItem(key)
    } catch {
      // Private mode: the cart lasts as long as the page.
    }
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf
    const response = await doFetch(`${api}${path}`, {
      method,
      headers,
      credentials: 'include',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    if (!response.ok)
      throw new ShopError(
        typeof json.message === 'string' ? json.message : response.statusText,
        response.status,
        Array.isArray(json.errors) ? (json.errors as { field: string; message: string }[]) : [],
      )
    return json as T
  }

  /** The cart part of a request's body: a guest's cart, by its secret. */
  const withCart = (body: Record<string, unknown> = {}) => {
    const cart = state.user ? null : remembered()
    return cart ? { ...body, cart } : body
  }

  async function busy<T>(run: () => Promise<T>): Promise<T> {
    set({ busy: true })
    try {
      return await run()
    } finally {
      set({ busy: false })
    }
  }

  async function me() {
    const result = await call<{ user: ShopUser | null; csrfToken?: string }>('GET', '/auth/me')
    csrf = result.csrfToken
    return result.user
  }

  const cartCall = (path: string, body?: Record<string, unknown>) =>
    busy(async () => {
      const result = await call<{ cart: CartView; secret?: string }>(
        'POST',
        `/shop/cart${path}`,
        withCart(body),
      )
      if (result.secret && result.cart) remember({ id: result.cart.id, secret: result.secret })
      set({ cart: result.cart })
      return result.cart
    })

  /** After signing in: the guest's cart joins the customer's. */
  async function signedIn(user: ShopUser) {
    const guest = remembered()
    remember(null)
    set({ user })
    const result = await call<{ cart: CartView | null }>(
      'POST',
      '/shop/cart/merge',
      guest ? { cart: guest } : {},
    )
    set({ cart: result.cart })
    return user
  }

  const lineQuantity = (line: string) => state.cart?.lines.find((l) => l.id === line)?.quantity ?? 0

  const client: ShopClient = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async load() {
      try {
        const [settings, user] = await Promise.all([
          call<ShopSettings>('GET', '/shop/config'),
          me().catch(() => null),
        ])
        set({ settings, user })
        await client.refreshCart()
      } finally {
        set({ loading: false })
      }
    },
    async refreshCart() {
      const result = await call<{ cart: CartView | null }>('POST', '/shop/cart', withCart())
      // A guest's cart that is gone (bought, or cleaned up) is forgotten.
      if (!result.cart && !state.user) remember(null)
      set({ cart: result.cart })
      return result.cart
    },
    addItem: (product, opts = {}) =>
      cartCall('/add', {
        product,
        ...(opts.variant !== undefined && opts.variant !== null ? { variant: opts.variant } : {}),
        quantity: opts.quantity ?? 1,
        ...(state.cart ? {} : { currency: state.settings?.defaultCurrency }),
      }),
    updateItem: (line, quantity) => cartCall('/update', { line, quantity }),
    incrementItem: (line) => cartCall('/update', { line, quantity: lineQuantity(line) + 1 }),
    decrementItem: (line) =>
      cartCall('/update', { line, quantity: Math.max(0, lineQuantity(line) - 1) }),
    removeItem: (line) => cartCall('/remove', { line }),
    async clearCart() {
      if (!state.cart) return null
      return cartCall('/clear')
    },
    setCurrency: (code) => cartCall('/currency', { currency: code }),
    currency() {
      const code = state.cart?.currency ?? state.settings?.defaultCurrency
      return state.settings?.currencies.find((c) => c.code === code) ?? null
    },
    formatPrice(amount, code) {
      const wanted = code ?? state.cart?.currency ?? state.settings?.defaultCurrency
      const currency = state.settings?.currencies.find((c) => c.code === wanted)
      if (!currency) return String(amount)
      return formatPrice(amount, currency, locale === 'th' ? 'th-TH' : locale)
    },

    async login(email, password) {
      return busy(async () => {
        const result = await call<{ user: ShopUser; csrfToken?: string }>('POST', '/auth/login', {
          email,
          password,
        })
        csrf = result.csrfToken
        return signedIn(result.user)
      })
    },
    async logout() {
      await call('POST', '/auth/logout').catch(() => {})
      csrf = undefined
      set({ user: null, cart: null })
    },
    async signUp(data) {
      return busy(async () => {
        // The form's token: fetched once the form is in use, and fresh within a day.
        if (!signupToken || Date.now() - signupToken.at > 12 * 3_600_000) {
          const form = await call<{ token: string }>('GET', '/auth/signup')
          signupToken = { token: form.token, at: Date.now() }
          // Sign-ups sent at once look like bots: give the token its moment.
          await new Promise((resolve) => setTimeout(resolve, 2_100))
        }
        const result = await call<{ verify?: boolean; user?: ShopUser; csrfToken?: string }>(
          'POST',
          '/auth/signup',
          { ...data, token: signupToken.token, locale },
        )
        if (result.verify) return { verify: true }
        csrf = result.csrfToken
        if (result.user) await signedIn(result.user)
        return { verify: false }
      })
    },
    async verifyEmail(token) {
      const result = await call<{ user: ShopUser; csrfToken?: string }>(
        'POST',
        '/auth/verify-email',
        { token },
      )
      csrf = result.csrfToken
      return signedIn(result.user)
    },
    async forgotPassword(email) {
      await call('POST', '/auth/forgot-password', { email, locale })
    },
    async resetPassword(token, password) {
      const result = await call<{ user: ShopUser; csrfToken?: string }>(
        'POST',
        '/auth/reset-password',
        { token, password, locale },
      )
      csrf = result.csrfToken
      return signedIn(result.user)
    },

    async checkout(input) {
      return busy(async () => {
        const result = await call<CheckoutResult>(
          'POST',
          '/shop/checkout',
          withCart({ ...input, locale }),
        )
        // Paid later (bank transfer): the order exists and the cart is bought.
        if (result.order) {
          remember(null)
          set({ cart: null })
        }
        return result
      })
    },
    async confirm(transaction, input = {}) {
      return busy(async () => {
        // A guest proves the payment is theirs with the cart's secret.
        const result = await call<ConfirmResult>(
          'POST',
          '/shop/confirm',
          withCart({ ...input, transaction }),
        )
        if (result.order) {
          remember(null)
          set({ cart: null })
        }
        return result
      })
    },

    async addresses() {
      const result = await call<{ docs: (Address & { id: ID })[] }>(
        'GET',
        '/addresses?limit=100&sort=-updatedAt',
      )
      return result.docs
    },
    createAddress: (address) => call<Address & { id: ID }>('POST', '/addresses', address),
    updateAddress: (id, address) =>
      call<Address & { id: ID }>('PATCH', `/addresses/${encodeURIComponent(String(id))}`, address),
    async deleteAddress(id) {
      await call('DELETE', `/addresses/${encodeURIComponent(String(id))}`)
    },
    async orders(opts = {}) {
      const query = new URLSearchParams({
        sort: '-createdAt',
        limit: String(opts.limit ?? 20),
        page: String(opts.page ?? 1),
        depth: '0',
      })
      return call('GET', `/orders?${query}`)
    },
  }
  return client
}
