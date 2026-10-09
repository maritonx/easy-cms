# Other hosts

::: info What you'll learn
What any Node.js host needs to run Easy CMS, and notes for Railway, Render, Fly.io and Coolify.

**Before this page:** [Choosing a host](./), [Docker](./docker).
:::

Most platforms either build your app from its `package.json` or run the image from
[Docker](./docker). Either way, check the list below. The notes per platform come from each
platform's documentation; we haven't run every one of them ourselves.

## What any host needs

- **Node.js 22.12 or newer.** Most platforms read `engines` in `package.json`:
  `"engines": { "node": ">=22.12" }`. Edge runtimes are not supported.
- **Build, then migrate, then start.** Build with `next build`, `nuxi build`, or nothing for the
  standalone server; before starting, run `easy-cms migrate`; then start with `next start`,
  `node .output/server/index.mjs` or `easy-cms serve`. Many platforms have a pre-deploy or release
  command for the migration; otherwise start with `easy-cms migrate && …`.
- **Somewhere to keep data.** Either a persistent disk (volume) for SQLite and `uploads`, or a
  hosted Postgres and [file storage](../uploads#serving-and-storage). With SQLite on a disk, run
  one instance.
- **A process that keeps running**, so the server runs scheduled jobs every minute. If the platform
  stops idle apps, call `<api>/jobs/run` with `CRON_SECRET` from a cron instead.
- **The environment variables** from [Choosing a host](./#what-every-host-needs), and trust the
  platform's proxy (`trustProxy` or `--trust-proxy`).

## Railway

- Railway builds from `package.json` and picks the Node.js version from `engines` (or
  `.node-version`). The start command is your `start` script.
- **SQLite:** add a volume to the service and mount it inside the app, for example `/app/data`, then
  set `DATABASE_URL=file:/app/data/cms.db`. Mount `uploads` the same way, or use S3 storage.
  Volumes are mounted when the app runs, not while it builds, so migrate in the start command.
- **Postgres:** add Railway's Postgres and reference its `DATABASE_URL` in the app's variables.
- Services keep running unless you turn on Serverless (app sleeping); leave it off, or scheduled jobs
  only run while someone visits.

## Render

- Create a **Web Service** from the repository. Render picks the Node.js version from
  `NODE_VERSION`, `.node-version`, `.nvmrc` or `engines`.
- **SQLite:** persistent disks are for paid services only. Mount one at an absolute path, for example
  `/opt/render/project/src/data`, and point `DATABASE_URL` at a file in it. A service with a disk
  runs one instance and has a few seconds of downtime per deploy.
- **Postgres:** create a Render Postgres and copy its Internal Database URL into `DATABASE_URL`.
- Free web services stop after 15 minutes without visitors, which also stops scheduled jobs. Use a
  paid instance, or a Render Cron Job that calls `<api>/jobs/run` with `curl`.

## Fly.io

- Fly runs the image from [Docker](./docker) (`fly launch` finds the `Dockerfile`).
- **SQLite:** create a volume (`fly volumes create data --size 1`) and mount it in `fly.toml`:

  ```toml [fly.toml]
  [mounts]
    source = "data"
    destination = "/app/data"
  ```

  A volume belongs to one machine and isn't replicated: run one machine, and back up yourself.
- **Keep it running:** `fly launch` sets `auto_stop_machines = "stop"`, which stops idle machines and
  the scheduled jobs with them. Set `auto_stop_machines = "off"` (or `min_machines_running = 1`)
  under `[http_service]`.
- **Postgres:** Fly Managed Postgres sets `DATABASE_URL` when attached (`fly mpg attach`).

## Coolify

Coolify runs on your own server and deploys from Git.

- Choose the **Dockerfile** build pack with the image from [Docker](./docker), or Nixpacks.
- **SQLite and uploads:** add a volume mount under **Persistent Storage**, for example `/app/data`
  and `/app/uploads`.
- **Postgres:** create one from Coolify's databases and copy its internal URL into `DATABASE_URL`.
  Coolify can back up its databases on a schedule.
- Coolify's proxy issues HTTPS certificates for your domain, and the app keeps running, so
  scheduled jobs run by themselves.

## Next steps

- [Docker](./docker): the image these platforms build.
- [Backups](../backups): whatever the host, keep a copy elsewhere.
