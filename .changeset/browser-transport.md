---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/nuxt": minor
"@easy-cms/plugin-seo": minor
"easy-cms": minor
---

Browser and transport (#99):

- Over HTTPS (and in production) the session, CSRF and SSO cookies are named `__Host-…`; the old names are still read, so nobody is signed out. Logging out clears both and sends `Clear-Site-Data: "cache"`, and the admin forgets drafts and recent documents it kept in the browser.
- The REST API and the admin send HSTS (`max-age=31536000`) in production.
- Uploaded text files are stored and served with `charset=utf-8`.
- The CSRF origin check uses `X-Forwarded-Host` only with trust-proxy (`trustProxy`, `--trust-proxy`) or on Vercel and Netlify; `createRestHandler` takes `trustProxy`.
- The SEO plugin's sitemap and robots.txt build their own addresses from `serverURL`, not the request's host.
- The admin's switcher cookie is `Secure` over HTTPS.
