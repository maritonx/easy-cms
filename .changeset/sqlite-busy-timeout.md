---
"@easy-cms/drizzle": patch
"@easy-cms/db-sqlite": patch
---

SQLite: writes from separate processes to the same file now wait for each other reliably (libSQL busy timeout, `busyTimeout` option, default 10 s) instead of sometimes failing with "database is locked"; instances in one process share a write queue per file.
