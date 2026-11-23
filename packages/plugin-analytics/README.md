# @easy-cms/plugin-analytics

Google Tag Manager for [Easy CMS](https://easycms.dev) sites, set up in the admin, with a consent
banner (Consent Mode v2, in English and Thai), consent records for PDPA and GDPR, and `dataLayer`
events. **Experimental.**

```bash
npm install @easy-cms/plugin-analytics
```

```ts
import { analyticsPlugin } from '@easy-cms/plugin-analytics'

export default defineConfig({
  // …
  plugins: [analyticsPlugin({ defaults: { gtm: process.env.GTM_ID } })],
})
```

Pages load one script, `<api>/analytics.js`: the Nuxt module adds it, Next.js has
`<EasyAnalytics />` from `@easy-cms/next/analytics`, and any other site adds a `<script>` tag.
Settings → Analytics & consent holds the container, the banner and the records.

Guide: [Analytics & consent](https://easycms.dev/docs/analytics)

MIT
