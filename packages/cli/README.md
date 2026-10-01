# easy-cms

The Easy CMS command line: migrations, generated types, users, backups and the standalone
server. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first
headless CMS for Nuxt and Next.js.

## Install

```bash
npm install --save-dev easy-cms     # in a Nuxt or Next.js app
npm install easy-cms                # standalone: the CLI is the server
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```bash
npx easy-cms migrate:create <name>    # a migration for config changes
npx easy-cms migrate                  # apply pending migrations
npx easy-cms migrate:status
npx easy-cms generate:types [--out file.ts]
npx easy-cms create-admin [--email you@example.com] [--name] [--role]
npx easy-cms serve [--port 4000] [--watch]
npx easy-cms run-scheduled            # due scheduled jobs, webhook and email retries (cron)
npx easy-cms backup <file>            # SQLite snapshot while the CMS runs
npx easy-cms copy --from <config>     # copy content to another database
```

With pnpm, Yarn or Bun: `pnpm exec easy-cms …`, `yarn easy-cms …`, `bunx easy-cms …`. Every
command loads `.env` from the project root and takes `--config <file>`, `--cwd <dir>` and
`--help`. Plugins can add commands, such as `nested:rebuild`.

## Links

[CLI](https://maritonx.github.io/easy-cms/guide/cli) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
