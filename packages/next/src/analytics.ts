import { createElement } from 'react'

export interface EasyAnalyticsProps {
  /** Where the Easy CMS API is mounted. Default `/api/cms`. */
  readonly api?: string
}

/**
 * The script of `@easy-cms/plugin-analytics` (ADR-0073): Google Tag Manager, the consent banner
 * and `dataLayer` events, from the settings in the admin. Put it once in the root layout:
 *
 * ```tsx
 * import { EasyAnalytics } from '@easy-cms/next/analytics'
 *
 * export default function RootLayout({ children }) {
 *   return <html lang="en"><body>{children}<EasyAnalytics /></body></html>
 * }
 * ```
 */
export function EasyAnalytics({ api = '/api/cms' }: EasyAnalyticsProps = {}) {
  return createElement('script', { src: `${api.replace(/\/+$/, '')}/analytics.js`, async: true })
}
