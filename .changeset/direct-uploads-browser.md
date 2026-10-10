---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/nuxt": patch
"@easy-cms/storage-s3": minor
"@easy-cms/storage-vercel-blob": patch
---

Direct uploads of large files work from the admin in a real browser (#68). Tested with real Vercel Blob stores, public and private.

- The admin's Content-Security-Policy allowed requests to its own origin only, so the browser blocked sending files to the storage. Storage adapters now name where browsers send files (`uploadOrigins`: the bucket for S3, `https://vercel.com` for Blob), and the admin allows them in `connect-src` (`securityHeaders(connectSrc)`; `adminHandlerFor` and Nuxt fill it in from the config).
- Vercel Blob: the upload no longer sends `x-add-random-suffix`, which the Blob API's CORS doesn't allow from browsers (the client token already disables the suffix).
