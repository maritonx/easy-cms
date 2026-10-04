---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/nuxt": minor
"@easy-cms/email-smtp": minor
"@easy-cms/plugin-seo": minor
"@easy-cms/plugin-redirects": minor
"@easy-cms/plugin-nested-docs": minor
"@easy-cms/plugin-form-builder": minor
"@easy-cms/plugin-mcp": minor
---

The dashboard tells admins what needs attention, and what the system is.

- **Needs attention** (admins only, shown only when something is wrong): webhook deliveries that failed in the last 7 days, emails waiting over an hour or failed, scheduled publishing over 10 minutes late (nothing calls `jobs/run`), no `email`, and no `serverURL` in production. Each links to the new Health checks guide.
- **System** (admins only): the Easy CMS version, database, file storage, email adapter, plugins with their versions, and field types.
- Both come from the new `GET <api>/admin/status`, for admins only. Easy CMS doesn't check for new versions.
- **`definePlugin(plugin, { name, version })`** names a plugin for the dashboard; the official plugins name themselves. `EmailAdapter` gets an optional `name` (`smtp`, `console`). Core exports `VERSION`.
- In development, the admin's HTML is read on each request, so a rebuilt admin shows up without a restart.
