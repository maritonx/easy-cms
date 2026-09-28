# Deploy on Vercel with Postgres and R2

::: info What you'll build
A Next.js site with Easy CMS on Vercel: content in a hosted Postgres, uploads in Cloudflare R2,
and a cron job for scheduled publishing. **Uses:** [Next.js](../next),
[databases](../databases), [uploads](../uploads), [migrations](../deployment).
:::

Serverless functions have no disk that survives, so SQLite and local uploads don't work there.
Use Postgres and S3-compatible storage instead.

## 1. Postgres

Create a database on any hosted Postgres (Neon, Supabase, Vercel's marketplace…) and copy its
connection string.

```bash
npm install @easy-cms/db-postgres
```

```ts [easy-cms.config.ts]
import { postgres } from '@easy-cms/db-postgres'

export default defineConfig({
  // …
  // Vercel: the hosted database. Your laptop: PGlite, Postgres in a local folder, so development
  // and migrations use the same SQL as production.
  db: process.env.DATABASE_URL
    ? postgres({ url: process.env.DATABASE_URL, max: 2 }) // small pool per function instance
    : postgres({ pglite: '.pglite' }),
})
```

For PGlite in development: `npm install @electric-sql/pglite` (`create-easy-cms --db postgres` adds it for you).

::: tip Connection poolers
Use the database's direct connection string. Poolers in transaction mode may not support the
prepared statements the driver uses; if you switch to one, test it first.
:::

## 2. Cloudflare R2 for uploads

Create a bucket and an API token (Object Read & Write) in Cloudflare, then:

```bash
npm install @easy-cms/storage-s3
```

```ts
import { s3Storage } from '@easy-cms/storage-s3'

upload: {
  storage: s3Storage({
    bucket: process.env.R2_BUCKET as string,
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }),
},
```

Files are served through the CMS API unless you give the bucket a public URL (`publicUrl`); see
[S3, Cloudflare R2 and MinIO](../uploads#s3-cloudflare-r2-and-minio).

## 3. Migrations on every deploy

Create the migrations locally (with PGlite, no `DATABASE_URL`) and commit them:

```bash
npx easy-cms migrate:create init
git add easy-cms/migrations
```

Then run them before each build, in `package.json`:

```json
{ "scripts": { "build": "easy-cms migrate && next build" } }
```

Vercel runs `npm run build` on every deploy, so the database is migrated before the new version
serves requests.

## 4. Environment variables

In **Project Settings → Environment Variables**:

| Name | Value |
|---|---|
| `EASY_CMS_SECRET` | A new random value: `openssl rand -hex 32` |
| `DATABASE_URL` | The Postgres connection string |
| `R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | From Cloudflare |
| `CRON_SECRET` | Another random value, for the cron job below |

## 5. A cron for scheduled posts and webhook retries

No process stays running on Vercel, so let Vercel Cron call the jobs endpoint. Vercel sends
`Authorization: Bearer $CRON_SECRET`, which Easy CMS checks.

```json [vercel.json]
{
  "crons": [{ "path": "/api/cms/jobs/run", "schedule": "*/5 * * * *" }]
}
```

Scheduled posts then go live within five minutes of their time. Check your Vercel plan for how
often crons may run.

## 6. Client IPs for login limits

Vercel sets `X-Forwarded-For`; trust it in the API route:

```ts [app/api/cms/[[...path]]/route.ts]
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config, {
  trustProxy: true,
})
```

## Check it

Deploy, open `https://your-site.vercel.app/admin`, create the first admin, upload an image
(it lands in the bucket) and publish a post.
