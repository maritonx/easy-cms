# Deploy on Vercel

::: info What you'll build
A Next.js or Nuxt site with Easy CMS on Vercel: content in a hosted database, uploads in Vercel
Blob, migrations on every deploy and a cron for scheduled publishing.

**Before this page:** [Choosing a host](./), [Next.js](../next) or [Nuxt](../nuxt).
:::

Vercel runs your app as serverless functions: no disk survives between requests and no process
keeps running. So the database and uploads live elsewhere, and a cron runs scheduled jobs. To
start from a ready-made site instead, use the [one-click deploy](../one-click-deploy).

## 1. A database

Pick one and connect it in **Storage** (or copy its URL into the environment variables):

- **Postgres** (Neon from Vercel's Storage tab, Supabase, or any hosted Postgres): sets
  `DATABASE_URL`.
- **Turso** (hosted SQLite): a `libsql://` URL and a token.

::: code-group

```ts [Postgres]
import { postgres } from '@easy-cms/db-postgres'

// Vercel: the hosted database. Your laptop: PGlite, Postgres in a local folder, so development
// and migrations use the same SQL as production.
db: process.env.DATABASE_URL
  ? postgres({ url: process.env.DATABASE_URL, max: 2 }) // a small pool per function instance
  : postgres({ pglite: '.pglite' }),
```

```ts [Turso]
import { sqlite } from '@easy-cms/db-sqlite'

// Vercel: Turso. Your laptop: a SQLite file.
db: sqlite({
  url: process.env.DATABASE_URL ?? 'file:./cms.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
}),
```

:::

```bash [pm]
npm install @easy-cms/db-postgres @electric-sql/pglite
```

Use the database's direct connection string: poolers in transaction mode may not support the
prepared statements the Postgres driver uses. With Turso, `npm install @easy-cms/db-sqlite`.

## 2. Uploads in Vercel Blob

In **Storage**, create a **Blob** store (public) and connect it to the project: it sets
`BLOB_READ_WRITE_TOKEN`.

```bash [pm]
npm install @easy-cms/storage-vercel-blob
```

```ts
import { vercelBlobStorage } from '@easy-cms/storage-vercel-blob'

// On Vercel, Blob; on your laptop, the uploads folder.
upload: process.env.VERCEL ? { storage: vercelBlobStorage() } : {},
```

Vercel limits request bodies to 4.5 MB; with Blob, the admin sends larger files from the browser
straight to the store. Cloudflare R2 or any S3 storage works too:
[S3, Cloudflare R2 and MinIO](../uploads#s3-cloudflare-r2-and-minio).

## 3. Migrations on every deploy

Create the migrations locally and commit them. Your development database was set up by
development push, which can't take migrations, so create them against a fresh one (PGlite, or no
`DATABASE_URL`):

```bash [pm]
npx easy-cms migrate:create init
git add easy-cms/migrations
```

Then migrate before each build, so the database is ready before the new version serves requests:

```json [vercel.json]
{ "buildCommand": "npx easy-cms migrate && npm run build" }
```

Or put it in the `build` script: `"build": "easy-cms migrate && next build"`.

## 4. Environment variables

In **Settings → Environment Variables**, for Production (and Preview if you use it):

| Name | Value |
|---|---|
| `EASY_CMS_SECRET` | `openssl rand -hex 32` |
| `EASY_CMS_SETUP_CODE` | A phrase you choose, until the first admin exists |
| `DATABASE_URL` | Set by the Storage integration, or the database's URL |
| `DATABASE_AUTH_TOKEN` | Turso only |
| `BLOB_READ_WRITE_TOKEN` | Set by the Blob store |
| `CRON_SECRET` | Another random value, for the cron below |

New variables reach new deployments only: redeploy after changing them.

## 5. Scheduled jobs

Nothing keeps running on Vercel, so a cron calls the jobs endpoint. Vercel sends
`Authorization: Bearer $CRON_SECRET`, which Easy CMS checks.

```json [vercel.json]
{
  "crons": [{ "path": "/api/cms/jobs/run", "schedule": "*/5 * * * *" }]
}
```

::: warning Hobby plan: once a day
On the Hobby plan, cron jobs run at most once a day, and a more frequent schedule fails the
deploy. Pro runs them every minute. On Hobby, use `"0 3 * * *"` and call the endpoint more often
from elsewhere, for example a scheduled GitHub Actions workflow:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-site.com/api/cms/jobs/run
```

:::

Without a cron, posts scheduled for later don't go live, failed webhooks aren't retried and
queued emails wait. The dashboard warns when scheduled publishing is late.

## 6. Visitors' IP addresses

Vercel sets `X-Forwarded-For`; trust it so login limits apply per visitor:

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

## 7. Put the functions near the database

Every page reads the database. Run the functions in the database's region (Settings → Functions,
or in `vercel.json`), for example Tokyo for a database in `ap-northeast-1`:

```json [vercel.json]
{ "regions": ["hnd1"] }
```

## Check it

Deploy, open `/admin`, create the first admin with the setup code, upload an image (it lands in
the Blob store) and publish a post. Then set `serverURL` to the site's address.

## If something doesn't work

- **The build stops at `easy-cms migrate` with HTTP 401** (Turso): the token is wrong, read-only
  or missing in this environment. Create a full-access token and redeploy.
- **Uploads fail, saying to connect a Blob store**: the deployment has no `BLOB_READ_WRITE_TOKEN`.
  Connect the store to the project, then redeploy.
- **`/admin` answers 500 with "Cannot find module '@easy-cms/next/package.json'"**: update
  `@easy-cms/next` to 0.22.2 or later.
- **413 when uploading**: the file is over 4.5 MB and goes through the function. Use Blob or S3
  storage, which take large files straight from the browser.

## Next steps

- [One-click deploy](../one-click-deploy): the same setup, made for you.
- [Backups](../backups): copy the database somewhere else regularly.
