# Choosing a host

::: info What you'll learn
Which kind of host fits your site, what every host needs from you, and a checklist before going
live.

**Before this page:** [Migrations & deployment](../deployment).
:::

Easy CMS runs wherever Node.js 22.12 or newer runs a server. It needs two things a host may or
may not give you: a place for the **database** and a place for **uploaded files**. Edge runtimes
(Cloudflare Workers, Vercel Edge Functions) are not supported.

## Which host

| | Database | Uploads | Scheduled jobs | Good for |
|---|---|---|---|---|
| [Vercel](./vercel) | Hosted Postgres (Neon) or Turso | Vercel Blob or S3 | A cron calling `jobs/run` | Next.js sites, preview deployments |
| [Netlify](./netlify) | Netlify Database or hosted Postgres | Netlify Blobs or S3 | A scheduled function calling `jobs/run` | Next.js sites on Netlify |
| [Docker](./docker) | Postgres in a container, or SQLite on a volume | A volume, or S3 | Run by the server every minute | Any server or platform that runs containers |
| [VPS](./vps) | SQLite on the disk, or Postgres | The disk | Run by the server every minute | One server you control, the lowest cost |
| [Other hosts](./other-hosts) | Depends on the host | Depends on the host | Depends on the host | Railway, Render, Fly.io, Coolify… |

Two kinds of host behave differently:

- **Serverless** (Vercel, Netlify): no disk that survives and no process that keeps running. Use a
  hosted database and file storage, and call the jobs endpoint from a cron.
- **Long-running** (Docker, a VPS, most platforms): one server that keeps running. SQLite and
  uploads can stay on a persistent disk, and the server runs
  [scheduled jobs](../drafts#scheduled-publishing) every minute by itself.

## What every host needs

| | |
|---|---|
| `EASY_CMS_SECRET` | At least 32 random characters (`openssl rand -hex 32`). Without it the API answers 500. |
| `NODE_ENV=production` | Production refuses to start while migrations are pending, and never changes the schema by itself. |
| Migrations | Created with `easy-cms migrate:create`, committed, and applied with `easy-cms migrate` before the new version starts. See [Migrations & deployment](../deployment). |
| `EASY_CMS_SETUP_CODE` | Until the first admin exists, so nobody else can claim a fresh site. |
| `serverURL` | The public address, for absolute media URLs and email links. See [Health checks](../health-checks#no-serverurl). |
| Trust the proxy | Behind a proxy or platform you trust: `trustProxy` (Next.js, Nuxt) or `--trust-proxy` (standalone), so login limits see each visitor's IP. |
| Scheduled jobs | On serverless, a cron calling `<api>/jobs/run` with `CRON_SECRET`. They publish scheduled posts, retry webhooks, send queued emails and run backups. |

## Before going live

- [ ] The secret, setup code and database URL are set in the host's environment, not committed
- [ ] `easy-cms migrate` runs before each new version starts
- [ ] Uploads go to a persistent disk or to file storage ([Uploads & media](../uploads#serving-and-storage))
- [ ] Scheduled jobs run: every minute on a long-running server, or from a cron
- [ ] `email` is configured, so password resets and invitations work ([Email](../email))
- [ ] The site is on HTTPS, with `serverURL` set to its address
- [ ] [Backups](../backups) run, and you have tried a restore
- [ ] The [security checklist](../security) is done

## Next steps

- [One-click deploy](../one-click-deploy): a starter site on Vercel or Netlify in a few clicks.
- [Vercel](./vercel), [Netlify](./netlify), [Docker](./docker) or [a VPS](./vps): step by step.
