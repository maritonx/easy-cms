import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  type AuthUser,
  type EasyCMS,
  ForbiddenError,
  type ID,
  type Label,
  NotFoundError,
  QueryError,
  type RequestContext,
  ValidationError,
  type Where,
} from '@easy-cms/core'
import { CARTS, COUNTERS, ORDERS, PRODUCTS, TRANSACTIONS, VARIANTS } from './collections.js'
import type { PaymentAdapter, PaymentTransaction } from './payments.js'
import {
  type Address,
  type Adjustment,
  type CartLine,
  type CartView,
  type CheckoutResult,
  type ConfirmResult,
  type Currency,
  type OrderStatus,
  priceField,
  type TransactionStatus,
} from './shared.js'

type Data = Record<string, unknown>

/** Who a call is for: the request's user (a customer, staff or nobody) and context (the tenant). */
export interface Who {
  readonly user: AuthUser | null
  readonly context: RequestContext
}

/** A guest's cart: its id and the secret the browser keeps. */
export interface CartRef {
  readonly id: ID
  readonly secret: string
}

/** What `totals` receives. */
export interface TotalsArgs {
  readonly cart: CartView
  readonly currency: Currency
  /** At checkout; `undefined` while shopping. */
  readonly shippingAddress?: Address
  readonly customer: AuthUser | null
  readonly context: RequestContext
  readonly cms: EasyCMS
}

/**
 * Shipping, tax and discounts: what to add to (or, negative, take off) a cart's subtotal. Runs
 * for the cart and again at checkout, with the address.
 */
export type TotalsFn = (args: TotalsArgs) => readonly Adjustment[] | Promise<readonly Adjustment[]>

/** An order as emails and events see it. */
export type OrderDoc = Data & {
  id: ID
  orderNumber: string
  status: OrderStatus
  email: string
  currency: string
  total: number
}

/** The shop's settings, worked out from the plugin's options. */
export interface Shop {
  readonly currencies: readonly Currency[]
  readonly defaultCurrency: string
  readonly variants: boolean
  readonly inventory: boolean
  readonly guests: boolean
  readonly countries: readonly string[]
  readonly methods: ReadonlyMap<string, PaymentAdapter>
  readonly totals: TotalsFn | undefined
  readonly orderNumber: (n: number) => string
  /**
   * Called when an order is made (`created`, paid or not yet) and as it moves on: events and
   * emails.
   */
  readonly onOrder: (event: OrderEvent, order: OrderDoc, cms: EasyCMS) => Promise<void>
  /** Required fields of an address. */
  readonly addressRequired: readonly string[]
}

export type OrderEvent = 'created' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded'

const MAX_QUANTITY = 999

const hash = (secret: string) => createHash('sha256').update(secret).digest('hex')
const sameSecret = (secret: string, stored: unknown) => {
  if (typeof stored !== 'string' || stored.length === 0) return false
  const a = Buffer.from(hash(secret))
  const b = Buffer.from(stored)
  return a.length === b.length && timingSafeEqual(a, b)
}
const idOf = (value: unknown): ID | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return ((value as Data).id as ID | undefined) ?? null
  return value as ID
}
const same = (a: unknown, b: unknown) => idOf(a) !== null && String(idOf(a)) === String(idOf(b))
const invalid = (collection: string, field: string, message: string) =>
  new ValidationError(collection, [{ field, message }])

export function labelText(label: Label, locale = 'en'): string {
  if (typeof label === 'string') return label
  return label[locale] ?? label.en ?? Object.values(label)[0] ?? ''
}

/**
 * Where a unique field of a collection is unique within for this call (the tenant, with the
 * multi-tenant plugin): a filter to keep lookups there.
 */
async function scope(cms: EasyCMS, collection: string, field: string, who: Who) {
  const values = await cms.uniqueScope(collection, field, who)
  const parts: Where[] = Object.entries(values).map(([name, value]) =>
    value === null || value === undefined
      ? { [name]: { exists: false } }
      : { [name]: { equals: idOf(value) } },
  )
  return parts
}

/** Writes on behalf of a request: its context reaches the hooks (e.g. the tenant). */
const writeAs = (who: Who) => ({ context: who.context, user: who.user })

// --- Carts --------------------------------------------------------------------------------

export class Carts {
  constructor(
    private readonly cms: EasyCMS,
    private readonly shop: Shop,
  ) {}

