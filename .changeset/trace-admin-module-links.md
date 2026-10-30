---
"@easy-cms/next": patch
---

Admin components from plugins, such as the SEO plugin's length meters and search preview, work on Vercel with pnpm again. `withEasyCMS()` traced an admin module only at its real path in `.pnpm`, so the server couldn't find it by its package name and the admin said `<ecms-seo-meter>` was missing; it now also traces the package's folder in `node_modules` and its package.json.
