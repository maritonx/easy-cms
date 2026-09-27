---
"@easy-cms/drizzle": patch
"@easy-cms/db-sqlite": patch
---

SQLite: writes made at the same time wait for each other instead of failing with "database is locked".
