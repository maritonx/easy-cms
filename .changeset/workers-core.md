---
"@easy-cms/core": patch
"@easy-cms/drizzle": patch
---

Steps toward Cloudflare Workers (ADR-0067):

- In production, a database whose last migration matches the config starts even without the migration files on disk. Workers have no disk, and some container images leave the files out. A config that changed since that migration is still refused.
- `jiti`, used to read `easy-cms.config.ts`, is loaded only when a config file is read. Loading it at startup stopped a Worker.
- On Cloudflare Workers the client's IP comes from `CF-Connecting-IP`, for rate limits and the audit log.
