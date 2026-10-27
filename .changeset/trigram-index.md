---
'@easy-cms/core': minor
'@easy-cms/drizzle': minor
'@easy-cms/db-postgres': minor
---

`index: 'trigram'` on text, textarea and email fields: a GIN `pg_trgm` index that `like` uses on Postgres, so searching any part of a text is fast, in Thai as in English (at 100k posts, p95 25 ms instead of reading every row). Localized fields get one per locale. The first migration with one creates the `pg_trgm` extension; PGlite loads it. A warning at start says when the database's `LC_CTYPE` is `C`, where Thai letters can't be indexed. On SQLite the option does nothing.
