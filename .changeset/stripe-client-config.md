---
"@easy-cms/plugin-ecommerce": patch
---

`stripeAdapter({ clientConfig })` passes more settings to the Stripe client the adapter makes, e.g. `{ maxNetworkRetries: 2 }`, or the host and port of stripe-mock in tests.
