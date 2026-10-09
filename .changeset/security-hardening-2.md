---
'@easy-cms/core': minor
'@easy-cms/admin': minor
'@easy-cms/auth-oauth': minor
'@easy-cms/nuxt': minor
'easy-cms': minor
'@easy-cms/storage-s3': minor
'@easy-cms/plugin-multi-tenant': minor
---

Security changes that may need a step when you upgrade:

- **SVG is no longer included in `image/*`** (it can carry scripts). To keep allowing it, list it: `upload.mimeTypes: ['image/*', 'image/svg+xml']`. After a direct upload, the type the storage serves the file with must be the one checked (S3 reports it).
- **Users changing their own password or email send their current password** (`currentPassword`); the account page asks for it. Admins changing other users don't. Accounts without a password can't change their own email.
- **Single sign-on no longer signs existing staff in by email** until they link the provider from their account page, unless the provider has `linkByEmail: true` (for providers whose emails your organization controls). Site members are still matched by email. `microsoft()` no longer uses the user principal name as an email.
- **`trustProxy` takes the last `X-Forwarded-For` address** (the one your proxy added), not the first, which the client can write. On Vercel and Netlify the client IP is found without it; Nuxt uses the connection's address otherwise. A warning is logged in production when logins have no client IP.
- **In production, a `secret` that looks like an example or a repeated pattern is refused.** The Next.js starter no longer falls back to a fixed secret in production: without `EASY_CMS_SECRET` (and without a database URL) it uses a random one per process and says so.
- **Multi-tenant: the people of a tenant, its admins included, no longer change shared collections and globals** (those not listed in `collections`/`globals`). List the ones they may change in `editShared`. The deliveries page is for system admins only.
