// GA4 ecommerce events in Tag Manager's `dataLayer` (ADR-0073): the shop client pushes them as
// the cart changes and orders are placed, so tags need no code on the site. Nothing happens
// without a `dataLayer` (no Tag Manager on the page) or outside a browser.
import type { CartLine, CartView } from './shared.js'

type ID = string | number

/**
 * Prices in the shop are in the currency's smallest unit (satang); GA4 wants the main one (baht).
 * The client gives the digits after the point for a currency code.
 */
export type Decimals = (currency: string | undefined) => number
const major = (amount: number, digits: number) => Math.round(amount) / 10 ** digits

/** One product in an event, as GA4 names its fields. */
export interface AnalyticsItem {
  readonly item_id: string
  readonly item_name: string
  readonly item_variant?: string
  readonly price?: number
  readonly quantity: number
}

type Layer = { push: (entry: unknown) => void }

const layer = (): Layer | null => {
  if (typeof window === 'undefined') return null
  const found = (window as unknown as { dataLayer?: Layer }).dataLayer
  return found && typeof found.push === 'function' ? found : null
}

/** Pushes `event` with its `ecommerce` data, clearing the previous one first as GA4 asks. */
export function pushEcommerce(event: string, ecommerce: Record<string, unknown>) {
  const dataLayer = layer()
  if (!dataLayer) return
  dataLayer.push({ ecommerce: null })
  dataLayer.push({ event, ecommerce })
}

/** Pushes an event without ecommerce data, e.g. `login`. */
export function pushEvent(event: string, params: Record<string, unknown> = {}) {
  layer()?.push({ event, ...params })
}

export const itemOf = (
  line: CartLine,
  digits: number,
  quantity = line.quantity,
): AnalyticsItem => ({
  item_id: String(line.product.id),
  item_name: line.product.title,
  ...(line.variant ? { item_variant: line.variant.title } : {}),
  ...(line.unitPrice !== null ? { price: major(line.unitPrice, digits) } : {}),
  quantity,
})

const totalOf = (items: readonly AnalyticsItem[], digits: number) =>
  major(
    items.reduce((sum, item) => sum + (item.price ?? 0) * 10 ** digits * item.quantity, 0),
    digits,
  )

/**
 * `add_to_cart` and `remove_from_cart` for what changed between two carts: each line's quantity
 * up or down, lines new or gone. One rule for add, update, increment, decrement, remove and clear.
 */
export function cartChanged(before: CartView | null, after: CartView | null, decimals: Decimals) {
  const old = new Map((before?.lines ?? []).map((line) => [line.id, line]))
  const now = new Map((after?.lines ?? []).map((line) => [line.id, line]))
  const currency = after?.currency ?? before?.currency
  const digits = decimals(currency)
  const added: AnalyticsItem[] = []
  const removed: AnalyticsItem[] = []
  for (const [id, line] of now) {
    const was = old.get(id)?.quantity ?? 0
    if (line.quantity > was) added.push(itemOf(line, digits, line.quantity - was))
  }
  for (const [id, line] of old) {
    const is = now.get(id)?.quantity ?? 0
    if (is < line.quantity) removed.push(itemOf(line, digits, line.quantity - is))
  }
  if (added.length > 0)
    pushEcommerce('add_to_cart', { currency, value: totalOf(added, digits), items: added })
  if (removed.length > 0)
    pushEcommerce('remove_from_cart', { currency, value: totalOf(removed, digits), items: removed })
}

/** `begin_checkout` for the cart being paid for. */
export function checkoutStarted(cart: CartView | null, decimals: Decimals) {
  if (!cart || cart.lines.length === 0) return
  pushEcommerce('begin_checkout', cartData(cart, decimals))
}

const cartData = (cart: CartView, decimals: Decimals) => {
  const digits = decimals(cart.currency)
  return {
    currency: cart.currency,
    value: major(cart.total, digits),
    items: cart.lines.map((line) => itemOf(line, digits)),
  }
}

const PURCHASED = 'easy-cms-purchased'
const CHECKOUT = 'easy-cms-checkout'

const session = () => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/**
 * Keeps the cart being paid for, by transaction: Stripe may send the visitor to their bank and
 * back, and the page that confirms the payment has no cart any more.
 */
export function rememberCheckout(transaction: ID, cart: CartView | null) {
  if (!cart) return
  try {
    session()?.setItem(CHECKOUT, JSON.stringify({ transaction: String(transaction), cart }))
  } catch {
    // Private mode: the purchase is reported without its items after a redirect.
  }
}

/** `purchase`, once per order, with the items of the cart that was paid for. */
export function purchased(
  order: { id: ID; orderNumber: string },
  transaction: ID,
  decimals: Decimals,
) {
  const store = session()
  let done: string[] = []
  let kept: { transaction: string; cart: CartView } | null = null
  try {
    done = JSON.parse(store?.getItem(PURCHASED) ?? '[]') as string[]
    kept = JSON.parse(store?.getItem(CHECKOUT) ?? 'null')
  } catch {
    // Unreadable: report it anyway.
  }
  if (done.includes(String(order.id))) return
  const cart = kept && kept.transaction === String(transaction) ? kept.cart : null
  pushEcommerce('purchase', {
    transaction_id: order.orderNumber,
    ...(cart ? cartData(cart, decimals) : {}),
  })
  try {
    store?.setItem(PURCHASED, JSON.stringify([...done, String(order.id)].slice(-20)))
    store?.removeItem(CHECKOUT)
  } catch {
    // Private mode: a reload may report it again.
  }
}
