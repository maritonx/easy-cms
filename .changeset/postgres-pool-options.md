---
'@easy-cms/db-postgres': minor
---

Postgres connection options: `prepare`, `statementTimeoutMs`, `idleTimeoutMs`, `connectTimeoutMs` and `applicationName`. Connections are now named `easy-cms` in `pg_stat_activity` (or `PGAPPNAME`). Options left unset still come from the URL and the `PG*` environment variables. The Databases guide covers pool sizing, serverless and poolers such as PgBouncer.
