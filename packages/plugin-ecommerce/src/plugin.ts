import { AsyncLocalStorage } from 'node:async_hooks'
import {
  type AuthUser,
  type CollectionConfig,
  type Config,
  definePlugin,
  type EasyCMS,
  type Endpoint,
  type EndpointRequest,
  type Field,
  ForbiddenError,
  type ID,
  type Label,
  type MembersConfig,
  type MembersSignup,
  type TypedPlugin,
  UnauthorizedError,
} from '@easy-cms/core'
import {
  CARTS,
  type CollectionOptions,
  ORDERS,
  price,
  type ShopCollection,
  shopCollections,
} from './collections.js'
import { newOrder, type OrderEmailFn, orderConfirmation, paymentReceived } from './emails.js'
import { INFO } from './info.js'
import type { PaymentAdapter } from './payments.js'
import { CURRENCIES, type Currency, type ShopSettings } from './shared.js'
import {
  type CartRef,
  Carts,
  labelText,
  type OrderDoc,
  type OrderEvent,
  Orders,
  type Shop,
  type TotalsFn,
  type Who,
} from './shop.js'

export interface EcommerceOptions<Cur extends string = string> {
  /** How customers pay: `stripeAdapter()` from `@easy-cms/plugin-ecommerce/stripe`, `manualAdapter()`. */
  readonly payments: { readonly methods: readonly PaymentAdapter[] }
  readonly currencies?: {
    /**
     * Currencies prices are given in: codes of the built-in ones (`THB`, `USD`, `EUR`, `GBP`,
     * `JPY`) or your own. Each adds a price field, so adding one needs a migration. Default
     * `['THB']`.
     */
    readonly supported?: readonly (Cur | (Currency & { readonly code: Cur }))[]
    /** Default: the first. */
    readonly default?: Cur
  }
  readonly products?: {
    /** Colors, sizes and the like, each with its own price and stock. Default `true`. */
    readonly variants?: boolean
    /** More fields for products. */
    readonly fields?: readonly Field[]
  }
  /** Count stock, take it when an order is made and put it back when one is cancelled. Default `true`. */
  readonly inventory?: boolean
  readonly carts?: {
    /** People who aren't signed in can shop and pay. Default `true`. */
    readonly allowGuests?: boolean
    /** Guests' carts left this many days are deleted. Default 30. */
    readonly guestCartDays?: number
  }
  readonly addresses?: {
    /** Countries the shop sends to (ISO 3166-1 alpha-2). Default `['TH']`. */
    readonly supportedCountries?: readonly string[]
    /** Replaces the address fields (name, phone, line1, …, country). */
    readonly fields?: readonly Field[]
  }
  /** Customers' accounts: users with a role of the site (`auth.members`). */
  readonly customers?: {
    /** Default `customer`. */
    readonly role?: string
    /**
     * Visitors create an account themselves (`POST <api>/users/signup`), confirming their email.
     * `false` to make accounts some other way. Default `true`.
     */
    readonly signup?: boolean | Omit<MembersSignup, 'role'>
    /** The site's pages for email links (`auth.members.pages`). */
    readonly pages?: MembersConfig['pages']
  }
  /** Shipping, tax and discounts, worked out from the cart (and at checkout, the address). */
  readonly totals?: TotalsFn
  readonly orders?: {
    /** An order's number from its count (1, 2, …). Default: `1001`, `1002`, … */
    readonly number?: (n: number) => string
  }
  readonly emails?: {
    /** To the customer when an order is made. `false` for none. */
    readonly orderConfirmation?: OrderEmailFn | false
    /** To the customer when a manual payment is marked received. `false` for none. */
    readonly paymentReceived?: OrderEmailFn | false
    /** Who hears about new orders, e.g. `shop@example.com`. */
    readonly notify?: string | readonly string[]
    readonly newOrder?: OrderEmailFn
  }
  /** Change a collection the shop makes, e.g. add fields or access. */
  readonly overrides?: {
    readonly [S in ShopCollection]?: (collection: CollectionConfig) => CollectionConfig
  }
  /** The admin menu's heading for the shop. Default `Shop` / `ร้านค้า`. */
  readonly group?: Label
}

