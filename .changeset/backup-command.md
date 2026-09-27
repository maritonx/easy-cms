---
"easy-cms": minor
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/db-sqlite": minor
---

`easy-cms backup <file>` copies a SQLite database to a new file while the CMS keeps running (a consistent snapshot through `VACUUM INTO`). Databases expose it as the optional `db.backup(file)`; for Postgres, use `pg_dump`.