  /** The open cart of a customer, or a guest's by its secret; `null` when there is none. */
  async find(who: Who, ref?: CartRef | null): Promise<Data | null> {
    const { cms } = this
    const within = await scope(cms, CARTS, 'secret', who)
    if (ref && typeof ref.secret === 'string' && ref.secret) {
      const found = await cms.find(CARTS, {
        where: { and: [{ id: { equals: ref.id } }, { purchasedAt: { exists: false } }, ...within] },
        limit: 1,
        depth: 0,
      })
      const cart = found.docs[0] as Data | undefined
      if (!cart) return null
      // The secret is hidden from the API: compare with the stored row.
      const raw = await cms.db.findById({ collection: CARTS, id: cart.id as ID })
      if (sameSecret(ref.secret, raw?.secret)) return cart
      // A signed-in customer's own cart needs no secret.
      if (who.user && same(cart.customer, who.user.id)) return cart
      return null
    }
    if (!who.user) return null
    const found = await cms.find(CARTS, {
      where: {
        and: [{ customer: { equals: who.user.id } }, { purchasedAt: { exists: false } }, ...within],
      },
      sort: '-updatedAt',
      limit: 1,
      depth: 0,
    })
    return (found.docs[0] as Data | undefined) ?? null
  }

  /** The cart to add to: found, or made (a guest's with a new secret). */
  private async open(who: Who, ref: CartRef | null | undefined, currency?: string) {
    const found = await this.find(who, ref)
    if (found) return { cart: found, secret: undefined }
    if (!who.user && !this.shop.guests) throw invalid(CARTS, 'customer', 'sign in to shop')
    const secret = who.user ? undefined : randomBytes(24).toString('base64url')
    const created = (await this.cms.create(
      CARTS,
      {
        currency: this.currency(currency),
        items: [],
        ...(who.user ? { customer: who.user.id } : {}),
      },
      writeAs(who),
    )) as Data
    if (secret) await this.setSecret(created.id as ID, hash(secret))
    return { cart: created, secret }
  }

  private async setSecret(id: ID, value: string | null) {
    const raw = await this.cms.db.findById({ collection: CARTS, id })
    if (!raw) return
    const { id: _id, ...rest } = raw
    await this.cms.db.update({ collection: CARTS, id, data: { ...rest, secret: value } })
  }

  private currency(code: unknown): string {
    if (typeof code === 'string' && this.shop.currencies.some((c) => c.code === code)) return code
    return this.shop.defaultCurrency
  }

  private items(cart: Data): Data[] {
    return Array.isArray(cart.items) ? (cart.items as Data[]) : []
  }

  private async save(cart: Data, patch: Data, who: Who): Promise<Data> {
    return (await this.cms.update(CARTS, cart.id as ID, patch, writeAs(who))) as Data
  }

  /** Adds a product (and variant) to the cart, or more of it. */
  async add(
    who: Who,
    ref: CartRef | null | undefined,
    input: { product: unknown; variant?: unknown; quantity?: unknown; currency?: unknown },
  ): Promise<{ cart: CartView; secret?: string }> {
    const quantity = input.quantity === undefined ? 1 : Number(input.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)
      throw invalid(CARTS, 'quantity', `must be a whole number from 1 to ${MAX_QUANTITY}`)
    const { product, variant } = await this.item(who, input.product, input.variant)
    const { cart, secret } = await this.open(who, ref, input.currency as string | undefined)
    const currency = this.currencyOf(cart)
    if (unitPrice(product, variant, currency.code) === null)
      throw invalid(CARTS, 'product', `has no price in ${currency.code}`)
    const items = this.items(cart).map((i) => ({ ...i }))
    const existing = items.find(
      (i) =>
        same(i.product, product.id) && (variant ? same(i.variant, variant.id) : !idOf(i.variant)),
    )
    const total = (existing ? Number(existing.quantity) : 0) + quantity
    this.checkStock(product, variant, total)
    if (existing) existing.quantity = Math.min(total, MAX_QUANTITY)
    else
      items.push({
        product: product.id,
        ...(variant ? { variant: variant.id } : {}),
        quantity,
      })
    const saved = await this.save(cart, { items }, who)
    return { cart: await this.view(saved, who), ...(secret ? { secret } : {}) }
  }

  /** Sets a line's quantity; 0 removes it. */
  async update(
    who: Who,
    ref: CartRef | null | undefined,
    line: unknown,
    quantity: unknown,
  ): Promise<CartView> {
    const cart = await this.require(who, ref)
    const n = Number(quantity)
    if (!Number.isInteger(n) || n < 0 || n > MAX_QUANTITY)
      throw invalid(CARTS, 'quantity', `must be a whole number from 0 to ${MAX_QUANTITY}`)
    const items = this.items(cart)
    const target = items.find((i) => i.id === line)
    if (!target) throw new NotFoundError(CARTS, String(line))
    if (n > Number(target.quantity)) {
      const { product, variant } = await this.item(who, target.product, target.variant)
      this.checkStock(product, variant, n)
    }
    const next =
      n === 0
        ? items.filter((i) => i !== target)
        : items.map((i) => (i === target ? { ...i, quantity: n } : i))
    return this.view(await this.save(cart, { items: next }, who), who)
  }

