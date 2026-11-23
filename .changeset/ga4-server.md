---
'@easy-cms/plugin-analytics': minor
'@easy-cms/plugin-ecommerce': minor
'@easy-cms/core': minor
'@easy-cms/admin': patch
---

GA4 purchases from the server (ADR-0073, phase two). Connect Google Analytics 4 in Settings → Integrations, in the new Analytics category (Measurement ID and API secret, with a Test button), and the server sends `purchase` when a shop's order is paid and `refund` when it is refunded, through GA4's Measurement Protocol: once per order, in the currency's main unit, retried by the `analytics:ga4` job.

- At checkout, the shop's client sends the Google Analytics client and session IDs from the `_ga` cookies, only with the customer's consent to analytics. They are kept on the order (`analytics`, read by staff only); without consent nothing is kept or sent.
- With GA4 connected, the page no longer pushes its own `purchase`, so it isn't counted twice.
- Schema: a new hidden `analytics-hits` collection (plugin-analytics) and an `analytics` field on orders (plugin-ecommerce). Create a migration with `easy-cms migrate:create` after upgrading.
