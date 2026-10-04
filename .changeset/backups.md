---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/drizzle": minor
"easy-cms": minor
---

Database backups from the admin.

- **Settings → Backups** (admins): **Back up now**, the list of backups with who made and last downloaded each, **Download** and **Delete**.
- **`backups: { every, at, keep, dir, storage, sqlite }`** in the config: back up every `day` or `week` at `at` (server time), keep the newest `keep` (7). Without `every`, back up by hand.
- Each backup is one compressed SQLite file (`<site>-YYYY-MM-DD-HHmm.db.gz`) of the whole database. SQLite copies itself; Postgres is copied into a SQLite file with `backups.sqlite` (`sqlite` from `@easy-cms/db-sqlite`).
- Stored privately: `backups/` by default (never the uploads folder, never served) or `backups.storage`, e.g. a private S3 bucket. Downloads go through the server, for admins only.
- Scheduled backups run with scheduled jobs (every minute on a server, or from the `jobs/run` cron); one at a time. The dashboard's "Needs attention" warns when the last scheduled backup failed or none finished in two periods.
- `easy-cms backup <file>` uses the same engine: it now backs up Postgres too, and compresses a `.gz` name.
- Adds the internal `database-backups` table: create a migration (`easy-cms migrate:create backups`).
