---
'@easy-cms/core': patch
'@easy-cms/plugin-form-builder': patch
---

Cloudflare Turnstile says what is wrong instead of only "Verification failed":

- `formBuilderPlugin` and `auth.members.signUp` refuse a `turnstile.secretKey` that is the site key or has spaces around it, at start.
- When Cloudflare refuses the secret key, or can't be reached, the server logs it once.
- `<easy-form>` keeps Send off until Turnstile has answered, and again after each try and when the token expires, so it no longer sends an empty, used or expired token.

`auth.members.signUp` is checked again at start (its role, `verifyEmail` and `turnstile`): since 0.60 these checks read the old `signup` name.
