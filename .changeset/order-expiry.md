---
"@easy-cms/plugin-ecommerce": minor
---

Unpaid manual orders (bank transfer) are cancelled after 3 days and their stock put back, so unpaid orders don't hold stock (#100). `manualAdapter({ expiresIn })` sets the seconds, or `false` to wait for staff (e.g. cash on delivery). Orders get an `expiresAt` field: run `easy-cms migrate:create` in production. Orders made before the upgrade aren't affected.
