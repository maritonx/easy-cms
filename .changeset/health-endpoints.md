---
'@easy-cms/core': minor
'easy-cms': minor
---

Health checks in every setup: `<api>/healthz` answers `ok` while the process runs, and `<api>/readyz` answers `200` when the CMS started, its database answers and no migration is pending, `503` naming the failed check otherwise. Next.js and Nuxt get them through the API route, and they answer even when the CMS can't start. The standalone server also answers `/readyz` at the root. `healthz` and `readyz` are now reserved collection slugs and endpoint paths.
