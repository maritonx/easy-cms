// Shared by the server and pages: no server code here.

type ID = string | number

/** A currency prices are given in. Amounts are whole numbers of its smallest unit (satang, cents). */
export interface Currency {
  /** ISO 4217, e.g. `THB`. */
  readonly code: string
  /** e.g. `฿`. */
  readonly symbol: string
  readonly label: string
  /** Digits after the point: 2 for THB (1 baht = 100 satang), 0 for JPY. */
  readonly decimals: number
}

/** Currencies to choose from by code; others are given in full. */
export const CURRENCIES: Readonly<Record<string, Currency>> = {
  THB: { code: 'THB', symbol: '฿', label: 'Thai baht', decimals: 2 },
  USD: { code: 'USD', symbol: '$', label: 'US dollar', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', label: 'Euro', decimals: 2 },
  GBP: { code: 'GBP', symbol: '£', label: 'Pound sterling', decimals: 2 },
  JPY: { code: 'JPY', symbol: '¥', label: 'Japanese yen', decimals: 0 },
}

/** The field holding a product's or variant's price in a currency, e.g. `priceInTHB`. */
export const priceField = (code: string) => `priceIn${code.toUpperCase()}`

/**
 * An amount in a currency's smallest unit, for people: `formatPrice(123450, THB)` →
 * `฿1,234.50`. `locale` picks the digits and separators (default `en`).
 */
export function formatPrice(amount: number, currency: Currency, locale = 'en'): string {
  const value = amount / 10 ** currency.decimals
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    }).format(value)
  } catch {
    // A currency Intl doesn't know.
    return `${currency.symbol}${value.toFixed(currency.decimals)}`
  }
}

/** Where an order is in its life. */
export const ORDER_STATUSES = ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'] as const
/**
 * - `pending`: waiting for payment (bank transfer).
 * - `paid`: paid, to be sent.
 * - `fulfilled`: sent or handed over.
 * - `cancelled`: called off before payment.
 * - `refunded`: the money went back.
 */
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Where a payment is. */
export const TRANSACTION_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

/** An addition to or deduction from a cart's total (a negative amount), e.g. shipping or a discount. */
export interface Adjustment {
  readonly label: string
  readonly amount: number
}

/** A line of a cart, as pages see it. */
export interface CartLine {
  /** The line's id, for changing or removing it. */
  readonly id: string
  readonly product: {
    readonly id: ID
    readonly title: string
    readonly slug: string | null
    /** The first image's URL. */
    readonly image: string | null
  }
  readonly variant: { readonly id: ID; readonly title: string } | null
  readonly quantity: number
  /** Price of one, in the cart's currency; `null` when it has no price there. */
  readonly unitPrice: number | null
  readonly total: number
  /** Whether it can be bought as it is: priced, in stock, still for sale. */
  readonly available: boolean
  /** How many are left, when stock is kept; `null` otherwise. */
  readonly stock: number | null
}

/** A cart, as pages see it. */
export interface CartView {
  readonly id: ID
  readonly currency: string
  readonly lines: readonly CartLine[]
  /** How many items, counting quantities. */
  readonly count: number
  readonly subtotal: number
  /** From the shop's `totals` (shipping, tax, discounts), without an address yet. */
  readonly adjustments: readonly Adjustment[]
  readonly total: number
}

/** What `GET <api>/shop/config` tells pages. */
export interface ShopSettings {
  readonly currencies: readonly Currency[]
  readonly defaultCurrency: string
  readonly paymentMethods: readonly { readonly name: string; readonly label: string }[]
  readonly guests: boolean
  readonly countries: readonly string[]
}

/** A postal address, as stored on addresses and orders. */
export interface Address {
  readonly name?: string | null
  readonly phone?: string | null
  readonly line1?: string | null
  readonly line2?: string | null
  /** Sub-district (แขวง / ตำบล). */
  readonly subdistrict?: string | null
  /** District (เขต / อำเภอ). */
  readonly district?: string | null
  readonly province?: string | null
  readonly postalCode?: string | null
  /** ISO 3166-1 alpha-2, e.g. `TH`. */
  readonly country?: string | null
  readonly [field: string]: unknown
}

/** What starting a checkout returns to the page. */
export interface CheckoutResult {
  readonly transaction: ID
  /** What the payment method needs on the page, e.g. Stripe's client secret. */
  readonly payment: Readonly<Record<string, unknown>>
  /** Set when the order exists already, e.g. paid later by bank transfer. */
  readonly order: {
    readonly id: ID
    readonly orderNumber: string
    readonly status: OrderStatus
  } | null
}

/** What confirming a payment returns. */
export interface ConfirmResult {
  readonly status: TransactionStatus
  readonly order: {
    readonly id: ID
    readonly orderNumber: string
    readonly status: OrderStatus
  } | null
}
