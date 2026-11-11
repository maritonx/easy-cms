---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/auth-oauth": minor
"easy-cms": minor
"@easy-cms/plugin-backups": patch
---

Sign-in providers turned on in the admin (ADR-0066). `signInPlugin()` from `@easy-cms/auth-oauth` adds Google, Microsoft, GitHub and OpenID Connect to Settings → Integrations → Sign-in: an admin enters the app's keys, copies the redirect URL, tests a sign-in at the provider (nobody is signed in by it), then uses it for sign-in. The config's `auth.providers` stay the default; an admin can turn them off, and a connection with the same id takes a provider's place. `auth.locked: true` keeps sign-in as the code sets it. A change after which no admin could sign in is refused, and `easy-cms reset-sign-in` goes back to the config's providers. Turning a provider off signs out the people who used it: sessions record how they started (`password` or a provider's id). Integrations with the same `app.shared` keep one set of app keys, so Google Drive backups and signing in with Google use one Google Cloud app. `cms.signIn` lists the providers signing people in now.

Needs a migration: a `method` column on `sessions` (see Upgrading → 1.43).
