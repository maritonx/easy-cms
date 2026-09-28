---
"@easy-cms/next": patch
---

`withEasyCMS()` includes admin modules (such as the SEO plugin's `admin.js`) in the server build's file tracing, so their admin components also load on Vercel and with `output: 'standalone'`.
