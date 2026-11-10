---
"@easy-cms/core": patch
"@easy-cms/next": patch
"@easy-cms/nuxt": patch
---

Backups work on serverless hosts (Vercel, Netlify): a backup goes on after the admin's request has its answer, and was cut off when the function stopped (on Turso: "Failed query: select … from ecms_login_attempts"). The API handler now asks the host to keep the function running for work after the response, with Next.js's `after`, Nitro's `waitUntil`, or Vercel's and Netlify's own (`ApiHandlerOptions.waitUntil` to pass one), and a backup that never started is made by the next jobs run after two minutes instead of thirty. `cms.settle()` waits for such work, emails being sent included.