  async remove(who: Who, ref: CartRef | null | undefined, line: unknown): Promise<CartView> {
    return this.update(who, ref, line, 0)
  }

  async clear(who: Who, ref: CartRef | null | undefined): Promise<CartView> {
    const cart = await this.require(who, ref)
    return this.view(await this.save(cart, { items: [] }, who), who)
  }

  async setCurrency(who: Who, ref: CartRef | null | undefined, code: unknown): Promise<CartView> {
    if (typeof code !== 'string' || !this.shop.currencies.some((c) => c.code === code))
      throw invalid(CARTS, 'currency', 'is not one of the shop’s currencies')
    const { cart } = await this.open(who, ref, code)
    return this.view(await this.save(cart, { currency: code }, who), who)
  }

  /**
   * After signing in: a guest's cart joins the customer's. With no cart of their own, the guest
   * cart becomes theirs; otherwise its lines are added to theirs. The secret stops working.
   */
  async merge(who: Who, ref: CartRef): Promise<CartView | null> {
    const user = who.user
    if (!user) throw invalid(CARTS, 'customer', 'sign in first')
    const guest = await this.find({ user: null, context: who.context }, ref)
    const own = await this.find(who)
    if (!guest) return own ? this.view(own, who) : null
    if (same(guest.id, own?.id)) return this.view(guest, who)
    if (!own) {
      const saved = await this.save(guest, { customer: user.id }, who)
      await this.setSecret(guest.id as ID, null)
      return this.view(saved, who)
    }
    const items = this.items(own).map((i) => ({ ...i }))
    for (const line of this.items(guest)) {
      const match = items.find(
        (i) =>
          same(i.product, line.product) && String(idOf(i.variant)) === String(idOf(line.variant)),
      )
      if (match)
        match.quantity = Math.min(Number(match.quantity) + Number(line.quantity), MAX_QUANTITY)
      else {
        const { id: _id, ...rest } = line
        items.push(rest)
      }
    }
    const saved = await this.save(own, { items }, who)
    await this.cms.delete(CARTS, guest.id as ID, writeAs(who))
    return this.view(saved, who)
  }

  async require(who: Who, ref: CartRef | null | undefined): Promise<Data> {
    const cart = await this.find(who, ref)
    if (!cart) throw new NotFoundError(CARTS, String(ref?.id ?? 'cart'))
    return cart
  }

  currencyOf(cart: Data): Currency {
    const code = this.currency(cart.currency)
    return this.shop.currencies.find((c) => c.code === code) as Currency
  }

  /** A product (published, readable for this request) and its variant, checked together. */
  private async item(who: Who, productId: unknown, variantId: unknown) {
    const id = idOf(productId)
    const read = { overrideAccess: false, user: who.user, context: who.context, depth: 0 } as const
    const product =
      id === null
        ? null
        : ((await this.cms.find(PRODUCTS, { where: { id: { equals: id } }, limit: 1, ...read }))
            .docs[0] as Data | undefined)
    if (!product) throw invalid(CARTS, 'product', 'is not for sale')
    const types = Array.isArray(product.variantTypes) ? product.variantTypes : []
    const vid = idOf(variantId)
    if (!this.shop.variants || types.length === 0) {
      if (vid !== null) throw invalid(CARTS, 'variant', 'this product has no variants')
      return { product, variant: null }
    }
    if (vid === null) throw invalid(CARTS, 'variant', 'choose one of the product’s options')
    const variant = (
      await this.cms.find(VARIANTS, { where: { id: { equals: vid } }, limit: 1, ...read })
    ).docs[0] as Data | undefined
    if (!variant || !same(variant.product, product.id))
      throw invalid(CARTS, 'variant', 'is not one of this product’s')
    return { product, variant }
  }

  private checkStock(product: Data, variant: Data | null, quantity: number) {
    const left = stockOf(this.shop, product, variant)
    if (left !== null && quantity > left)
      throw invalid(CARTS, 'quantity', left === 0 ? 'out of stock' : `only ${left} left`)
  }

