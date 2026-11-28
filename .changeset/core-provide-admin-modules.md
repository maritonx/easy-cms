---
'@easy-cms/core': patch
---

`provideAdminModules({ [specifier]: code })` in `@easy-cms/core/internal` gives admin modules (`admin.modules`) as code rather than files, for where there are none to read: Studio (ADR-0074) uses it so the SEO panel, the tenant Members page and the color field show in its admin, instead of each being logged as not found.
