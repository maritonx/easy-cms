---
"@easy-cms/plugin-ecommerce": patch
---

The Stripe adapter asks for a fixed Stripe API version, `STRIPE_API_VERSION` (`2026-09-30.endive`), instead of the default of whichever `stripe` package is installed, so upgrading the package no longer changes Stripe's answers under a shop. `stripeAdapter({ apiVersion })` picks another. The `stripe` peer range is now 17 to 23, the majors that are tested; create the webhook endpoint in Stripe with the same API version. With `stripe` 17 to 22 installed, a shop now talks to this newer API version; the fields the adapter uses are the same in both.