  /** The cart as pages see it: lines with prices and stock, totals. */
  async view(cart: Data, who: Who, shippingAddress?: Address): Promise<CartView> {
    const currency = this.currencyOf(cart)
    const items = this.items(cart)
    const read = { overrideAccess: false, user: who.user, context: who.context } as const
    const productIds = [...new Set(items.map((i) => idOf(i.product)).filter((v) => v !== null))]
    const variantIds = [...new Set(items.map((i) => idOf(i.variant)).filter((v) => v !== null))]
    const products = productIds.length
      ? ((
          await this.cms.find(PRODUCTS, {
            where: { id: { in: productIds } },
            limit: 0,
            depth: 1,
            ...read,
          })
        ).docs as Data[])
      : []
    const variants =
      variantIds.length && this.shop.variants
        ? ((
            await this.cms.find(VARIANTS, {
              where: { id: { in: variantIds } },
              limit: 0,
              depth: 0,
              ...read,
            })
          ).docs as Data[])
        : []
    const lines: CartLine[] = items.map((item) => {
      const product = products.find((p) => same(p.id, item.product))
      const variant = variants.find((v) => same(v.id, item.variant)) ?? null
      const quantity = Number(item.quantity)
      const price = product ? unitPrice(product, variant, currency.code) : null
      const stock = product ? stockOf(this.shop, product, variant) : null
      const images = Array.isArray(product?.images) ? (product.images as Data[]) : []
      const wantsVariant = idOf(item.variant) !== null
      return {
        id: String(item.id),
        product: {
          id: idOf(item.product) as ID,
          title: String(product?.title ?? ''),
          slug: typeof product?.slug === 'string' ? product.slug : null,
          image: typeof images[0]?.url === 'string' ? (images[0].url as string) : null,
        },
        variant: variant ? { id: variant.id as ID, title: String(variant.title ?? '') } : null,
        quantity,
        unitPrice: price,
        total: (price ?? 0) * quantity,
        available:
          product !== undefined &&
          price !== null &&
          (!wantsVariant || variant !== null) &&
          (stock === null || stock >= quantity),
        stock,
      }
    })
    const subtotal = lines.reduce((sum, l) => sum + l.total, 0)
    const base: CartView = {
      id: cart.id as ID,
      currency: currency.code,
      lines,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotal,
      adjustments: [],
      total: subtotal,
    }
    const adjustments = await this.adjust(base, currency, who, shippingAddress)
    return { ...base, adjustments, total: subtotal + adjustments.reduce((s, a) => s + a.amount, 0) }
  }

  private async adjust(
    cart: CartView,
    currency: Currency,
    who: Who,
    shippingAddress?: Address,
  ): Promise<Adjustment[]> {
    if (!this.shop.totals || cart.lines.length === 0) return []
    const result = await this.shop.totals({
      cart,
      currency,
      ...(shippingAddress ? { shippingAddress } : {}),
      customer: who.user,
      context: who.context,
      cms: this.cms,
    })
    return result.map((a) => {
      if (typeof a?.label !== 'string' || !Number.isInteger(a.amount))
        throw new QueryError('totals must return [{ label, amount }] with whole amounts')
      return { label: a.label, amount: a.amount }
    })
  }
}

/** A product's price in a currency, or its variant's when it has one; `null` when unpriced. */
export function unitPrice(product: Data, variant: Data | null, code: string): number | null {
  const field = priceField(code)
  const own = variant?.[field]
  if (typeof own === 'number') return own
  const base = product[field]
  return typeof base === 'number' ? base : null
}

/** What is left in stock; `null` when stock isn't counted (off, or left empty). */
export function stockOf(shop: Shop, product: Data, variant: Data | null): number | null {
  if (!shop.inventory) return null
  const value = (variant ?? product).inventory
  return typeof value === 'number' ? value : null
}

// --- Checkout and orders ----------------------------------------------------------------

/** One line of an order, as worked out at checkout. */
interface OrderLine {
  product: ID
  variant?: ID
  title: string
  sku: string | null
  unitPrice: number
  quantity: number
  total: number
}

/** What a transaction keeps for its order. */
interface Snapshot {
  lines: OrderLine[]
  subtotal: number
  adjustments: Adjustment[]
  total: number
  shippingAddress: Address | null
  locale: string
  /** The checkout request's context (e.g. the tenant), for the order made later from a webhook. */
  context: RequestContext
}

const toPayment = (tx: Data): PaymentTransaction => ({
  id: tx.id as ID,
  amount: Number(tx.amount),
  currency: String(tx.currency),
  email: String(tx.email ?? ''),
  status: tx.status as TransactionStatus,
  data: (tx.data ?? {}) as Record<string, unknown>,
})

const orderRef = (order: Data | null) =>
  order
    ? {
        id: order.id as ID,
        orderNumber: String(order.orderNumber),
        status: order.status as OrderStatus,
      }
    : null

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The plain values of a context (ids, flags), which can be stored as JSON. */
function plainContext(context: RequestContext): RequestContext {
  const plain: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context))
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) plain[key] = value
  return plain
}

export class Orders {
  constructor(
    private readonly cms: EasyCMS,
    private readonly shop: Shop,
    private readonly carts: Carts,
  ) {}

