# Backups & upgrades

::: info What you'll learn
What to back up, how to restore, and how to upgrade Easy CMS safely.

**Before this page:** [Migrations & deployment](./deployment).
:::

Easy CMS keeps everything in two places: the **database** (documents, users, versions, scheduled
jobs, queued webhooks and the migrations table) and the **uploads** (local `upload.dir` or your
S3 bucket). Back up both. It doesn't back them up for you.

## What to back up

| What | Where | How often |
|---|---|---|
| Database | SQLite file or Postgres database | Daily, and before every deploy that runs migrations |
| Uploads | `uploads/` (or `upload.dir`), or the S3 bucket | Daily; turn on bucket versioning for S3 |
| `EASY_CMS_SECRET` | Your host's secret settings | Once, kept in a password manager |
| `easy-cms/migrations` | Git | Already there when you commit them |

Losing `EASY_CMS_SECRET` loses no content: it signs sessions and preview links, not passwords.
Setting a new one signs everyone out and invalidates preview links.

## SQLite

The database runs in WAL mode, so copying `cms.db` while the server runs can give a broken copy.
Use `easy-cms backup` instead: it reads your config and writes a consistent copy while the CMS
keeps running.

```bash [pm]
npx easy-cms backup backups/cms-$(date +%F).db
```

The `sqlite3` command does the same: `sqlite3 cms.db ".backup 'backups/cms.db'"`.

**Restore:** stop the server, replace `cms.db` with the backup and delete `cms.db-wal` and
`cms.db-shm` if they exist, then start the server.

## Postgres

```bash
pg_dump --format=custom --file=cms-$(date +%F).dump "$DATABASE_URL"
```

If the database is shared with other apps, limit the dump to Easy CMS's tables with their prefix
(`tablePrefix`, default `ecms_`): `pg_dump -t 'ecms_*' …`. Managed Postgres (Neon, Supabase, RDS…)
usually has point-in-time recovery; turn it on as well.

**Restore:** stop the server, then

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" cms-2026-10-01.dump
```

## After a restore

The backup includes the migrations table, so the database is at the schema of the day it was
taken. Start the version of your app that matches it, or deploy the current one and run
`easy-cms migrate` to apply the migrations made since. A production server refuses to start when
they don't match, so a mismatch shows up at once rather than as broken data.

**Test a restore** now and then: restore into a scratch database, start the app against it and
open the admin. A backup that has never been restored is a guess.

## Upgrading Easy CMS

All `@easy-cms/*` packages, `easy-cms` and `create-easy-cms` share one version number: upgrade
them together.

1. Read the changelog of the versions in between
   (`packages/core/CHANGELOG.md` on GitHub, or `npm view @easy-cms/core --json`).
2. Upgrade every package to the same version:
   ```bash [pm]
   npm install @easy-cms/core@latest @easy-cms/nuxt@latest @easy-cms/db-sqlite@latest easy-cms@latest
   ```
3. Run `npx easy-cms migrate:create upgrade`. A release sometimes adds internal tables
   (0.7 added `webhook-deliveries`); if it does, you get a migration to review and commit, and
   without it production refuses to start.
4. Try it against a copy of production data (a restored backup) before deploying.
5. Deploy as usual: back up, `easy-cms migrate`, start the new version.

**Rolling back:** migrations only go forward. To go back to the previous version, restore the
backup taken before the deploy and deploy the previous version of your app.

## Versions and support {#versioning}

Easy CMS follows [semantic versioning](https://semver.org), with the usual pre-1.0 rule:

- **Before 1.0 (now):** a minor release (0.8 → 0.9) may change APIs, config or REST responses;
  the changelog says what and how to update. Patch releases (0.9.0 → 0.9.1) only fix bugs.
- **From 1.0:** breaking changes only in major releases, announced in the changelog with an
  upgrade guide. Deprecated APIs keep working, with a warning, until the next major.
- **Security fixes** go to the latest minor release (and, from 1.0, to the previous major for six
  months). See the [security policy](https://github.com/maritonx/easy-cms/blob/main/SECURITY.md).

## Next steps

- [CLI](./cli): the backup command.
- [Security](./security): keep backups safe too.