type Price<C extends string> = { readonly name: `priceIn${C}`; readonly type: 'number' }

/** What `ecommercePlugin(options)` adds, for the types the Local API infers from the config. */
export type EcommercePluginTypes<Cur extends string> = {
  /** Accounts made by signing up confirm their email (`auth.members.signup`). */
  readonly fields: {
    readonly users: readonly [{ readonly name: 'emailVerified'; readonly type: 'boolean' }]
  }
  readonly collections: readonly [
    {
      readonly slug: 'products'
      readonly drafts: true
      readonly fields: readonly [
        { readonly name: 'title'; readonly type: 'text'; readonly required: true },
        { readonly name: 'slug'; readonly type: 'slug' },
        { readonly name: 'description'; readonly type: 'richText' },
        { readonly name: 'images'; readonly type: 'upload'; readonly hasMany: true },
        { readonly name: 'sku'; readonly type: 'text' },
        { readonly name: 'inventory'; readonly type: 'number' },
        {
          readonly name: 'variantTypes'
          readonly type: 'relationship'
          readonly to: 'variant-types'
          readonly hasMany: true
        },
        ...Price<Cur>[],
      ]
    },
    {
      readonly slug: 'variant-types'
      readonly fields: readonly [
        { readonly name: 'name'; readonly type: 'text'; readonly required: true },
      ]
    },
    {
      readonly slug: 'variant-options'
      readonly fields: readonly [
        { readonly name: 'type'; readonly type: 'relationship'; readonly to: 'variant-types' },
        { readonly name: 'label'; readonly type: 'text'; readonly required: true },
      ]
    },
    {
      readonly slug: 'variants'
      readonly fields: readonly [
        { readonly name: 'product'; readonly type: 'relationship'; readonly to: 'products' },
        {
          readonly name: 'options'
          readonly type: 'relationship'
          readonly to: 'variant-options'
          readonly hasMany: true
        },
        { readonly name: 'title'; readonly type: 'text' },
        { readonly name: 'sku'; readonly type: 'text' },
        { readonly name: 'inventory'; readonly type: 'number' },
        ...Price<Cur>[],
      ]
    },
    {
      readonly slug: 'carts'
      readonly fields: readonly [
        { readonly name: 'customer'; readonly type: 'relationship'; readonly to: 'users' },
        { readonly name: 'currency'; readonly type: 'text' },
        {
          readonly name: 'items'
          readonly type: 'array'
          readonly fields: readonly [
            { readonly name: 'product'; readonly type: 'relationship'; readonly to: 'products' },
            { readonly name: 'variant'; readonly type: 'relationship'; readonly to: 'variants' },
            { readonly name: 'quantity'; readonly type: 'number' },
          ]
        },
        { readonly name: 'purchasedAt'; readonly type: 'date' },
      ]
    },
    {
      readonly slug: 'addresses'
      readonly fields: readonly [
        { readonly name: 'customer'; readonly type: 'relationship'; readonly to: 'users' },
        { readonly name: 'name'; readonly type: 'text' },
        { readonly name: 'phone'; readonly type: 'text' },
        { readonly name: 'line1'; readonly type: 'text' },
        { readonly name: 'line2'; readonly type: 'text' },
        { readonly name: 'subdistrict'; readonly type: 'text' },
        { readonly name: 'district'; readonly type: 'text' },
        { readonly name: 'province'; readonly type: 'text' },
        { readonly name: 'postalCode'; readonly type: 'text' },
        { readonly name: 'country'; readonly type: 'text' },
      ]
    },
    {
      readonly slug: 'orders'
      readonly fields: readonly [
        { readonly name: 'orderNumber'; readonly type: 'text'; readonly required: true },
        {
          readonly name: 'status'
          readonly type: 'select'
          readonly options: readonly ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded']
          readonly required: true
        },
        { readonly name: 'customer'; readonly type: 'relationship'; readonly to: 'users' },
        { readonly name: 'email'; readonly type: 'email'; readonly required: true },
        { readonly name: 'currency'; readonly type: 'text'; readonly required: true },
        {
          readonly name: 'items'
          readonly type: 'array'
          readonly fields: readonly [
            { readonly name: 'product'; readonly type: 'relationship'; readonly to: 'products' },
            { readonly name: 'variant'; readonly type: 'relationship'; readonly to: 'variants' },
            { readonly name: 'title'; readonly type: 'text'; readonly required: true },
            { readonly name: 'sku'; readonly type: 'text' },
            { readonly name: 'unitPrice'; readonly type: 'number'; readonly required: true },
            { readonly name: 'quantity'; readonly type: 'number'; readonly required: true },
            { readonly name: 'total'; readonly type: 'number'; readonly required: true },
          ]
        },
        { readonly name: 'subtotal'; readonly type: 'number'; readonly required: true },
        {
          readonly name: 'adjustments'
          readonly type: 'array'
          readonly fields: readonly [
            { readonly name: 'label'; readonly type: 'text'; readonly required: true },
            { readonly name: 'amount'; readonly type: 'number'; readonly required: true },
          ]
        },
        { readonly name: 'total'; readonly type: 'number'; readonly required: true },
        { readonly name: 'shippingAddress'; readonly type: 'json' },
        { readonly name: 'payment'; readonly type: 'text' },
        { readonly name: 'stockShort'; readonly type: 'boolean' },
        { readonly name: 'paidAt'; readonly type: 'date' },
        { readonly name: 'locale'; readonly type: 'text' },
        { readonly name: 'note'; readonly type: 'textarea' },
      ]
    },
    {
      readonly slug: 'transactions'
      readonly fields: readonly [
        { readonly name: 'status'; readonly type: 'text'; readonly required: true },
        { readonly name: 'method'; readonly type: 'text'; readonly required: true },
        { readonly name: 'amount'; readonly type: 'number' },
        { readonly name: 'currency'; readonly type: 'text' },
        { readonly name: 'email'; readonly type: 'email' },
        { readonly name: 'order'; readonly type: 'relationship'; readonly to: 'orders' },
        { readonly name: 'data'; readonly type: 'json' },
        { readonly name: 'reference'; readonly type: 'text' },
        { readonly name: 'error'; readonly type: 'text' },
      ]
    },
  ]
}

