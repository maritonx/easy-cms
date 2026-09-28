---
"easy-cms": minor
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/db-postgres": minor
"@easy-cms/db-sqlite": minor
---

`easy-cms copy --from <config>` copies every document, version, user and global from one database into another, for example from SQLite to Postgres (or back). Ids stay the same, so relationships, history and logins keep working. Both configs must have the same collections and fields, and the target must be empty. Also available as `copyDatabase(source.db, target.db)` from `@easy-cms/core`.
