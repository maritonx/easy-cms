---
"@easy-cms/drizzle": minor
"@easy-cms/db-postgres": minor
---

Faster reads on large collections: collections with drafts get an index on `status` (list counts were scanning the whole table; 8× faster at 100,000 documents), and on Postgres, `equals`/`in` inside blocks use JSON containment (about 6× faster). The index changes the schema: run `easy-cms migrate:create` after upgrading.
