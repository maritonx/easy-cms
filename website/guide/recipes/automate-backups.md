# Automate backups

::: info What you'll build
Daily backups of the database and the uploads, old ones cleaned up, and a restore drill so you
know they work. **Uses:** [backups](../backups), [CLI](../cli#backup).
:::

## SQLite on a server

A script that copies the database while the site runs, and the uploads next to it:

```bash [scripts/backup.sh]
#!/bin/sh
set -e
cd /srv/my-site                          # the project root
day=$(date +%F)
mkdir -p backups
npx easy-cms backup "backups/cms-$day.db"            # consistent copy, CMS keeps running
tar -czf "backups/uploads-$day.tar.gz" uploads       # the files
find backups -type f -mtime +14 -delete              # keep two weeks
```

Run it every night with cron (`crontab -e`):

```
30 2 * * * /srv/my-site/scripts/backup.sh >> /var/log/cms-backup.log 2>&1
```

Then copy `backups/` off the server: a backup on the same disk doesn't survive the disk. For
example to an S3 bucket with `aws s3 sync backups s3://my-backups/cms`, or with `rclone`.

## Postgres

Managed Postgres (Neon, Supabase, RDS…) usually keeps point-in-time backups: turn that on first.
For your own copies:

```bash
pg_dump --format=custom --file="backups/cms-$(date +%F).dump" "$DATABASE_URL"
```

## Uploads in a bucket

Turn on **versioning** for the bucket (S3, R2 and MinIO support it), so deleted or replaced files
can be brought back, and a lifecycle rule that removes old versions after a while.

## Restore drill

Once a month, prove the backups work:

1. Copy last night's backup to a scratch location (never over production).
2. Start the site against it, e.g. `DATABASE_URL=file:./restore-test.db npm run dev` (when your
   config reads `DATABASE_URL`, as the examples do).
3. Open the admin, a few recent documents and their images.

The steps to restore for real, and what to do about migrations afterwards, are in
[Backups & upgrades](../backups#after-a-restore).
