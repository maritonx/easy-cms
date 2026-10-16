import type { StripeClient } from './stripe.js'

/**
 * The Stripe API version the adapter asks for and is tested with, whichever `stripe` package
 * (17 to 23) is installed, so a new major of the package doesn't change answers under a shop.
 */
export const STRIPE_API_VERSION = '2026-09-30.endive'

/** The constructor of the `stripe` package. */
export type StripeConstructor = new (key: string, config?: Record<string, unknown>) => StripeClient

/** The client the adapter makes; `config` adds to its settings (tests). */
export function createStripeClient(
  Stripe: StripeConstructor,
  options: { readonly secretKey: string; readonly apiVersion?: string },
  config: Record<string, unknown> = {},
): StripeClient {
  return new Stripe(options.secretKey, {
    apiVersion: options.apiVersion ?? STRIPE_API_VERSION,
    appInfo: { name: 'Easy CMS ecommerce', url: 'https://github.com/maritonx/easy-cms' },
    ...config,
  })
}
