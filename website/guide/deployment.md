# Migrations & deployment

::: info What you'll learn
How schema changes are applied in development and shipped as migrations to production.

**Before this page:** [Databases](./databases).
:::

To try it on Vercel or Netlify in a few clicks, with a database and storage made for you, use
the [one-click deploy](./one-click-deploy).

## Development: automatic

While developing (`NODE_ENV` is not `production`), Easy CMS brings the database in line with
your config at startup: new fields become columns, removed fields are dropped.

::: warning Renames lose data in development
Renaming a field in development drops the old column and adds a new one. Use a migration (below)
when the data matters.
:::

## Production: migrations

In production nothing changes automatically. The server refuses to start when migrations are
pending or the config changed without one, and tells you what to run.

```bash [pm]
npx easy-cms migrate:create init     # after your first model, and after every change
git add easy-cms/migrations          # review the SQL, then commit
npx easy-cms migrate                 # where you deploy, before starting the new version
```

`migrate:create` compares your config with the last migration. Run in a terminal, it asks whether
a changed field was renamed, so data is kept. Each migration runs in one transaction; a failing
one is rolled back and not recorded.

A database set up by development push can't take migrations; run them against a fresh database.

## Environment variables

`create-easy-cms` puts `EASY_CMS_SECRET` (and `DATABASE_URL`, if you use one) in `.env`. That file
is for development; whether production reads it depends on how the server starts:

| Server | Reads `.env` in production? | What to do |
|---|---|---|
| Next.js (`next start`) | Yes | Nothing, or set the variables on the host |
| Nuxt (`node .output/server/index.mjs`) | **No** | Set the variables on the host, or start with `node --env-file=.env .output/server/index.mjs` |
| Platforms (Vercel, Netlify, Fly, Docker…) | Use the platform's settings | Add the variables in its dashboard, CLI or compose file; see [Deploy](./deploy/) |

When `EASY_CMS_SECRET` is missing, the API answers `500` and the log says
`secret: is required`.

## Logs

By default Easy CMS writes readable lines, `[easy-cms] …`, with an error's stack under it. For a
log pipeline (Datadog, Loki, CloudWatch, `docker logs` into a collector), write one JSON object
per line instead:

```ts
logs: { format: 'json' }
```

or set `EASY_CMS_LOG_FORMAT=json` on the host, which wins over the config:

```json
{"time":"2026-10-25T14:22:19.280Z","level":"info","name":"easy-cms","message":"GET /api/cms/posts 200","requestId":"lb-7f3a","method":"GET","path":"/api/cms/posts","status":200,"durationMs":7,"userId":3}
{"time":"2026-10-25T14:22:20.011Z","level":"error","name":"easy-cms","message":"REST request failed: …","requestId":"0b6f…","error":{"name":"Error","message":"…","stack":"…"}}
```

- **Request ids.** Every API response has an `X-Request-Id` header, and every line logged while
  answering it has the same `requestId`. An `X-Request-Id` from your load balancer is kept
  when it is plain (letters, digits, `.`, `_`, `-`, up to 128), so one id follows a request
  from the proxy's log to Easy CMS's.
- **A line per request**, with method, path (without the query string, which may hold personal
  data), status, duration and the user's id. Turn it off with `logs: { requests: false }` when
  the load balancer already logs requests.
- **Background jobs.** Each run of scheduled publishing and jobs logs with its own `runId`, and
  with the `requestId` of the cron call that started it.

`easy-cms serve` follows the same setting. With your own `logger` passed to `createEasyCMS`,
`logs` is ignored: `jsonLogger()` from `@easy-cms/core` writes this format.

## Health checks

Load balancers, container platforms and Kubernetes ask two questions:

| Path | Answers | Use for |
|---|---|---|
| `<api>/healthz` | `200 ok` while the process runs; never touches the database | Liveness: restart the process when it stops answering |
| `<api>/readyz` | `200` when Easy CMS started, its database answers and no migration is pending; `503` otherwise | Readiness: send traffic only to instances that can serve it |

`<api>` is `routes.api`, `/api/cms` by default, so every setup has them: Next.js, Nuxt and the
[standalone server](./standalone), which also answers `/healthz` and `/readyz` at the root.
Neither needs credentials, and neither is cached.

```json
{ "status": "ok", "checks": { "database": "ok", "migrations": "ok" } }
{ "status": "error", "checks": { "database": "ok", "migrations": "1 pending" } }
```

A failed check is named, never explained: the error goes to the log, with its
[request id](#logs). When Easy CMS can't start (a bad config, an unreachable database),
`/healthz` still answers `200` and `/readyz` answers `503` with `"startup": "error"`.

```yaml
# Kubernetes
livenessProbe:
  httpGet: { path: /api/cms/healthz, port: 3000 }
readinessProbe:
  httpGet: { path: /api/cms/readyz, port: 3000 }
  periodSeconds: 5
```

Point liveness at `healthz`, not `readyz`: a database outage should take instances out of the
load balancer, not restart them all. Probes are left out of the [request log lines](#logs).

## Checklist

- `EASY_CMS_SECRET` set in the production environment (at least 32 random characters:
  `openssl rand -hex 32`); see [Environment variables](#environment-variables)
- `NODE_ENV=production`
- The `easy-cms/migrations` folder deployed, and `easy-cms migrate` run
- Start the server **from the project root**: relative database paths, migrations and uploads
  resolve from the working directory
- Uploads on local disk need a persistent volume; on serverless platforms use
  [S3 storage](./uploads#s3-cloudflare-r2-and-minio), [Vercel Blob](./uploads#vercel-blob) or
  [Netlify Blobs](./uploads#netlify-blobs)
- `EASY_CMS_SETUP_CODE` set until the first admin exists, so nobody else can claim the site
- Build on the same OS and architecture as the server when using SQLite (native driver)
- Behind a trusted proxy, enable `trustProxy` for per-IP login rate limiting
- Set `auth.trustedOrigins` if the admin or frontend call the API from another origin
- [Backups](./backups) of the database and uploads, and a restore you have tried

After going live, the dashboard tells admins what needs attention: see
[Health checks](./health-checks).

## Next steps

- [Deploy](./deploy/): step by step on Vercel, Netlify, Docker, a VPS and other hosts.
- [Backups & upgrades](./backups): back up before upgrading.
- [Security](./security): a checklist for going live.
