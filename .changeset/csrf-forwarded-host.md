---
'@easy-cms/core': patch
---

The CSRF check also accepts an Origin matching the request's public host (`x-forwarded-host` or `host`), so admin writes work behind proxies whose request URL names an internal host, like Netlify's (the first-admin setup said "CSRF check failed: untrusted origin").
