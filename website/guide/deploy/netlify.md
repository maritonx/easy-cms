# Deploy on Netlify

::: info What you'll build
A Next.js or Nuxt site with Easy CMS on Netlify: content in Postgres, uploads in Netlify Blobs,
migrations on every deploy and a scheduled function for scheduled publishing.

**Before this page:** [Choosing a host](./), [Next.js](../next) or [Nuxt](../nuxt).
:::

Netlify builds Next.js (through its OpenNext adapter) and Nuxt without extra setup, and runs the
server code as functions: no disk survives and no process keeps running. To start from a
ready-made site instead, use the [one-click deploy](../one-click-deploy).

## 1. A database

- **Netlify Database** (Postgres): install `@netlify/database` and Netlify creates the database at
  the first deploy and sets `NETLIFY_DB_URL`. It needs a credit-based Netlify plan.
- **Any hosted Postgres** (Neon, Supabase…): set `DATABASE_URL`.

```bash [pm]
npm install @easy-cms/db-postgres @electric-sql/pglite
```

```ts
import { postgres } from '@easy-cms/db-postgres'

const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL

// Netlify: the hosted database. Your laptop: PGlite in a local folder.
db: url ? postgres({ url, max: 2 }) : postgres({ pglite: '.pglite' }),
```

Turso works too, with `@easy-cms/db-sqlite`: see [Vercel](./vercel).

## 2. Uploads in Netlify Blobs

Netlify Blobs needs no setup: the store is created on first use.

```bash [pm]
npm install @easy-cms/storage-netlify-blobs
```

```ts
import { netlifyBlobsStorage } from '@easy-cms/storage-netlify-blobs'

// On Netlify, Blobs; on your laptop, the uploads folder.
upload: process.env.NETLIFY ? { storage: netlifyBlobsStorage() } : {},
```

Files are served through the CMS API. Netlify limits function requests to 6 MB (about 4.5 MB for
binary files), so larger uploads need [S3 storage](../uploads#s3-cloudflare-r2-and-minio), which
takes them straight from the browser.

## 3. Migrations on every deploy

Create the migrations locally against a fresh database (PGlite, or no `DATABASE_URL`) and commit
them:

```bash [pm]
npx easy-cms migrate:create init
git add easy-cms/migrations
```

Then migrate in the build command:

```toml [netlify.toml]
[build]
  command = "npx easy-cms migrate && npm run build"
```

## 4. Environment variables

In **Site configuration → Environment variables**:

| Name | Value |
|---|---|
| `EASY_CMS_SECRET` | `openssl rand -hex 32` |
| `EASY_CMS_SETUP_CODE` | A phrase you choose, until the first admin exists |
| `DATABASE_URL` | Your Postgres URL (not needed with Netlify Database) |
| `CRON_SECRET` | Another random value, for the scheduled function below |

Change a variable, then trigger a new deploy: running deploys keep the old values.

## 5. Scheduled jobs

A scheduled function calls the jobs endpoint every five minutes. Scheduled functions are on every
plan, run for at most 30 seconds, and only on published deploys (not previews).

```bash [pm]
npm install -D @netlify/functions
```

```ts [netlify/functions/easy-cms-jobs.mts]
import type { Config } from '@netlify/functions'

// Runs Easy CMS's due jobs: scheduled publishing, webhook retries, queued emails, backups.
export default async () => {
  const res = await fetch(`${process.env.URL}/api/cms/jobs/run`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  if (!res.ok) console.error(`Easy CMS jobs: ${res.status} ${await res.text()}`)
}

export const config: Config = { schedule: '*/5 * * * *' }
```

`URL` is the site's main address, which Netlify sets for functions.

## 6. Visitors' IP addresses

Netlify sets `X-Forwarded-For`; trust it so login limits apply per visitor:

::: code-group

```ts [Next.js: app/api/cms/[[...path]]/route.ts]
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config, {
  trustProxy: true,
})
```

```ts [Nuxt: nuxt.config.ts]
easyCms: { trustProxy: true },
```

:::

## Check it

Deploy, open `/admin`, create the first admin with the setup code, upload an image and publish a
post. Then set `serverURL` to the site's address.

## If something doesn't work

- **The site fails with "No database"**: neither `DATABASE_URL` nor `NETLIFY_DB_URL` is set. Netlify
  Database needs `@netlify/database` installed and a credit-based plan; otherwise set
  `DATABASE_URL`.
- **"CSRF check failed: untrusted origin" when creating the first admin**: update to Easy CMS
  0.37.2 or later, which accepts the public host Netlify's proxy forwards.
- **Scheduled posts don't go live**: check the function's log under **Logs → Functions**, and that
  `CRON_SECRET` is the same in the function's environment.

## Next steps

- [One-click deploy](../one-click-deploy): the same setup, made for you.
- [Backups](../backups): copy the database somewhere else regularly.
