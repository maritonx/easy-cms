# CLI

::: info What you'll learn
The two command-line tools: `create-easy-cms` to set up a project, and `easy-cms` for
migrations, users, types, backups, scheduled jobs and the standalone server.
:::

## create-easy-cms

```bash [pm]
npx create-easy-cms [dir] [--db sqlite|postgres] [--pm npm|pnpm|yarn|bun] [--standalone] [--yes] [--skip-install] [--from <link>]
```

Adds Easy CMS to a project:

- **In a Nuxt or Next.js project**, it installs the packages, writes `easy-cms.config.ts`, a
  `.env` with a random `EASY_CMS_SECRET`, wires up the module or route handlers, and adds the
  database and uploads to `.gitignore`.
- **In a new or empty directory** (or with `--standalone`), it sets up a
  [standalone server](./standalone) for any frontend.

| Option | |
|---|---|
| `dir` | Where to set up. Default: the current directory. |
| `--db` | `sqlite` (a file) or `postgres` (PGlite locally, a server in production). Asks when not given; `sqlite` with `--yes`. |
| `--pm` | `npm`, `pnpm`, `yarn` or `bun`. Default: the project's (its `packageManager` field, then its lockfile), else the one you ran it with. |
| `--standalone` | A standalone server even inside a Nuxt or Next.js project. |
| `--yes` | Accept the defaults without asking. |
| `--skip-install` | Only write files; run your package manager yourself. |
| `--from` | A [Studio](./studio) link: writes `easy-cms.config.ts` from it (beside an existing one, as `easy-cms.config.studio.ts`), takes the database from its adapter and installs every `@easy-cms` package it imports, at least the version the link was made with when that's newer than `create-easy-cms` (another major: the CLI's own, with a note). |

