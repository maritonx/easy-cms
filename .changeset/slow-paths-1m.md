---
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/db-postgres": minor
"@easy-cms/admin": minor
---

Faster at 1,000,000 documents (#257):

- **Relationship filters count from the index.** In collections with drafts, fields with an automatic index (relationships, uploads, `index: true`) are indexed together with `status`, which public reads filter on, so totals read only the index (at 1M posts, a filter by author: about 1 s → 3 ms). The indexes change: run `easy-cms migrate:create` after upgrading.
- **`like` needs three characters on a field with `index: 'trigram'`** on Postgres: shorter searches can't use the index and read every row, so they are refused with a `400`. The admin's list and relationship searches wait for the third character, and the command palette still finds documents by id. SQLite is unchanged.
- **`writeConnections` on `postgres()`:** connections kept for creates, updates and deletes, with every read they make, on top of `max`, so saves don't wait behind slow reads. Off by default.
- The Blocks guide shows how to query inside blocks on large collections: copy what you filter by to an indexed field with a hook.
