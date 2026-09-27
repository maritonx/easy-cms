---
"@easy-cms/core": minor
---

Webhooks: `webhooks: [{ url, events?, collections?, globals?, secret? }]` POSTs signed JSON (`x-easy-cms-signature`) on create, update, delete, publish, unpublish and draft saves, with retries, without slowing saves; `cms.flushWebhooks()` for serverless.
