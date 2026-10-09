import type { Label } from '@easy-cms/core'
import type { PaymentAdapter } from './payments.js'
import { paymentFailed, paymentSucceeded } from './plugin.js'

/** The parts of the `stripe` package's client the adapter uses. */
export interface StripeClient {
  readonly paymentIntents: {
    create(
      params: Record<string, unknown>,
      options?: { idempotencyKey?: string },
    ): Promise<{ id: string; client_secret: string | null; status: string }>
    retrieve(id: string): Promise<{ id: string; status: string; amount: number; currency: string }>
  }
  readonly refunds: { create(params: Record<string, unknown>): Promise<unknown> }
  readonly webhooks: {
    constructEventAsync(
      body: string,
      signature: string,
      secret: string,
    ): Promise<{ type: string; data: { object: Record<string, unknown> } }>
  }
}

export interface StripeAdapterOptions {
  /** `sk_…`, from `process.env.STRIPE_SECRET_KEY`. */
  readonly secretKey: string
  /** `pk_…`: sent to the page for Stripe.js. */
  readonly publishableKey: string
  /**
   * `whsec_…` of the webhook endpoint `<api>/shop/payments/stripe/webhook` (events
   * `payment_intent.succeeded` and `payment_intent.payment_failed`): orders are then made even
   * when the customer closes the page before it confirms.
   */
  readonly webhookSecret?: string
  /** Default `Card or PromptPay` / `บัตร หรือ พร้อมเพย์`. */
  readonly label?: Label
  /** Extra `PaymentIntent` parameters, e.g. `{ payment_method_types: ['card', 'promptpay'] }`. */
  readonly paymentIntent?: Record<string, unknown>
  /** A Stripe client of your own (or a stand-in in tests). Default: `new Stripe(secretKey)`. */
  readonly client?: StripeClient
}

/**
 * Card, PromptPay and the other methods of Stripe's Payment Element: a `PaymentIntent` per
 * checkout, confirmed on the page with Stripe.js, checked with Stripe before the order is made.
 * Needs the `stripe` package.
 */
export function stripeAdapter(options: StripeAdapterOptions): PaymentAdapter {
  let client: Promise<StripeClient> | undefined
  const stripe = () => {
    if (options.client) return Promise.resolve(options.client)
    // A name in a variable: the `stripe` package is optional, installed by those who use it.
    const name = 'stripe'
    client ??= (
      import(name) as Promise<{
        default: new (key: string, config?: Record<string, unknown>) => StripeClient
      }>
    ).then(
      (mod) =>
        new mod.default(options.secretKey, {
          appInfo: { name: 'Easy CMS ecommerce', url: 'https://github.com/maritonx/easy-cms' },
        }),
    )
    return client
  }
  const intentOf = (data: Readonly<Record<string, unknown>>) => {
    const id = data.paymentIntent
    if (typeof id !== 'string') throw new Error('This payment has no Stripe payment intent')
    return id
  }

  return {
    name: 'stripe',
    label: options.label ?? { en: 'Card or PromptPay', th: 'บัตร หรือ พร้อมเพย์' },
    async initiate({ transaction }) {
      const intent = await (await stripe()).paymentIntents.create(
        {
          amount: transaction.amount,
          currency: transaction.currency.toLowerCase(),
          receipt_email: transaction.email,
          automatic_payment_methods: { enabled: true },
          metadata: { transaction: String(transaction.id) },
          ...options.paymentIntent,
        },
        // A retried checkout never makes a second intent for the same transaction.
        { idempotencyKey: `easy-cms-transaction-${transaction.id}` },
      )
      return {
        data: { paymentIntent: intent.id },
        reference: intent.id,
        client: { clientSecret: intent.client_secret, publishableKey: options.publishableKey },
      }
    },
    async confirm({ transaction }) {
      const intent = await (await stripe()).paymentIntents.retrieve(intentOf(transaction.data))
      // The amount Stripe took must be the order's.
      if (
        intent.amount !== transaction.amount ||
        intent.currency !== transaction.currency.toLowerCase()
      )
        return 'failed'
      if (intent.status === 'succeeded') return 'succeeded'
      if (intent.status === 'processing' || intent.status === 'requires_capture')
        return 'processing'
      return intent.status === 'canceled' || intent.status === 'requires_payment_method'
        ? 'failed'
        : 'processing'
    },
    async refund({ transaction }) {
      await (await stripe()).refunds.create({ payment_intent: intentOf(transaction.data) })
    },
    endpoints: options.webhookSecret
      ? [
          {
            path: '/webhook',
            method: 'post',
            handler: async (req) => {
              const signature = req.request.headers.get('stripe-signature') ?? ''
              const body = await req.request.text()
              let event: Awaited<ReturnType<StripeClient['webhooks']['constructEventAsync']>>
              try {
                event = await (await stripe()).webhooks.constructEventAsync(
                  body,
                  signature,
                  options.webhookSecret as string,
                )
              } catch {
                return new Response('Invalid signature', { status: 400 })
              }
              const intent = event.data.object
              const id = typeof intent.id === 'string' ? intent.id : ''
              if (event.type === 'payment_intent.succeeded' && id) await paymentSucceeded(id)
              if (event.type === 'payment_intent.payment_failed' && id) {
                const error = (intent.last_payment_error as { message?: string } | undefined)
                  ?.message
                await paymentFailed(id, error ?? 'payment failed')
              }
              return { received: true }
            },
          },
        ]
      : [],
  }
}
