# @easy-cms/plugin-analytics

## 1.56.0

### Patch Changes

- Updated dependencies [c4103eb]
  - @easy-cms/core@1.56.0

## 1.55.0

### Minor Changes

- 8f795b6: GA4 purchases from the server (ADR-0073, phase two). Connect Google Analytics 4 in Settings → Integrations, in the new Analytics category (Measurement ID and API secret, with a Test button), and the server sends `purchase` when a shop's order is paid and `refund` when it is refunded, through GA4's Measurement Protocol: once per order, in the currency's main unit, retried by the `analytics:ga4` job.
  
  - At checkout, the shop's client sends the Google Analytics client and session IDs from the `_ga` cookies, only with the customer's consent to analytics. They are kept on the order (`analytics`, read by staff only); without consent nothing is kept or sent.
  - With GA4 connected, the page no longer pushes its own `purchase`, so it isn't counted twice.
  - Schema: a new hidden `analytics-hits` collection (plugin-analytics) and an `analytics` field on orders (plugin-ecommerce). Create a migration with `easy-cms migrate:create` after upgrading.

### Patch Changes

- Updated dependencies [8f795b6]
  - @easy-cms/core@1.55.0

## 1.54.0

### Minor Changes

- 790e4f3: GA4 events in Tag Manager's `dataLayer` (ADR-0073), with no code on the site:
  
  - `generate_lead` (with `form_id`) when an `<easy-form>` is sent.
  - The shop's client pushes GA4 ecommerce events as the cart and checkout go: `add_to_cart` and `remove_from_cart` for every change to the cart, `begin_checkout`, and `purchase` once per order (the order number as `transaction_id`, also after a card payment's redirect), in the currency's main unit. `shop.viewItem(product)` sends `view_item`; `login` and `sign_up` are pushed too. `analytics: false` turns them off.
- 829084f: New experimental `@easy-cms/plugin-analytics`: Google Tag Manager on your pages, set up in Settings → Analytics & consent (ADR-0073).
  
  - One script, `<api>/analytics.js`: Consent Mode v2 defaults (everything denied until the visitor chooses), the consent banner, then Tag Manager. The Nuxt module adds it to every page when the plugin is installed; Next.js has `<EasyAnalytics />` from `@easy-cms/next/analytics`.
  - A consent banner in English and Thai: Accept all and Reject all side by side, Settings per category (analytics, marketing), remembered for 12 months, reopened from any `[data-easy-consent]` element. Turn it off to use your own consent tool with `gtag('consent', 'update', …)` or `easyConsent.set()`.
  - Consent records (random ID, choice, banner version, time; no IP address) as proof for PDPA and GDPR, deleted after the days you set.
  - Nothing loads in the admin's live preview or on `?preview=` pages.
  - `easyAnalytics.track(event, params)` pushes your own events to the `dataLayer`.

### Patch Changes

- @easy-cms/core@1.54.0
