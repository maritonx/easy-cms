import { getEasyCMS } from '@easy-cms/next'
import { CURRENCIES, formatPrice } from '@easy-cms/plugin-ecommerce'
import config from '@/easy-cms.config'

export const cms = () => getEasyCMS(config)

/** A price in baht for a page rendered on the server. */
export const baht = (amount: unknown) =>
  typeof amount === 'number' ? formatPrice(amount, CURRENCIES.THB as never, 'th-TH') : '—'

/** The first image's URL of a product. */
export function imageOf(product: Record<string, unknown>): string | null {
  const images = Array.isArray(product.images) ? product.images : []
  const first = images[0] as { url?: string } | undefined
  return typeof first?.url === 'string' ? first.url : null
}