  private adapter(name: unknown): PaymentAdapter {
    const adapter = typeof name === 'string' ? this.shop.methods.get(name) : undefined
    if (!adapter) throw invalid(TRANSACTIONS, 'method', 'is not a payment method of the shop')
    return adapter
  }

  /**
   * Starts paying for a cart: checks it, works out the totals, keeps them on a new transaction
   * and asks the payment method to start. Manual methods (bank transfer) make the order now.
   */
  async checkout(
    who: Who,
    ref: CartRef | null | undefined,
    input: {
      method: unknown
      email?: unknown
      shippingAddress?: unknown
      address?: unknown
      locale?: unknown
    },
  ): Promise<CheckoutResult> {
    const adapter = this.adapter(input.method)
    const cart = await this.carts.require(who, ref)
    const email = (who.user?.email ?? (typeof input.email === 'string' ? input.email.trim() : ''))
      .toString()
      .toLowerCase()
    if (!EMAIL.test(email)) throw invalid(ORDERS, 'email', 'must be a valid email address')
    const shippingAddress = await this.address(who, input)
    const view = await this.carts.view(cart, who, shippingAddress ?? undefined)
    if (view.lines.length === 0) throw invalid(CARTS, 'items', 'the cart is empty')
    const unavailable = view.lines.filter((l) => !l.available)
    if (unavailable.length > 0)
      throw new ValidationError(
        CARTS,
        unavailable.map((l) => ({
          field: `items.${l.id}`,
          message: `${l.product.title}${l.variant ? ` (${l.variant.title})` : ''} is not available as it is`,
        })),
      )
    if (view.total < 0) throw invalid(ORDERS, 'total', 'can’t be below 0')

    // Titles and SKUs as they are now: the order keeps them even if the product changes.
    const read = { overrideAccess: false, user: who.user, context: who.context, depth: 0 } as const
    const lines: OrderLine[] = []
    for (const line of view.lines) {
      const product = (await this.cms.findById(PRODUCTS, line.product.id, read)) as Data
      const variant = line.variant
        ? ((await this.cms.findById(VARIANTS, line.variant.id, read)) as Data)
        : null
      lines.push({
        product: line.product.id,
        ...(line.variant ? { variant: line.variant.id } : {}),
        title: line.variant ? `${line.product.title} (${line.variant.title})` : line.product.title,
        sku: ((variant?.sku ?? product.sku) as string | null | undefined) ?? null,
        unitPrice: line.unitPrice as number,
        quantity: line.quantity,
        total: line.total,
      })
    }
    const snapshot: Snapshot = {
      lines,
      subtotal: view.subtotal,
      adjustments: [...view.adjustments],
      total: view.total,
      shippingAddress,
      locale: input.locale === 'th' ? 'th' : 'en',
      context: plainContext(who.context),
    }
    const tx = (await this.cms.create(
      TRANSACTIONS,
      {
        status: 'pending',
        method: adapter.name,
        amount: view.total,
        currency: view.currency,
        email,
        ...(who.user ? { customer: who.user.id } : {}),
        cart: cart.id,
        checkout: snapshot,
      },
      writeAs(who),
    )) as Data
    let started: Awaited<ReturnType<PaymentAdapter['initiate']>>
    try {
      started = await adapter.initiate({ cms: this.cms, transaction: toPayment(tx) })
    } catch (error) {
      await this.setTransaction(tx, { status: 'failed', error: (error as Error).message })
      throw error
    }
    const saved = await this.setTransaction(tx, {
      data: started.data ?? {},
      ...(started.reference ? { reference: started.reference } : {}),
    })
    const order = adapter.manual ? await this.finalize(saved.id as ID, 'pending') : null
    const client = {
      ...(adapter.instructions
        ? { instructions: labelText(adapter.instructions, snapshot.locale) }
        : {}),
      ...started.client,
    }
    return { transaction: tx.id as ID, payment: client, order: orderRef(order) }
  }

  private async address(who: Who, input: { shippingAddress?: unknown; address?: unknown }) {
    const id = idOf(input.address)
    if (id !== null) {
      if (!who.user) throw invalid(ORDERS, 'address', 'sign in to use a saved address')
      const found = (await this.cms
        .findById('addresses', id, { overrideAccess: false, user: who.user, context: who.context })
        .catch(() => null)) as Data | null
      if (!found) throw invalid(ORDERS, 'address', 'is not one of yours')
      const { id: _id, customer: _c, createdAt: _a, updatedAt: _u, ...rest } = found
      return this.checkAddress(rest)
    }
    if (input.shippingAddress === undefined || input.shippingAddress === null) return null
    if (typeof input.shippingAddress !== 'object' || Array.isArray(input.shippingAddress))
      throw invalid(ORDERS, 'shippingAddress', 'must be an object')
    return this.checkAddress(input.shippingAddress as Data)
  }

