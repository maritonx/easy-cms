---
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/admin": minor
"@easy-cms/cli": minor
---

`outbox: true` runs `afterChange` and `afterDelete` hooks, webhooks and `httpCache.purge` from an outbox written in the same transaction as the save. A worker runs them after the save commits and retries what fails. Failed entries show in Settings → Jobs → Outbox, where an admin can retry them. Hooks then run after the response, so they must be safe to run more than once. The default is unchanged. Needs a migration for the `outbox` table.
