# One-click deploy

::: info What you'll learn
How to get a site with its admin running on Vercel or Netlify in a few clicks, and what to do
next.

**Before this page:** nothing. To add Easy CMS to your own app instead, see
[Getting started](./getting-started).
:::

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaritonx%2Feasy-cms%2Ftree%2Fmain%2Ftemplates%2Fnext-starter&project-name=easy-cms&repository-name=easy-cms&env=EASY_CMS_SETUP_CODE&envDescription=A+code+you+choose%3A+you+type+it+to+create+the+first+admin+at+%2Fadmin&envLink=https%3A%2F%2Fmaritonx.github.io%2Feasy-cms%2Fguide%2Fone-click-deploy&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22public%22%7D%5D)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/maritonx/easy-cms&create_from_path=templates/next-starter)

Either button copies the [starter](https://github.com/maritonx/easy-cms/tree/main/templates/next-starter)
to a new repository of yours and deploys it: a Next.js blog with its admin (posts, categories,
media, SEO, [roles](./roles) and an [audit log](./audit-log)), with sample posts.

## What you get

| | Vercel | Netlify |
|---|---|---|
| Database | Neon Postgres, created by the button | Netlify Database (Postgres), created at the first deploy |
| Uploads | Vercel Blob, created by the button | Netlify Blobs, created on first use |
| You type | a setup code | a setup code |

The only thing to fill in is the **setup code** (`EASY_CMS_SETUP_CODE`): any phrase you choose.
On a fresh site, whoever opens `/admin` first could otherwise make themselves admin; with the code,
only you can.

## After deploying

1. Open `/admin` on the new site.
2. Create the first admin: your name, email, a password, and the setup code.
3. Edit or delete the sample posts, and write your own. Invite your team from **Settings → Users**.

## If something doesn't work

**Uploads fail, saying to connect a Blob store (Vercel).** The deploy has no `BLOB_READ_WRITE_TOKEN`:
the Blob store wasn't added in the deploy form, or it was connected after the deploy started.

1. In the project on Vercel, open **Storage**. If there is no Blob store, **Create** one: **Blob**,
   with **Public** access.
2. On the store, **Connect Project**, choose this project and every environment.
3. **Settings → Environment Variables** now lists `BLOB_READ_WRITE_TOKEN`. Don't copy it anywhere
   else: anyone with it can change your files.
4. **Deployments** → **⋯** → **Redeploy**. New environment variables only reach new deployments.

**The site fails with "No database".** The platform gave no database URL. On Netlify, Netlify
Database is created at the first deploy because the starter installs `@netlify/database`; it needs
a credit-based plan, and **Data & Storage → Database** shows it. Older sites made from the starter
used Netlify DB (beta), which can no longer be created: update `package.json` and
`easy-cms.config.ts` from the [starter](https://github.com/maritonx/easy-cms/tree/main/templates/next-starter),
or set `DATABASE_URL` to any Postgres, then redeploy.

**`/admin` doesn't ask for a setup code.** `EASY_CMS_SETUP_CODE` isn't set: add it in the project's
environment variables and redeploy before anyone creates the first admin.

## For real use

- **Set `EASY_CMS_SECRET`** in the project's environment variables (`openssl rand -hex 32`), then
  redeploy. Until then the starter makes one from the database URL, so a one-click deploy works at
  once; it is as secret as the database password, and changes if that does.
- **Change the content model** in `easy-cms.config.ts` in your new repository, create a migration
  (`npx easy-cms migrate:create <name>`), and push: each deploy runs `easy-cms migrate` first.
- **Email** for invitations and forgotten passwords: see [Email](./email).
- **Your domain:** set it in the platform, and `serverURL` in the config.

## How it works

The build runs `easy-cms migrate`, adds the sample posts while the database has none, then
`next build`. The config picks the database from `DATABASE_URL` (Vercel) or `NETLIFY_DB_URL`
(Netlify Database, which Netlify creates because the starter installs `@netlify/database`; it
needs a credit-based Netlify plan), and uploads from `BLOB_READ_WRITE_TOKEN`
([`@easy-cms/storage-vercel-blob`](./uploads#vercel-blob)) or Netlify
([`@easy-cms/storage-netlify-blobs`](./uploads#netlify-blobs)); without them, it uses PGlite and the
`uploads` folder, for developing.

Other databases work too: Supabase or any Postgres through `DATABASE_URL`, or Turso with
`@easy-cms/db-sqlite`. See [Databases](./databases).

## Next steps

- [Deploy](./deploy/): set up Vercel, Netlify, Docker or a VPS yourself.
- [Migrations & deployment](./deployment): migrations and environment variables.
- [Tutorial](./tutorial): build a site with Easy CMS step by step.
