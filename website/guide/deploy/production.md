# Reference architecture

::: info What you'll learn
The setup Easy CMS is tested and supported in when one server isn't enough: several instances
on Postgres and S3-compatible storage. What each part needs, what the instances share, and what
is not supported.

**Before this page:** [Choosing a host](./), [Migrations & deployment](../deployment).
:::

One server with SQLite and files on its disk is enough for most sites, and stays supported. When
you need more than one instance, for traffic, for zero-downtime deploys or because the platform
runs several, use this setup. CI runs it on every change.

```txt
                 visitors, editors
                        │
              CDN (public pages, media)
                        │
                  load balancer            no sticky sessions
            ┌───────────┼───────────┐
        instance    instance    instance   stateless: Next.js, Nuxt or easy-cms serve
            └───────────┼───────────┘
            ┌───────────┴───────────┐
   PgBouncer (optional)       S3-compatible storage
            │                  (S3, R2, MinIO, RustFS)
        Postgres
```

## The parts

| Part | Needs | Details |
|---|---|---|
| **Postgres** | One database for every instance. CI tests Postgres 17; other versions the Postgres project still supports should work but aren't tested | [Databases](../databases#postgres) |
| **Pooler** (optional) | PgBouncer in transaction mode, or your host's pooler. PgBouncer 1.24 or newer keeps prepared statements; with others set `prepare: false` | [Connections](../databases#connections) |
| **Storage** | S3 or an S3-compatible service for uploads, shared by every instance. Vercel Blob and Netlify Blobs on those platforms | [Uploads](../uploads#s3-cloudflare-r2-and-minio) |
| **Instances** | Any number, identical: the same config, version and `EASY_CMS_SECRET`. No sticky sessions. `trustProxy` behind the load balancer | [Health checks](../deployment#health-checks) |
| **Load balancer** | Routes to instances whose `<api>/readyz` answers `200`, and passes `X-Forwarded-For` (and `X-Request-Id`, if it makes one) | [Logs](../deployment#logs) |
| **CDN** | Caches public pages and media in front of your site. The API answers `no-store` for now: cache in your frontend and revalidate from [webhooks](../webhooks) | [Performance](../databases#performance) |

Pool sizes add up: instances × `max` connections should stay under 10–20% of Postgres's
`max_connections`. With many instances or serverless functions, put the pooler in front.

## What the instances share

Everything that matters lives in the database or the storage, so any instance can answer any
request:

- sessions and their CSRF tokens, sign-in rate limits, API keys
- the queues of scheduled publishing, jobs, webhooks and emails, and the audit log
- form submissions and their rate limits (form builder plugin)
- uploads, in the storage

Two things are kept in each instance's memory:

- **Roles** (Settings → Roles) for up to 30 seconds: a change made on one instance reaches the
  others within that time.
- **Test emails** from Settings → Email are limited per instance.

## Background work

Every instance runs the scheduler every minute, and a cron calling `<api>/jobs/run` can run it
too. Each scheduled publish, job run, webhook and email is claimed in the database first, so it
runs once however many instances try; work of an instance that dies goes back to the queue when
its claim expires. Write your own jobs so that running one again does no harm.

Migrate once per release, before the new instances start: a release step, a CI job or an init
container running `easy-cms migrate`. In production an instance refuses to start while a
migration is pending, and `/readyz` keeps the load balancer away until it is applied. With the
[official image](./docker#the-official-image), start the instances with
`EASY_CMS_MIGRATE=false`.

## Single instance only

These keep their data on one machine, so run exactly one instance with them:

- **SQLite** (a local file): one writer, on one disk. A Turso database is shared, but this setup
  is tested on Postgres.
- **PGlite**: for development and tests.
- **Uploads on local disk** (`upload.dir`): other instances can't see the files.

To move a site from SQLite to Postgres, see [`easy-cms copy`](../cli). For uploads already on
disk, copy the folder into the bucket.

## Not supported

- More than one region, and read replicas
- Databases other than Postgres and SQLite
- Sharing a connection pool, or a transaction, with your app
  ([Database isolation](../database-isolation))
- Edge runtimes (Cloudflare Workers, Vercel Edge Functions)

## What CI checks

| Check | Job |
|---|---|
| Two `easy-cms serve` instances on one Postgres and one bucket, behind a round-robin proxy: REST, sessions and CSRF, sign-in limits, uploads, jobs once | `multi-instance` |
| The integration suites through PgBouncer in transaction mode, as a role with a schema of its own | `pgbouncer` |
| The integration suites on Postgres 17 | `postgres` |
| The official Docker image, built and started | `docker` |

## Next steps

- [Database isolation](../database-isolation): a schema, database or server of the CMS's own.
- [Docker](./docker): the official image.
- [Backups](../backups): back up the database and the bucket.
