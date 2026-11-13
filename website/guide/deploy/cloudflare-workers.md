# Deploy on Cloudflare Workers

::: info What you'll build
The standalone server (admin and REST API) as a Cloudflare Worker: content in Turso, uploads in
R2, the admin app from Workers Assets, and Cron Triggers for scheduled jobs.

**Before this page:** [Choosing a host](./), [Standalone server](../standalone).
:::

A Worker has no disk and no process that keeps running. So the database is reached over HTTP
(Turso), uploads go to a bucket (R2), and Cloudflare calls the Worker every minute for scheduled
jobs. `easy-cms build --target workers` writes the Worker; Wrangler deploys it.

This is the [standalone server](../standalone) only: Easy CMS inside a Next.js or Nuxt app still
needs Node.js.

## What you need

- A standalone project: `npm create easy-cms my-cms` in a new directory.
- **Workers Paid.** Checking a password at sign-in takes about 100 ms of CPU, more than the Free
  plan's 10 ms per request.
- A [Turso](https://turso.tech) database, and an R2 bucket with an API token (R2 → Manage API
  tokens → *Object Read & Write* for the bucket).

## 1. The database: Turso

In `easy-cms.config.ts`, add the token:

```ts
db: sqlite({
  url: process.env.DATABASE_URL ?? 'file:./cms.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
}),
```

`DATABASE_URL` is the database's `libsql://` URL. On your machine, without it, you keep a SQLite
file.

## 2. Uploads: R2

```bash [pm]
npm install @easy-cms/storage-s3
```

```ts
import { s3Storage } from '@easy-cms/storage-s3'

upload: {
  storage: s3Storage({
    bucket: 'my-site-media',
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }),
},
```

The Worker reads the variables when it starts. The admin sends files larger than 4 MB straight to
the bucket: give it CORS for the site's origin, see [Large files](../uploads#large-files).

## 3. Build the Worker

```bash [pm]
npm install -D wrangler
npx easy-cms build --target workers
```

It writes:

- `.easy-cms/workers/`: the Worker's entry and the admin app, written again on every build. Add
  `.easy-cms/` to `.gitignore`.
- `wrangler.jsonc`, the first time: `nodejs_compat`, the `ASSETS` binding for the admin app, Cron
  Triggers every minute, `NODE_ENV=production`, and aliases for packages that can't run on
  Workers (`sharp`). Check its `name`; after that the file is yours, and builds leave it alone.

Build again after changing `easy-cms.config.ts` or updating Easy CMS: the Worker bundles the
config.

## 4. Migrations

Create the migrations against a fresh database and commit them, as on any host
([Migrations & deployment](../deployment)):

```bash [pm]
npx easy-cms migrate:create init
```

Then apply them to Turso from your machine or CI, before each deploy:

```bash
DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npx easy-cms migrate
```

The Worker can't read the migration files. It starts when the database's last migration matches
its config, and answers 500 with "The config changed since the database's last migration"
otherwise.

## 5. Secrets

```bash
npx wrangler secret put EASY_CMS_SECRET
```

| Name | Value |
|---|---|
| `EASY_CMS_SECRET` | `openssl rand -hex 32` |
| `EASY_CMS_SETUP_CODE` | A phrase you choose, until the first admin exists |
| `DATABASE_URL` | Turso's `libsql://` URL |
| `DATABASE_AUTH_TOKEN` | A Turso token |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | From the R2 API token |

## 6. Deploy

```bash
npx wrangler deploy
```

Open `/admin` on the Worker's address, create the first admin with the setup code, upload an image
(it lands in R2) and publish a post. Then set `serverURL` to the address.

## Scheduled jobs

The Cron Trigger in `wrangler.jsonc` runs the [jobs](../jobs) every minute: scheduled posts,
webhook retries and queued emails. No `CRON_SECRET` is needed.

## Try it on your machine

```bash
npx wrangler dev
```

runs the Worker in workerd, Cloudflare's runtime, with the variables from `.env`. Add
`--test-scheduled` and open `/__scheduled` to run the jobs.

## What is different on Workers

- **Images aren't resized**: `sharp` needs Node.js, so `upload.imageSizes` makes no copies.
  Images still get their width and height.
- **Email**: SMTP needs Node.js. Use Resend, Postmark or Brevo from
  [`@easy-cms/plugin-email`](../email#providers), which send over HTTP.
- **Visitors' IP addresses** come from `CF-Connecting-IP`, with nothing to set.
- Each request may reach another copy of the Worker, as with
  [several instances](./production): sessions, sign-in limits and jobs are kept in the database.

## What CI checks

Every pull request creates a project with `npm create easy-cms`, adds `@easy-cms/storage-s3` and
Wrangler, migrates, builds the Worker and runs it with `wrangler dev`, on `sqld` (what Turso runs)
and an S3 server. Then it signs in, uploads an image, creates, changes, reads and deletes a post,
loads the admin and runs the Cron Trigger. Deploying to Cloudflare itself isn't part of it.

## If something doesn't work

- **The build says the config needs `upload.storage`**: a Worker has no disk. Set it as in step 2.
- **500 with "The config changed since the database's last migration"** or "No migrations
  found": run `easy-cms migrate` against the Turso database, then deploy again.
- **Signing in fails with error 1102 (Worker exceeded resource limits)**: the account is on the
  Free plan. Signing in needs Workers Paid.

## Next steps

- [Reference architecture](./production): what several copies of the CMS share.
- [Security](../security): the checklist before going live.