  private checkAddress(address: Data): Address {
    const errors = this.shop.addressRequired
      .filter((f) => typeof address[f] !== 'string' || (address[f] as string).trim() === '')
      .map((f) => ({ field: `shippingAddress.${f}`, message: 'is required' }))
    const country = address.country
    if (country !== undefined && !this.shop.countries.includes(String(country)))
      errors.push({
        field: 'shippingAddress.country',
        message: 'is not a country the shop sends to',
      })
    if (errors.length > 0) throw new ValidationError(ORDERS, errors)
    const clean: Data = {}
    for (const [key, value] of Object.entries(address))
      if (typeof value === 'string' || value === null) clean[key] = value
    return clean as Address
  }

  /**
   * After the page says the payment went through: asks the payment method, and makes the order
   * when it did. Safe to call again: the order is made once. Only for whoever started the
   * payment (its customer, or the guest with its cart's secret) and staff; others get 404.
   */
  async confirm(who: Who, ref: CartRef | null, id: unknown, input: Data): Promise<ConfirmResult> {
    const tx = await this.transaction(id)
    if (!(await this.startedBy(who, ref, tx))) throw new NotFoundError(TRANSACTIONS, String(id))
    if (tx.order)
      return { status: tx.status as TransactionStatus, order: orderRef(await this.order(tx.order)) }
    const adapter = this.adapter(tx.method)
    if (adapter.manual || !adapter.confirm)
      return { status: tx.status as TransactionStatus, order: null }
    const outcome = await adapter.confirm({ cms: this.cms, transaction: toPayment(tx), input })
    if (outcome === 'succeeded') {
      const order = await this.finalize(tx.id as ID, 'paid')
      return { status: 'succeeded', order: orderRef(order) }
    }
    if (outcome === 'failed' && tx.status === 'pending')
      await this.cms.update(
        TRANSACTIONS,
        tx.id as ID,
        { status: 'failed' },
        {
          where: { status: { equals: 'pending' } },
        },
      )
    return { status: outcome === 'failed' ? 'failed' : 'processing', order: null }
  }

  /** The caller started this payment: its customer, the guest holding its cart, or staff. */
  private async startedBy(who: Who, ref: CartRef | null, tx: Data): Promise<boolean> {
    const user = who.user
    if (user && user.member !== true) return true
    if (tx.customer) return !!user && same(tx.customer, user.id)
    const cart = idOf(tx.cart)
    if (cart === null) return false
    // The secret is hidden from the API: compare with the stored row.
    const raw = await this.cms.db.findById({ collection: CARTS, id: cart })
    if (!raw) return false
    // A guest who signed in since: the cart became theirs.
    if (user && same(raw.customer, user.id)) return true
    return !!ref && same(ref.id, cart) && sameSecret(ref.secret, raw.secret)
  }

  /** A payment the provider reports as failed (e.g. from its webhook). */
  async fail(id: ID, error: string): Promise<void> {
    await this.cms.update(
      TRANSACTIONS,
      id,
      { status: 'failed', error },
      {
        where: {
          and: [{ status: { in: ['pending', 'processing'] } }, { order: { exists: false } }],
        },
      },
    )
  }

  /** A transaction by the provider's reference (e.g. Stripe's payment intent id). */
  async byReference(reference: string): Promise<Data | null> {
    const found = await this.cms.find(TRANSACTIONS, {
      where: { reference: { equals: reference } },
      limit: 1,
      depth: 0,
    })
    return (found.docs[0] as Data | undefined) ?? null
  }

  private async transaction(id: unknown): Promise<Data> {
    const tid = idOf(id)
    const tx =
      tid === null
        ? null
        : ((await this.cms
            .findById(TRANSACTIONS, tid, { depth: 0 })
            .catch(() => null)) as Data | null)
    if (!tx) throw new NotFoundError(TRANSACTIONS, String(id))
    return tx
  }

  private async order(id: unknown): Promise<Data | null> {
    const oid = idOf(id)
    return oid === null
      ? null
      : ((await this.cms.findById(ORDERS, oid, { depth: 0 }).catch(() => null)) as Data | null)
  }

  private async setTransaction(tx: Data, patch: Data): Promise<Data> {
    return (await this.cms.update(TRANSACTIONS, tx.id as ID, patch, { depth: 0 })) as Data
  }

