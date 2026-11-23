---
'@easy-cms/plugin-analytics': minor
'@easy-cms/nuxt': minor
'@easy-cms/next': minor
---

New experimental `@easy-cms/plugin-analytics`: Google Tag Manager on your pages, set up in Settings → Analytics & consent (ADR-0073).

- One script, `<api>/analytics.js`: Consent Mode v2 defaults (everything denied until the visitor chooses), the consent banner, then Tag Manager. The Nuxt module adds it to every page when the plugin is installed; Next.js has `<EasyAnalytics />` from `@easy-cms/next/analytics`.
- A consent banner in English and Thai: Accept all and Reject all side by side, Settings per category (analytics, marketing), remembered for 12 months, reopened from any `[data-easy-consent]` element. Turn it off to use your own consent tool with `gtag('consent', 'update', …)` or `easyConsent.set()`.
- Consent records (random ID, choice, banner version, time; no IP address) as proof for PDPA and GDPR, deleted after the days you set.
- Nothing loads in the admin's live preview or on `?preview=` pages.
- `easyAnalytics.track(event, params)` pushes your own events to the `dataLayer`.