/** Events the shop sends to webhooks that list them (`events: ['order.paid']`). */
export const ORDER_EVENTS = [
  'order.created',
  'order.paid',
  'order.fulfilled',
  'order.cancelled',
  'order.refunded',
] as const

const ORDER_ACTIONS = new Set(['paid', 'fulfilled', 'cancelled', 'refunded'])

/** The shop whose payment endpoint is running: for adapters' webhooks (`paymentSucceeded`). */
const running = new AsyncLocalStorage<{ shop: Shop; orders: Orders }>()

function current(): Orders {
  const store = running.getStore()
  if (!store) throw new Error('Call this from a payment adapter’s endpoint')
  return store.orders
}

/**
 * For payment adapters' endpoints (e.g. a provider's webhook): the payment with this reference
 * (the `reference` the adapter gave at `initiate`) went through. Makes its order, once.
 */
export async function paymentSucceeded(reference: string): Promise<{ order: ID } | null> {
  const orders = current()
  const tx = await orders.byReference(reference)
  if (!tx) return null
  const order = await orders.finalize(tx.id as ID, 'paid')
  return { order: order.id as ID }
}

/** For payment adapters' endpoints: the payment with this reference failed. */
export async function paymentFailed(reference: string, error: string): Promise<void> {
  const orders = current()
  const tx = await orders.byReference(reference)
  if (tx) await orders.fail(tx.id as ID, error)
}

