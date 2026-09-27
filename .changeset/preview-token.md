---
"@easy-cms/core": minor
---

Preview tokens: the admin adds `easy-cms-preview=<token>` to live preview URLs. The token opens one document's current draft (or one global) for an hour without a login, via `GET /:collection/:id?preview=<token>`, so frontends on another origin can preview drafts that were never published. `cms.createPreviewToken` / `cms.verifyPreviewToken` on the server, `getPreviewToken()` in `@easy-cms/core/live-preview`.
