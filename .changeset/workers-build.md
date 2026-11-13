---
"easy-cms": minor
"@easy-cms/admin": minor
---

`easy-cms build --target workers` writes what Wrangler needs to deploy the CMS, the standalone server's admin and REST API, as a Cloudflare Worker (ADR-0067):

- the Worker's entry and the admin app in `.easy-cms/workers/`
- `wrangler.jsonc` when the project has none: `nodejs_compat`, the `ASSETS` binding, Cron Triggers every minute for the jobs, and aliases for `sharp` and other packages that can't run there

The Worker is `createWorker(config)` from `easy-cms/workers`. A Worker has no disk, so the config needs `upload.storage` and a database over HTTP, such as Turso. The admin handler takes `readFile` to read the app from somewhere other than a directory.