const signedIn = (req: EndpointRequest): AuthUser => {
  if (!req.user) throw new UnauthorizedError()
  return req.user
}
const staffOnly = (req: EndpointRequest) => {
  const user = signedIn(req)
  if (user.member === true) throw new ForbiddenError()
  return user
}
/** A guest cart in a request's body: `{ cart: { id, secret } }`. */
function cartRef(body: Record<string, unknown>): CartRef | null {
  const cart = body.cart as Record<string, unknown> | undefined
  if (!cart || typeof cart !== 'object') return null
  const id = cart.id
  if ((typeof id !== 'string' && typeof id !== 'number') || typeof cart.secret !== 'string')
    return null
  return { id, secret: cart.secret }
}

/**
 * A shop: products with variants and prices in several currencies, carts (guests too), checkout
 * with Stripe or a bank transfer, orders made exactly once, stock, customer accounts, emails and
 * events. Pages use the `/client`, `/react` or `/vue` kit.
 */
export function ecommercePlugin<const Cur extends string = 'THB'>(
  options: EcommerceOptions<Cur>,
): TypedPlugin<EcommercePluginTypes<Cur>> {
  const currencies: Currency[] = (options.currencies?.supported ?? ['THB']).map((c) => {
    if (typeof c !== 'string') return c
    const known = CURRENCIES[c.toUpperCase()]
    if (!known)
      throw new Error(
        `ecommercePlugin: unknown currency "${c}": give { code, symbol, label, decimals }`,
      )
    return known
  })
  if (currencies.length === 0) throw new Error('ecommercePlugin: give at least one currency')
  const defaultCurrency = options.currencies?.default ?? (currencies[0] as Currency).code
  if (!currencies.some((c) => c.code === defaultCurrency))
    throw new Error(`ecommercePlugin: the default currency "${defaultCurrency}" is not supported`)
  const methods = new Map<string, PaymentAdapter>()
  for (const method of options.payments?.methods ?? []) {
    if (!/^[a-z][a-z0-9-]*$/.test(method.name))
      throw new Error(
        `ecommercePlugin: payment method "${method.name}": use lowercase letters, digits and -`,
      )
    if (methods.has(method.name))
      throw new Error(`ecommercePlugin: two payment methods are named "${method.name}"`)
    methods.set(method.name, method)
  }
  const countries = options.addresses?.supportedCountries ?? ['TH']
  const role = options.customers?.role ?? 'customer'
  const variants = options.products?.variants !== false
  const inventory = options.inventory !== false
  const group = options.group ?? { en: 'Shop', th: 'ร้านค้า' }
  const emails = options.emails ?? {}

  const collectionOptions: CollectionOptions = {
    currencies,
    variants,
    inventory,
    countries,
    addressFields: options.addresses?.fields,
    productFields: options.products?.fields ?? [],
    group,
  }
  const collections = shopCollections(collectionOptions).map((c) => {
    const override = options.overrides?.[c.slug as ShopCollection]
    return override ? override(c) : c
  })
  const addressCollection = collections.find((c) => c.slug === 'addresses')
  const addressRequired = (addressCollection?.fields ?? [])
    .filter((f) => f.required === true && f.name !== 'customer')
    .map((f) => f.name)

  const sendOrderEmail = async (
    cms: EasyCMS,
    write: OrderEmailFn | false | undefined,
    to: string | readonly string[],
    order: OrderDoc,
  ) => {
    if (!write || !cms.config.email) return
    const currency =
      currencies.find((c) => c.code === order.currency) ?? (currencies[0] as Currency)
    const locale = order.locale === 'th' ? 'th' : 'en'
    const adapter = methods.get(String(order.paymentMethod))
    const instructions = adapter?.instructions ? labelText(adapter.instructions, locale) : null
    const content = await write({ order, locale, currency, instructions, cms })
    await cms.sendEmail({ to: typeof to === 'string' ? to : [...to], ...content })
  }

  const shop: Shop = {
    currencies,
    defaultCurrency,
    variants,
    inventory,
    guests: options.carts?.allowGuests !== false,
    countries,
    methods,
    totals: options.totals,
    orderNumber: options.orders?.number ?? ((n) => String(1000 + n)),
    addressRequired,
    onOrder: async (event: OrderEvent, order: OrderDoc, cms: EasyCMS) => {
      const about = { collection: ORDERS, id: order.id }
      cms.emit(`order.${event}`, order, about)
      if (event === 'created' && order.status === 'paid') cms.emit('order.paid', order, about)
      try {
        if (event === 'created') {
          await sendOrderEmail(
            cms,
            emails.orderConfirmation ?? orderConfirmation,
            order.email,
            order,
          )
          if (emails.notify)
            await sendOrderEmail(cms, emails.newOrder ?? newOrder, emails.notify, order)
        }
        if (event === 'paid')
          await sendOrderEmail(cms, emails.paymentReceived ?? paymentReceived, order.email, order)
      } catch (error) {
        cms.logger.error(`Shop: email for order ${order.orderNumber}: ${(error as Error).message}`)
      }
    },
  }

  const runtimes = new WeakMap<EasyCMS, { carts: Carts; orders: Orders }>()
  const runtime = (cms: EasyCMS) => {
    let found = runtimes.get(cms)
    if (!found) {
      const carts = new Carts(cms, shop)
      found = { carts, orders: new Orders(cms, shop, carts) }
      runtimes.set(cms, found)
    }
    return found
  }
  const who = (req: EndpointRequest): Who => ({ user: req.user, context: req.context })

  const settings = (): ShopSettings => ({
    currencies,
    defaultCurrency,
    paymentMethods: [...methods.values()].map((m) => ({ name: m.name, label: labelText(m.label) })),
    guests: shop.guests,
    countries,
  })

  const endpoints: Endpoint[] = [
    { path: '/shop/config', method: 'get', handler: () => settings() },
    {
      path: '/shop/cart',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        const { carts } = runtime(req.cms)
        const cart = await carts.find(who(req), cartRef(body))
        return { cart: cart ? await carts.view(cart, who(req)) : null }
      },
    },
    {
      path: '/shop/cart/add',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        return runtime(req.cms).carts.add(who(req), cartRef(body), {
          product: body.product,
          variant: body.variant,
          quantity: body.quantity,
          currency: body.currency,
        })
      },
    },
    {
      path: '/shop/cart/update',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        const cart = await runtime(req.cms).carts.update(
          who(req),
          cartRef(body),
          body.line,
          body.quantity,
        )
        return { cart }
      },
    },
    {
      path: '/shop/cart/remove',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        return { cart: await runtime(req.cms).carts.remove(who(req), cartRef(body), body.line) }
      },
    },
    {
      path: '/shop/cart/clear',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        return { cart: await runtime(req.cms).carts.clear(who(req), cartRef(body)) }
      },
    },
    {
      path: '/shop/cart/currency',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        return {
          cart: await runtime(req.cms).carts.setCurrency(who(req), cartRef(body), body.currency),
        }
      },
    },
    {
      path: '/shop/cart/merge',
      method: 'post',
      handler: async (req) => {
        signedIn(req)
        const body = await req.json()
        const ref = cartRef(body)
        const { carts } = runtime(req.cms)
        if (!ref) {
          const own = await carts.find(who(req))
          return { cart: own ? await carts.view(own, who(req)) : null }
        }
        return { cart: await carts.merge(who(req), ref) }
      },
    },
    {
      path: '/shop/checkout',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        return runtime(req.cms).orders.checkout(who(req), cartRef(body), {
          method: body.method,
          email: body.email,
          shippingAddress: body.shippingAddress,
          address: body.address,
          locale: body.locale,
        })
      },
    },
    {
      path: '/shop/confirm',
      method: 'post',
      handler: async (req) => {
        const body = await req.json()
        const { transaction, ...input } = body
        return runtime(req.cms).orders.confirm(transaction, input)
      },
    },
    {
      path: '/shop/orders/:id/:action',
      method: 'post',
      handler: async (req) => {
        staffOnly(req)
        const action = req.params.action as string
        if (!ORDER_ACTIONS.has(action)) throw new ForbiddenError()
        const order = await runtime(req.cms).orders.act(req.params.id, action, who(req))
        return { order }
      },
    },
    {
      path: '/shop/overview',
      method: 'get',
      handler: async (req) => {
        staffOnly(req)
        return overview(req)
      },
    },
    ...[...methods.values()].flatMap((method) =>
      (method.endpoints ?? []).map(
        (endpoint): Endpoint => ({
          ...endpoint,
          path: `/shop/payments/${method.name}${endpoint.path.startsWith('/') ? '' : '/'}${endpoint.path}`,
          handler: (req) => {
            const { orders } = runtime(req.cms)
            return running.run({ shop, orders }, () => endpoint.handler(req))
          },
        }),
      ),
    ),
  ]

  /** Sales of today and the last 30 days per currency, and orders that need something. */
  async function overview(req: EndpointRequest) {
    const read = { overrideAccess: false, user: req.user, context: req.context, depth: 0 } as const
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const month = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const sold = { status: { in: ['paid', 'fulfilled'] } }
    const recent = await req.cms.find(ORDERS, {
      ...read,
      where: { and: [sold, { paidAt: { gte: month } }] },
      limit: 0,
    })
    const sums = (since: string) => {
      const totals: Record<string, { total: number; orders: number }> = {}
      for (const order of recent.docs as Record<string, unknown>[]) {
        if (String(order.paidAt) < since) continue
        const code = String(order.currency)
        const entry = totals[code] ?? { total: 0, orders: 0 }
        entry.total += Number(order.total)
        entry.orders++
        totals[code] = entry
      }
      return totals
    }
    const count = (status: string) =>
      req.cms.count(ORDERS, { ...read, where: { status: { equals: status } } })
    return {
      today: sums(today),
      month: sums(month),
      pending: await count('pending'),
      toFulfil: await count('paid'),
      currencies,
    }
  }

  return definePlugin<EcommercePluginTypes<Cur>>((config: Config): Config => {
    const auth = config.auth ?? {}
    const roles = auth.roles ?? ['admin', 'editor']
    const members = auth.members
    const signup = options.customers?.signup ?? true
    const pages = members?.pages ?? options.customers?.pages
    const memberSignup =
      members?.signup ??
      (signup === false ? undefined : { role, ...(signup === true ? {} : signup) })
    return {
      ...config,
      collections: [...(config.collections ?? []), ...collections],
      endpoints: [...(config.endpoints ?? []), ...endpoints],
      fieldTypes: [...(config.fieldTypes ?? []), price],
      events: [...new Set([...(config.events ?? []), ...ORDER_EVENTS])],
      jobs: [
        ...(config.jobs ?? []),
        {
          name: 'shop:payments',
          every: 300,
          run: ({ cms, now }) => runtime(cms).orders.release(now),
        },
        {
          name: 'shop:carts',
          every: 86_400,
          run: async ({ cms, now }) => {
            const before = new Date(
              now.getTime() - (options.carts?.guestCartDays ?? 30) * 86_400_000,
            ).toISOString()
            const old = await cms.find(CARTS, {
              where: {
                and: [
                  { customer: { exists: false } },
                  { purchasedAt: { exists: false } },
                  { updatedAt: { lt: before } },
                ],
              },
              limit: 500,
              depth: 0,
            })
            for (const cart of old.docs) await cms.delete(CARTS, cart.id as ID)
          },
        },
      ],
      auth: {
        ...auth,
        roles: roles.includes(role) ? roles : [...roles, role],
        members: {
          ...members,
          roles: [...new Set([...(members?.roles ?? []), role])],
          ...(memberSignup ? { signup: memberSignup } : {}),
          ...(pages ? { pages } : {}),
        },
      },
      admin: {
        ...config.admin,
        modules: [...(config.admin?.modules ?? []), '@easy-cms/plugin-ecommerce/admin'],
        dashboard: [
          ...(config.admin?.dashboard ?? []),
          {
            component: {
              tag: 'ecms-shop-overview',
              props: { adminPath: config.admin?.path ?? '/admin' },
            },
            width: 'full',
            label: { en: 'Shop', th: 'ร้านค้า' },
            access: ({ user }) => user.member !== true,
          },
        ],
      },
    }
  }, INFO)
}
