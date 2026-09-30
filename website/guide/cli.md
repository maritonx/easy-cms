# CLI

::: info What you'll learn
The two command-line tools: `create-easy-cms` to set up a project, and `easy-cms` for
migrations, users, types, backups, scheduled jobs and the standalone server.
:::

## create-easy-cms

```bash
npx create-easy-cms [dir] [--db sqlite|postgres] [--standalone] [--yes] [--skip-install]
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
| `--standalone` | A standalone server even inside a Nuxt or Next.js project. |
| `--yes` | Accept the defaults without asking. |
| `--skip-install` | Only write files; run your package manager yourself. |

See [Getting started](./getting-started) for what happens next.

## easy-cms

Installed as a dev dependency (a regular dependency for standalone servers). Every command
loads `.env` from the project root and reads `easy-cms.config.ts`.

```bash
npx easy-cms <command> [--config <file>] [--cwd <dir>]
```

| Command | |
|---|---|
| [`migrate`](#migrate) | Apply pending migrations. |
| [`migrate:create <name>`](#migrate-create) | Write a migration for config changes. |
| [`migrate:status`](#migrate-status) | List migrations and whether they are applied. |
| [`create-admin`](#create-admin) | Create a user. |
| [`generate:types`](#generate-types) | Write TypeScript types for other apps. |
| [`backup <file>`](#backup) | Copy the SQLite database while the CMS runs. |
| [`copy --from <config>`](#copy) | Copy all content into another database, e.g. SQLite to Postgres. |
| [`run-scheduled`](#run-scheduled) | Run due scheduled jobs and webhook retries once. |
| [`serve`](#serve) | Run the CMS as its own server. |

Options for every command: `--config <file>` (default `easy-cms.config.ts`), `--cwd <dir>`
(the project root; its `.env` is loaded) and `--help`. Commands exit non-zero on failure, so
they work in CI and deploy scripts. Set `DEBUG=1` to see stack traces.

### migrate

```bash
npx easy-cms migrate
```

Applies every migration in `easy-cms/migrations` that the database has not run yet, in order.
Each runs in its own transaction; a failure rolls it back and stops. Run it on every deploy,
before the new version starts. See [Migrations & deployment](./deployment).

### migrate:create

```bash
npx easy-cms migrate:create add-author-bio
```

Compares the config with the last migration and writes
`easy-cms/migrations/<timestamp>_<name>.sql` (and a `.json` snapshot) when something changed.
In a terminal it asks whether a field that disappeared was renamed, so data is kept instead of
dropped. Review the SQL, then commit both files.

### migrate:status

```bash
npx easy-cms migrate:status
# ✓ applied  20260925091723_init
# • pending  20260928040614_seo
```

### create-admin

```bash
npx easy-cms create-admin --email ann@example.com --name Ann
npx easy-cms create-admin --email bob@example.com --role editor
```

Creates a user with the `admin` role (or `--role`). The password is asked for in the terminal;
where there is no terminal (CI, containers), it is read from `EASY_CMS_ADMIN_PASSWORD`. Handy
when the first admin can't be created in the browser, or to recover access.

### generate:types

```bash
npx easy-cms generate:types --out ../web/src/cms-types.ts
```

Writes one interface per collection and global (default file `easy-cms-types.ts`). The file has
no imports, so a frontend in another repository can use it. Apps that import the config don't
need it: their types are [inferred](./typescript).

### backup

```bash
npx easy-cms backup backups/cms-2026-09-28.db
```

Copies the SQLite database to a new file while the CMS keeps running, as a consistent
snapshot. The file must not exist yet. Uploads are not included: back up the uploads folder or
bucket separately. For Postgres use `pg_dump`. See [Backups](./backups).

### copy

```bash
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

### run-scheduled

```bash
npx easy-cms run-scheduled
```

Runs due [scheduled publishes and unpublishes](./drafts#scheduled-publishing) and retries
failed [webhook deliveries](./webhooks#delivery), once. Servers do this every minute on their
own; use this command from a cron job where no server process keeps running (serverless).

### serve

```bash
npx easy-cms serve --port 4000
npx easy-cms serve --watch          # development: reload on config changes
```

Runs Easy CMS without Nuxt or Next.js: the admin at `/admin`, the REST API at `/api/cms`, and
`/healthz` for load balancers.

| Option | |
|---|---|
| `--port <n>` | Port. Default: `PORT`, then 4000. |
| `--host <host>` | Interface to listen on. Default: `HOST`, then all interfaces. |
| `--watch` | Reload when the config or files it imports change. |
| `--trust-proxy` | Trust `X-Forwarded-For` and `X-Forwarded-Proto` from your reverse proxy. |

In production (`NODE_ENV=production`) pending migrations stop the server from starting. See
[Standalone server](./standalone).

### Commands from plugins

Plugins can add commands, e.g. `easy-cms nested:rebuild` from the [nested pages](./nested-docs)
plugin. `npx easy-cms --help` for an unknown command lists the ones your config has. Your own
config can add them too:

```ts
export default defineConfig({
  // …
  commands: [
    {
      name: 'posts:count',
      description: 'Print how many posts there are',
      run: async ({ cms, args, log }) => log(String(await cms.count('posts'))),
    },
  ],
})
```

`run` gets the CMS (its schema as it is: run `migrate` first), the words after the command name,
and `log`. Return a number to exit with it.

## Next steps

- [Migrations & deployment](./deployment): when to run which command.
- [Standalone server](./standalone): run the CMS for any frontend.
