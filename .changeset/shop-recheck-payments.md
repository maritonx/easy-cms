---
"@easy-cms/plugin-ecommerce": minor
---

The shop's scheduled jobs now check pending payments with their provider: a payment still pending a few minutes after checkout is confirmed with the adapter's `confirm`, and gets its order if the money is in, for when the page was closed and no webhook came (or a provider doesn't retry webhooks). `expiresIn` now applies to every payment adapter, not only manual ones: past it, a payment that didn't go through is marked `failed` ("expired"); if it is paid later, the order is still made. Without `expiresIn`, payments are checked for a day.
