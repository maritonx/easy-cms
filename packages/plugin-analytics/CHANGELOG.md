# @easy-cms/plugin-analytics

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
