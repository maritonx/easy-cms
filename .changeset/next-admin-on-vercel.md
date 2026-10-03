---
"@easy-cms/next": patch
---

The admin works on Vercel. `createAdminRouteHandlers()` looked for the admin app through `@easy-cms/next/package.json`, which Vercel doesn't deploy, so `/admin` answered 500 with "Cannot find module '@easy-cms/next/package.json'". It now uses the path `@easy-cms/admin` reports for itself, which the build traces, and falls back to the old lookup when that package was bundled.
