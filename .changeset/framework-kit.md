---
'@easy-cms/core': minor
'@easy-cms/admin': minor
'@easy-cms/next': patch
'@easy-cms/nuxt': patch
'easy-cms': patch
---

A kit for running Easy CMS inside any framework that handles Web `Request`s: `sharedEasyCMS(config)` (one instance per server, compared by structure, kept across hot reloads), `createApiHandler(config, { trustProxy })` (the REST API on it), `cms.auth.userFromHeaders(headers)`, and `adminHandlerFor(resolvedConfig)` in `@easy-cms/admin`. The Next.js and Nuxt packages and the standalone server now use it; Nuxt compares configs by structure like Next.js. New guide: Other frameworks.
