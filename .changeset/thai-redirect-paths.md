---
"@easy-cms/plugin-redirects": patch
---

Thai (non-ASCII) paths: `normalizePath` spells percent-escapes one way (`%e0%b8%82` and `ข` both become `%E0%B8%82`), so a redirect matches requests with lowercase escapes, as in WordPress links, and an import script finds the redirect it stored on the last run. `resolveRedirect` now returns addresses with Thai text percent-encoded, so the `Location` header is valid (Node.js threw `ERR_INVALID_CHAR`, a 500 in Nuxt's `sendRedirect`).
