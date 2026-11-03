---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"easy-cms": minor
---

Settings → Integrations (#311): plugins declare outside providers in `integrations` (`kind: 'fields'` to paste values, or `'oauth'` with a Connect button and a choice of accounts), and admins connect accounts to them, several per provider, test them, choose the default, turn a provider off, and disconnect. Secrets are encrypted at rest (AES-256-GCM, a key derived from `secret`), shown as `••••1234`, read again after a secret rotation, and `easy-cms secrets:rotate` encrypts them all with the new secret; an environment variable named in `env` wins. Plugins read connections with `cms.integrations.get()` and report with `markUsed` / `markError`; broken ones show in the dashboard's "needs attention". The page also shows what the code configures (email, storage, search, sign-in, payments) and official plugins to install. Admins and roles given Integrations see it; changes are audit-logged. Projects with integrations get a new internal `connections` table: run `easy-cms migrate:create`.
