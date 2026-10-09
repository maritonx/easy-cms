import type { EasyCMS, Endpoint, ID, Label } from '@easy-cms/core'
import type { TransactionStatus } from './shared.js'

/** A payment as an adapter sees it. */
export interface PaymentTransaction {
  readonly id: ID
  /** In the currency's smallest unit. */
  readonly amount: number
  /** ISO 4217, e.g. `THB`. */
  readonly currency: string
  /** Who pays: the customer's email (guests give theirs). */
  readonly email: string
  readonly status: TransactionStatus
  /** What the adapter stored: `data` from `initiate`. */
  readonly data: Readonly<Record<string, unknown>>
}

/** What `initiate` returns. */
export interface InitiateResult {
  /** Kept on the transaction for later calls. */
  readonly data?: Record<string, unknown>
  /**
   * The provider's id of the payment, e.g. Stripe's payment intent: webhooks find the
   * transaction by it (`paymentSucceeded(reference)`).
   */
  readonly reference?: string
  /** Sent to the page, e.g. Stripe's client secret or bank account details. */
  readonly client?: Record<string, unknown>
}

/**
 * A way to pay, e.g. Stripe (`stripeAdapter` from `@easy-cms/plugin-ecommerce/stripe`) or a bank
 * transfer (`manualAdapter`). The shop creates a transaction, the adapter starts the payment, and
 * once the adapter says it succeeded the shop creates the order, exactly once.
 */
export interface PaymentAdapter {
  /** Lowercase letters, digits and `-`, e.g. `stripe`. */
  readonly name: string
  /** What customers see, e.g. `Card or PromptPay`. */
  readonly label: Label
  /**
   * Paid later, out of band (a bank transfer, cash on delivery): the order is made at checkout
   * as `pending`, and an admin marks it paid.
   */
  readonly manual?: boolean
  /** For `manual` ones: what to tell the customer, e.g. the bank account (page and email). */
  readonly instructions?: Label
  /** Starts the payment of a new transaction. */
  readonly initiate: (args: {
    readonly cms: EasyCMS
    readonly transaction: PaymentTransaction
  }) => Promise<InitiateResult> | InitiateResult
  /**
   * Asks the provider whether the payment went through, after the page says it did. Never trust
   * the page: check with the provider. Not needed for `manual` adapters.
   */
  readonly confirm?: (args: {
    readonly cms: EasyCMS
    readonly transaction: PaymentTransaction
    /** What the page sent, e.g. `{ paymentIntent }`. */
    readonly input: Readonly<Record<string, unknown>>
  }) => Promise<'succeeded' | 'processing' | 'failed'>
  /** Gives the money back. Without it, refunds are marked only (the money goes back by hand). */
  readonly refund?: (args: {
    readonly cms: EasyCMS
    readonly transaction: PaymentTransaction
  }) => Promise<void>
  /**
   * Extra endpoints, e.g. the provider's webhook. Served under `<api>/shop/payments/<name>/`;
   * `path` is relative to that, e.g. `/webhook`.
   */
  readonly endpoints?: readonly Endpoint[]
}

/** Declares a payment adapter; returns it unchanged. */
export const definePaymentAdapter = (adapter: PaymentAdapter): PaymentAdapter => adapter

export interface ManualAdapterOptions {
  /** Default `bank-transfer`. */
  readonly name?: string
  /** Default `Bank transfer` / `โอนเงิน`. */
  readonly label?: Label
  /**
   * What to tell the customer, e.g. the bank account: on the page after checkout and in the
   * order email.
   */
  readonly instructions?: Label
}

/**
 * Payment by bank transfer, cash on delivery or any other way outside the site: the order is
 * made at checkout as `pending`, and an admin marks it paid (the order's "Payment received").
 */
export function manualAdapter(options: ManualAdapterOptions = {}): PaymentAdapter {
  return {
    name: options.name ?? 'bank-transfer',
    label: options.label ?? { en: 'Bank transfer', th: 'โอนเงิน' },
    manual: true,
    ...(options.instructions ? { instructions: options.instructions } : {}),
    initiate: () => ({}),
  }
}