  /**
   * Makes the order of a transaction whose payment succeeded (`paid`) or will come later
   * (`pending`), exactly once however often it is called: the first call claims the
   * transaction; the others get the same order.
   */
  async finalize(id: ID, status: 'paid' | 'pending'): Promise<Data> {
    const tx = await this.transaction(id)
    if (tx.order) return (await this.order(tx.order)) as Data
    const claimed = await this.cms.update(
      TRANSACTIONS,
      id,
      { status: 'processing' },
      {
        where: { and: [{ status: { in: ['pending', 'failed'] } }, { order: { exists: false } }] },
        depth: 0,
      },
    )
    if (!claimed) {
      // Another call is making it: wait for its order.
      for (let i = 0; i < 50; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        const again = await this.transaction(id)
        if (again.order) return (await this.order(again.order)) as Data
      }
      throw new QueryError('The order is still being made; try again in a moment')
    }
    try {
      return await this.makeOrder(claimed as Data, status)
    } catch (error) {
      // Leave it to be tried again.
      await this.setTransaction(claimed as Data, {
        status: 'pending',
        error: (error as Error).message,
      })
      throw error
    }
  }

  private async makeOrder(tx: Data, status: 'paid' | 'pending'): Promise<Data> {
    const snapshot = tx.checkout as Snapshot
    const context = snapshot.context ?? {}
    const who: Who = { user: null, context }
    let short = false
    for (const line of snapshot.lines) if (!(await this.take(line, -line.quantity))) short = true
    const adapter = this.shop.methods.get(String(tx.method))
    const order = (await this.cms.create(
      ORDERS,
      {
        orderNumber: await this.nextNumber(who),
        status,
        ...(tx.customer ? { customer: idOf(tx.customer) } : {}),
        email: tx.email,
        currency: tx.currency,
        items: snapshot.lines,
        subtotal: snapshot.subtotal,
        adjustments: snapshot.adjustments,
        total: snapshot.total,
        ...(snapshot.shippingAddress ? { shippingAddress: snapshot.shippingAddress } : {}),
        payment: adapter ? labelText(adapter.label, snapshot.locale) : String(tx.method),
        paymentMethod: String(tx.method),
        stockShort: short,
        locale: snapshot.locale,
        ...(status === 'paid' ? { paidAt: new Date().toISOString() } : {}),
        ...(status === 'pending' && typeof adapter?.expiresIn === 'number'
          ? { expiresAt: new Date(Date.now() + adapter.expiresIn * 1000).toISOString() }
          : {}),
      },
      { context, depth: 0 },
    )) as Data
    if (tx.cart)
      await this.cms
        .update(CARTS, idOf(tx.cart) as ID, { purchasedAt: new Date().toISOString() }, { context })
        .catch(() => {})
    await this.setTransaction(tx, {
      status: status === 'paid' ? 'succeeded' : 'pending',
      order: order.id,
      error: null,
    })
    await this.shop.onOrder('created', order as OrderDoc, this.cms)
    return order
  }

  /** Takes items from stock (or puts them back): `false` when there weren't enough. */
  private async take(line: { product: unknown; variant?: unknown }, by: number): Promise<boolean> {
    if (!this.shop.inventory) return true
    const target = line.variant
      ? { collection: VARIANTS, id: idOf(line.variant) }
      : { collection: PRODUCTS, id: idOf(line.product) }
    if (target.id === null) return true
    const doc = await this.cms.db.findById({ collection: target.collection, id: target.id })
    // Gone, or stock not counted.
    if (!doc || typeof doc.inventory !== 'number') return true
    const result = await this.cms.increment(target.collection, target.id, 'inventory', by, {
      min: 0,
    })
    return result !== null
  }

  private async nextNumber(who: Who): Promise<string> {
    const within = await scope(this.cms, COUNTERS, 'key', who)
    const where = { and: [{ key: { equals: 'orders' } }, ...within] }
    let counter = (await this.cms.find(COUNTERS, { where, limit: 1, depth: 0 })).docs[0] as
      | Data
      | undefined
    if (!counter) {
      try {
        counter = (await this.cms.create(
          COUNTERS,
          { key: 'orders', value: 0 },
          { context: who.context },
        )) as Data
      } catch {
        // Made at the same moment by another order.
        counter = (await this.cms.find(COUNTERS, { where, limit: 1, depth: 0 })).docs[0] as Data
      }
    }
    const n = await this.cms.increment(COUNTERS, counter.id as ID, 'value', 1)
    return this.shop.orderNumber(n as number)
  }