It installs and prints the next steps with that package manager (`pnpm exec easy-cms …`,
`yarn easy-cms …`, `bunx easy-cms …`). With Yarn 2 or later it writes `.yarnrc.yml` with
`nodeLinker: node-modules`: Plug'n'Play is not supported. Installing with Bun still runs the CMS
on Node.js; to run it on Bun or Deno, see [Bun and Deno](./standalone#bun-and-deno).

See [Getting started](./getting-started) for what happens next.

## easy-cms

Installed as a dev dependency (a regular dependency for standalone servers). Every command
loads `.env` from the project root and reads `easy-cms.config.ts`.

```bash [pm]
npx easy-cms <command> [--config <file>] [--cwd <dir>]
```

| Command | |
|---|---|
| [`migrate`](#migrate) | Apply pending migrations. |
| [`migrate:create <name>`](#migrate-create) | Write a migration for config changes, SQL of your own (`--empty`) or a data step (`--data`). |
| [`migrate:status`](#migrate-status) | List migrations and whether they are applied. |
| [`seed`](#seed) | Run `easy-cms/seed.ts` to add sample or starting content. |
| [`admin:create`](#admin-create) | Create a user. |
| [`generate:types`](#generate-types) | Write TypeScript types for other apps. |
| [`backup <file>`](#backup) | Copy the database to a SQLite file while the CMS runs. |
| [`backup:decrypt <file>`](#backup-decrypt) | Decrypt a backup made with `backups.encryptionKey`. |
| [`copy --from <config>`](#copy) | Copy all content into another database, e.g. SQLite to Postgres. |
| [`jobs:run`](#jobs-run) | Run due scheduled jobs and webhook retries once. |
| [`search:reindex [collection]`](#search-reindex) | Build the search index again from the database. |
| [`audit:resign`](#audit-resign) | After a new secret: sign the audit log with it. |
| [`secrets:rotate`](#secrets-rotate) | After a new secret: encrypt the Integrations' connections with it. |
| [`reset-sign-in`](#reset-sign-in) | Sign-in back to the config's providers, for admins locked out. |
| [`serve`](#serve) | Run the CMS as its own server. |
| [`build --target workers`](#build) | Write what Wrangler needs to deploy to Cloudflare Workers. |
| [`build:admin [files…]`](#build-admin) | Build admin components written in Vue, React or Svelte. |

Options for every command: `--config <file>` (default `easy-cms.config.ts`), `--cwd <dir>`
(the project root; its `.env` is loaded) and `--help`. Commands exit non-zero on failure, so
they work in CI and deploy scripts. Set `DEBUG=1` to see stack traces. Built-in commands stop
on an option they don't know.

`admin:create` and `jobs:run` were called `create-admin` and `run-scheduled` before 0.60. The
old names still work.

### migrate

```bash [pm]
npx easy-cms migrate
```

Applies every migration in `easy-cms/migrations` that the database has not run yet, in order.
Each runs in its own transaction, its [data step](#data-migrations) after its SQL; a failure rolls
it back and stops. Run it on every deploy,
before the new version starts. See [Migrations & deployment](./deployment).

### migrate:create

```bash [pm]
npx easy-cms migrate:create add-author-bio
```

Compares the config with the last migration and writes
`easy-cms/migrations/<timestamp>_<name>.sql` (and a `.json` snapshot) when something changed.
In a terminal it asks whether a field that disappeared was renamed, so data is kept instead of
dropped. Review the SQL, then commit both files.

#### SQL of your own {#empty-migrations}

```bash [pm]
npx easy-cms migrate:create app-log --empty
```

Writes an empty `<timestamp>_app-log.sql` for you to fill in: your app's own tables, a view, an
index, a backfill. It runs and is recorded with the other migrations, in its own transaction.
Separate statements with a line `--> statement-breakpoint`. It doesn't take in the config's
changes: those still get a migration of their own.

```sql
CREATE TABLE app_log (id integer PRIMARY KEY, note text NOT NULL)
--> statement-breakpoint
CREATE INDEX app_log_note ON app_log (note)
```

Name your tables without Easy CMS's prefix (`ecms_`): it never changes those. See
[Your own tables](./escape-hatches#your-own-tables).

#### Moving data {#data-migrations}

```bash [pm]
npx easy-cms migrate:create split-name --data
```

Writes the SQL for the config's changes (if any) and `<timestamp>_split-name.ts`, a data step
that runs after that SQL in the **same transaction**: if it throws, the new columns and every row
it changed are rolled back together, and `migrate` stops.

```ts
import type { DataMigration } from '@easy-cms/core'

const migrate: DataMigration = async (tx) => {
  const users = await tx.sql`SELECT id, name FROM ecms_users WHERE first_name IS NULL`
  for (const user of users) {
    const [first, ...rest] = String(user.name ?? '').split(' ')
    await tx.sql`UPDATE ecms_users SET first_name = ${first}, last_name = ${rest.join(' ')} WHERE id = ${user.id}`
  }
}

export default migrate
```

`` tx.sql`…` `` works like [`cms.sql`](./local-api#raw-sql): each value is a bound parameter. A data
step works on tables and columns as the migration leaves them, not on the config, so it keeps
working when the config changes later. Commit the `.ts` file with the `.sql` and `.json`.

### migrate:status

```bash [pm]
npx easy-cms migrate:status
# ✓ applied  20260925091723_init
# ✓ applied  20261117080102_split-name  (+ data)
# • pending  20261118040614_seo
```

### seed

```bash [pm]
npx easy-cms seed
npx easy-cms seed --file scripts/demo-content.ts
```

Runs `easy-cms/seed.ts` (or `--file`), whose default export gets `cms`, the
[Local API](./local-api), with access rules off:

```ts
import type { Seed } from '@easy-cms/core'
import type config from '../easy-cms.config.ts'

const seed: Seed<typeof config> = async (cms) => {
  if ((await cms.count('posts')) > 0) return // already seeded
  await cms.create('posts', { title: 'Hello', status: 'published' })
}

export default seed
```

It runs every time it is called, so check what is there first. In development the schema is
pushed first, as the dev server does, unless the project has migrations. With
`NODE_ENV=production`, run `easy-cms migrate` before it. The
[one-click template](./one-click-deploy) runs it in its build to add sample posts.

### admin:create

```bash [pm]
npx easy-cms admin:create --email ann@example.com --name Ann
npx easy-cms admin:create --email bob@example.com --role editor
```

Creates a user with the `admin` role (or `--role`). The password is asked for in the terminal;
where there is no terminal (CI, containers), it is read from `EASY_CMS_ADMIN_PASSWORD`. Handy
when the first admin can't be created in the browser, or to recover access.

### generate:types

```bash [pm]
npx easy-cms generate:types --out ../web/src/cms-types.ts
```

Writes one interface per collection and global (default file `easy-cms-types.ts`). The file has
no imports, so a frontend in another repository can use it. Apps that import the config don't
need it: their types are [inferred](./typescript).

### backup

```bash [pm]
npx easy-cms backup backups/cms-2026-09-28.db
```

Copies the database to a new SQLite file while the CMS keeps running, as a consistent
snapshot; a name ending in `.gz` is compressed, like the backups made from the admin. The file
must not exist yet. Postgres needs `backups: { sqlite }` in the config (or use `pg_dump`).
Uploads are not included: back up the uploads folder or bucket separately. See
[Backups](./backups).

### backup:decrypt

```bash [pm]
npx easy-cms backup:decrypt my-site-2026-10-04-0300.db.gz.enc [--out <file>]
```

Decrypts a backup made with `backups.encryptionKey` (a `.db.gz.enc` file, e.g. copied from the
backup bucket) into a `.db.gz` file, with the key from the config. The database isn't opened.
Without `--out`, the file is written next to it without `.enc`; it must not exist yet.

### copy

```bash [pm]
npx easy-cms copy --from easy-cms.old.config.ts
```

Copies every document, version, user and global from the database of the `--from` config into
the database of the project's config, for example from SQLite to Postgres (or back). Ids stay
the same, so relationships, history and logins keep working.

- Both configs need the same collections and fields: import the main config into the old one and
  change only `db`. Different fields are refused.
- The target must be empty. In development its tables are created; in production run
  `easy-cms migrate` against it first.
- Uploaded files are not copied; they stay in the uploads folder or bucket.
- Stop writing to the source while copying, or copy from a [backup](#backup).

See [Move from SQLite to Postgres](./recipes/sqlite-to-postgres).

### jobs:run

```bash [pm]
npx easy-cms jobs:run
```

Runs due [scheduled publishes and unpublishes](./drafts#scheduled-publishing) and retries
failed [webhook deliveries](./webhooks#delivery), once. Servers do this every minute on their
own; use this command from a cron job where no server process keeps running (serverless).

### search:reindex

```bash [pm]
npx easy-cms search:reindex          # every collection with search
npx easy-cms search:reindex posts
```

Builds the [search](./search) index again from the published documents: after adding `search`
to a collection or changing its fields, or when indexing failed. An in-memory index
(`memorySearch()`) is built by the server when it starts, so there is nothing to do for it.

### secrets:rotate

```bash [pm]
npx easy-cms secrets:rotate
```

After [rotating the secret](./security#rotating-the-secret): encrypts the [Integrations](./integrations)'
connections still using one of `previousSecrets` with the current `secret`, so the old one can be
removed. Connections are also encrypted again one by one as they are used.

### reset-sign-in

```bash [pm]
npx easy-cms reset-sign-in
```

Forgets the sign-in providers admins turned on or off in Integrations → Sign-in, so people sign in
as the config sets it: for an admin who can't sign in any more, e.g. after a provider's client
secret expired. People signed in with providers turned on in the admin are signed out. Recorded in
the audit log. See [single sign-on in the admin](./sso#in-the-admin).

### audit:resign

```bash [pm]
npx easy-cms audit:resign
```

After [rotating the secret](./security#rotating-the-secret): signs the [audit log](./audit-log)
entries signed with one of `previousSecrets` with the current `secret`, so they still verify once
the old one is removed. Entries no secret verifies were changed in the database; they are left as
they are, listed, and the command exits with `1`. The run is recorded as an audit entry.

### serve

```bash [pm]
npx easy-cms serve --port 4000
npx easy-cms serve --watch          # development: reload on config changes
```

Runs Easy CMS without Nuxt or Next.js: the admin at `/admin`, the REST API at `/api/cms`, and
`/healthz` and `/readyz` for load balancers.

| Option | |
|---|---|
| `--port <n>` | Port. Default: `PORT`, then 4000. |
| `--host <host>` | Interface to listen on. Default: `HOST`, then all interfaces. |
| `--watch` | Reload when the config or files it imports change. |
| `--trust-proxy` | Trust `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` (for the CSRF origin check) from your reverse proxy. |

In production (`NODE_ENV=production`) pending migrations stop the server from starting. See
[Standalone server](./standalone).

### build

```bash [pm]
npx easy-cms build --target workers
```

Writes what Wrangler needs to deploy the standalone server (admin and REST API) as a Cloudflare
Worker:

- `.easy-cms/workers/`: the Worker's entry and the admin app. Written again on every build.
- `wrangler.jsonc`, when the project has none. It sets `nodejs_compat`, the `ASSETS` binding,
  Cron Triggers every minute for the jobs, and aliases for packages that can't run on Workers
  (`sharp`). Once written it is yours.

A Worker has no disk: the config needs `upload.storage` (e.g. `s3Storage()` with an R2 bucket) and
a database over HTTP (e.g. Turso). Images aren't resized there. Run `easy-cms migrate` against the
same database from your machine or CI, then `npx wrangler deploy`. Step by step:
[Deploy on Cloudflare Workers](./deploy/cloudflare-workers).

### build:admin

```bash [pm]
npx easy-cms build:admin
npx easy-cms build:admin --watch
npx easy-cms build:admin admin/components/acme-chart.tsx --out admin/dist/chart.js
```

Builds the Vue (`.vue`), React (`.tsx`, `.jsx`) and Svelte (`.svelte`) components in
`admin/components/` into one module, `admin/dist/components.js`, for `admin.modules`. Each becomes
a custom element named after its file. Files named on the command line get a module each in
`admin/dist/` (`--out`: the file for one, the folder for several). `--watch` builds again when a
file changes. Needs `@easy-cms/admin-build` and the framework's Vite plugin in the project. See
[Vue, React or Svelte](./plugins#frameworks).

### Commands from plugins

Plugins can add commands, e.g. `easy-cms nested:rebuild` from the [nested pages](./nested-docs)
plugin. `npx easy-cms --help` for an unknown command lists the ones your config has. Your own
config can add them too:

```ts
export default defineConfig({
  // …
  cliCommands: [
    {
      name: 'posts:count',
      description: 'Print how many posts there are',
      run: async ({ cms, args, log }) => log(String(await cms.count('posts'))),
    },
  ],
})
```

`run` gets the CMS (its schema as it is: run `migrate` first), the words after the command name
(`args`), the options (`flags`) and `log`. Return a number to exit with it.

`flags` holds every option the CLI doesn't use itself (`--config`, `--cwd` and `--help` are
its own), in camelCase. Values are strings, or `true` for an option without a value:

| You type | `flags` |
|---|---|
| `--dry-run` | `{ dryRun: true }` |
| `--limit=5` | `{ limit: '5' }` |

## Next steps

- [Migrations & deployment](./deployment): when to run which command.
- [Standalone server](./standalone): run the CMS for any frontend.
