---
"@easy-cms/next": patch
"@easy-cms/core": patch
---

Next.js: one CMS instance per server again. Next.js loads the config into each server layer (route handlers, Server Components), so `getEasyCMS()` saw a "new" config whenever a request switched layers, closed the database and opened it again. Requests still running then failed or hung, most visibly with PGlite. Instances are now matched by the config's structure (`configSignature()` in core). In `next dev`, editing only a hook's code needs a restart.