  /** The actions on an order in the admin, by staff. */
  async act(id: unknown, action: string, who: Who): Promise<Data> {
    const oid = idOf(id)
    const visible =
      oid === null
        ? null
        : ((await this.cms
            .findById(ORDERS, oid, {
              overrideAccess: false,
              user: who.user,
              context: who.context,
              depth: 0,
            })
            .catch(() => null)) as Data | null)
    if (!visible) throw new NotFoundError(ORDERS, String(id))
    // Moving an order (and refunding its money) takes update access to it, not just read.
    const { update } = await this.cms.documentPermissions(ORDERS, oid as ID, who.user, who.context)
    if (!update) throw new ForbiddenError()
    const transaction = await this.transactionOf(visible)
    const now = new Date().toISOString()
    const move = async (from: OrderStatus[], to: OrderStatus, extra: Data = {}) => {
      const moved = await this.cms.update(
        ORDERS,
        oid as ID,
        { status: to, ...extra },
        { where: { status: { in: from } }, context: who.context, user: who.user, depth: 0 },
      )
      if (!moved)
        throw invalid(ORDERS, 'status', `can’t be changed to ${to} from ${String(visible.status)}`)
      return moved as Data
    }
    switch (action) {
      case 'paid': {
        const order = await move(['pending'], 'paid', { paidAt: now })
        if (transaction) await this.setTransaction(transaction, { status: 'succeeded' })
        await this.shop.onOrder('paid', order as OrderDoc, this.cms)
        return order
      }
      case 'fulfilled': {
        const order = await move(['paid'], 'fulfilled')
        await this.shop.onOrder('fulfilled', order as OrderDoc, this.cms)
        return order
      }
      case 'cancelled': {
        const order = await move(['pending'], 'cancelled')
        await this.restock(order)
        if (transaction)
          await this.setTransaction(transaction, { status: 'failed', error: 'cancelled' })
        await this.shop.onOrder('cancelled', order as OrderDoc, this.cms)
        return order
      }
      case 'refunded': {
        const before = visible.status as OrderStatus
        const order = await move(['paid', 'fulfilled'], 'refunded')
        const adapter = transaction ? this.shop.methods.get(String(transaction.method)) : undefined
        try {
          if (transaction && adapter?.refund)
            await adapter.refund({ cms: this.cms, transaction: toPayment(transaction) })
        } catch (error) {
          // The money didn't go back: the order stays as it was.
          await this.cms.update(ORDERS, oid as ID, { status: before }, { depth: 0 })
          throw error
        }
        if (transaction) await this.setTransaction(transaction, { status: 'refunded' })
        await this.restock(order)
        await this.shop.onOrder('refunded', order as OrderDoc, this.cms)
        return order
      }
      default:
        throw new NotFoundError(ORDERS, `${String(id)}/${action}`)
    }
  }

  private async transactionOf(order: Data): Promise<Data | null> {
    const found = await this.cms.find(TRANSACTIONS, {
      where: { order: { equals: order.id } },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
    })
    return (found.docs[0] as Data | undefined) ?? null
  }

  /** Puts an order's items back in stock, unless they were short when it was made. */
  private async restock(order: Data) {
    if (order.stockShort === true) return
    for (const item of (order.items ?? []) as Data[])
      await this.take({ product: item.product, variant: item.variant }, Number(item.quantity))
  }

  /**
   * Upkeep: transactions left `processing` by a stopped process go back to `pending`, so the
   * next confirmation or webhook makes the order.
   */
  /** Cancels unpaid orders past their `expiresAt`, putting their stock back. */
  async expire(now: Date): Promise<number> {
    const due = await this.cms.find(ORDERS, {
      where: {
        and: [{ status: { equals: 'pending' } }, { expiresAt: { lt: now.toISOString() } }],
      },
      limit: 100,
      depth: 0,
    })
    let cancelled = 0
    for (const found of due.docs as Data[]) {
      // Only if still pending: paid in the meantime, it stays.
      const order = (await this.cms.update(
        ORDERS,
        found.id as ID,
        { status: 'cancelled' },
        { where: { status: { equals: 'pending' } }, depth: 0 },
      )) as Data | null
      if (!order) continue
      await this.restock(order)
      const transaction = await this.transactionOf(order)
      if (transaction)
        await this.setTransaction(transaction, { status: 'failed', error: 'expired' })
      await this.shop.onOrder('cancelled', order as OrderDoc, this.cms)
      cancelled++
    }
    return cancelled
  }

  async release(now: Date): Promise<number> {
    const stale = new Date(now.getTime() - 10 * 60_000).toISOString()
    const stuck = await this.cms.find(TRANSACTIONS, {
      where: {
        and: [
          { status: { equals: 'processing' } },
          { order: { exists: false } },
          { updatedAt: { lt: stale } },
        ],
      },
      limit: 100,
      depth: 0,
    })
    for (const tx of stuck.docs as Data[])
      await this.cms.update(
        TRANSACTIONS,
        tx.id as ID,
        { status: 'pending' },
        {
          where: { status: { equals: 'processing' } },
        },
      )
    return stuck.docs.length
  }
}
