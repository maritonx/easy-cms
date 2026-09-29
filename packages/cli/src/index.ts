import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import {
  ConfigError,
  copyDatabase,
  createEasyCMS,
  EasyCMSError,
  generateTypes,
  type Logger,
  loadConfig,
  ValidationError,
} from '@easy-cms/core'
import { startServer } from './serve.js'

export interface IO {
  readonly out: (line: string) => void
  readonly err: (line: string) => void
  readonly interactive: boolean
  /** Asks a question in the terminal. `hidden` does not echo what is typed (passwords). */
  readonly prompt?: (question: string, options?: { hidden?: boolean }) => Promise<string>
}

async function ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (options.hidden) {
    // Echo nothing while the password is typed.
    const output = rl as unknown as { _writeToOutput: (s: string) => void }
    let asked = false
    output._writeToOutput = (text: string) => {
      if (!asked) {
        process.stdout.write(text)
        asked = true
      }
    }
  }
  try {
    return (await rl.question(question)).trim()
  } finally {
    if (options.hidden) process.stdout.write('\n')
    rl.close()
  }
}

const defaultIO: IO = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  prompt: ask,
}

const HELP = `Usage: easy-cms <command> [options]

Commands:
  migrate                 Apply pending migrations
  migrate:create <name>   Create a migration from config changes
  migrate:status          List migrations and whether they are applied
  generate:types          Write TypeScript types for your collections and globals
  create-admin            Create an admin user
  serve                   Run the CMS as its own server (admin + REST API)
  run-scheduled           Run due scheduled publishes, webhook and email retries
  backup <file>           Copy a SQLite database to a file while the CMS runs
  copy --from <config>    Copy all content from another config's database into this one

Options:
  --config <file>         Config file (default: easy-cms.config.ts)
  --cwd <dir>             Project root (default: current directory); its .env is loaded
  -h, --help              Show help
`

const COMMAND_HELP: Record<string, string> = {
  migrate: `Usage: easy-cms migrate [options]

Applies every migration in easy-cms/migrations that the database has not run yet.
Each migration runs in its own transaction; a failure rolls it back and stops.
`,
  'migrate:create': `Usage: easy-cms migrate:create <name> [options]

Compares the config with the latest migration and writes a new migration
(easy-cms/migrations/<timestamp>_<name>.sql) if anything changed.
In a terminal you are asked whether changed fields were renamed.
`,
  'migrate:status': `Usage: easy-cms migrate:status [options]

Lists migration files and whether each has been applied.
`,
  'generate:types': `Usage: easy-cms generate:types [--out <file>] [options]

Writes interfaces for every collection and global (default: easy-cms-types.ts).
The file has no imports, so a frontend in another repository can copy it.
`,
  'create-admin': `Usage: easy-cms create-admin [--email <email>] [--name <name>] [--role <role>] [options]

Creates a user (role "admin" unless --role is given). The password is asked for in the
terminal, or read from EASY_CMS_ADMIN_PASSWORD when there is no terminal.
`,
  backup: `Usage: easy-cms backup <file> [options]

Copies the SQLite database to <file> (relative to the project root) while the CMS keeps running,
as a consistent snapshot. The file must not exist yet. Uploads are not included: back up the
uploads folder or bucket separately.

Postgres: use pg_dump, e.g. pg_dump --format=custom --file=cms.dump "$DATABASE_URL".
`,
  copy: `Usage: easy-cms copy --from <config> [options]

Copies every document, version, user and global from the database of the config in --from into
the database of this project's config (--config), for example from SQLite to Postgres. Ids stay
the same, so relationships and logins keep working. Both configs must have the same collections
and fields: import one into the other and change only \`db\`. The target must be empty; in
development its tables are created, in production run \`easy-cms migrate\` first.

Uploaded files are not copied: they stay in the uploads folder or bucket.
Stop writing to the source while copying, or copy from a backup.
`,
  'run-scheduled': `Usage: easy-cms run-scheduled [options]

Runs due scheduled publishes and unpublishes, and retries failed webhook deliveries, once:
for a cron job where no server process keeps running. Servers do this every minute on their own.
`,
  serve: `Usage: easy-cms serve [--port <n>] [--host <host>] [--watch] [--trust-proxy] [options]

Runs Easy CMS without Nuxt or Next.js: the admin at /admin, the REST API at /api/cms and
/healthz for load balancers. Frontends on other origins need \`cors\` in the config.

  --port <n>       Port (default: PORT, then 4000)
  --host <host>    Interface to listen on (default: HOST, then all interfaces)
  --watch          Reload when the config or files it imports change (development)
  --trust-proxy    Trust X-Forwarded-For / X-Forwarded-Proto from your reverse proxy

In production (NODE_ENV=production) pending migrations stop the server from starting.
`,
}

/** Runs the CLI and returns the exit code. */
export async function run(argv: readonly string[], io: IO = defaultIO): Promise<number> {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    io.err((error as Error).message)
    io.err(HELP)
    return 1
  }
  const { values, positionals } = parsed
  const [command, ...rest] = positionals

  if (!command) {
    ;(values.help ? io.out : io.err)(HELP)
    return values.help ? 0 : 1
  }
  if (!(command in COMMAND_HELP)) {
    io.err(`Unknown command "${command}".\n`)
    io.err(HELP)
    return 1
  }
  if (values.help) {
    io.out(COMMAND_HELP[command] as string)
    return 0
  }

  const cwd = values.cwd ?? process.cwd()
  loadDotEnv(cwd)
  const logger: Logger = { info: io.out, warn: (m) => io.err(`warning: ${m}`), error: io.err }

  try {
    const load = () => loadConfig({ cwd, ...(values.config ? { configFile: values.config } : {}) })
    if (command === 'serve') return await serve(values, cwd, logger, load, io)
    const config = await load()
    if (command === 'generate:types') {
      const out = values.out ?? 'easy-cms-types.ts'
      const file = isAbsolute(out) ? out : resolve(cwd, out)
      await writeFile(file, generateTypes(config))
      io.out(`Wrote ${file}`)
      return 0
    }
    if (command === 'copy') return await copy(values.from, config, cwd, logger, io)
    // create-admin writes a user, so the schema must exist: push in development like the app does.
    const schema =
      command === 'create-admin' && process.env.NODE_ENV !== 'production' ? 'push' : 'skip'
    const cms = await createEasyCMS(config, {
      cwd,
      schema,
      logger,
      interactive: io.interactive,
      scheduler: false,
    })
    try {
      switch (command) {
        case 'backup': {
          const target = rest.join(' ').trim()
          if (!target) {
            io.err('Missing backup file.\n')
            io.err(COMMAND_HELP.backup as string)
            return 1
          }
          if (!cms.db.backup) {
            io.err(
              'This database cannot back itself up. For Postgres use pg_dump, e.g.\n  pg_dump --format=custom --file=cms.dump "$DATABASE_URL"',
            )
            return 1
          }
          const file = isAbsolute(target) ? target : resolve(cwd, target)
          if (existsSync(file)) {
            io.err(`${file} already exists; choose a new file name.`)
            return 1
          }
          await mkdir(dirname(file), { recursive: true })
          await cms.db.backup(file)
          io.out(`Backed up the database to ${file}`)
          return 0
        }
        case 'run-scheduled': {
          const { ran, failed, webhooks, emails } = await cms.runJobs()
          io.out(`Ran ${ran} scheduled job(s)${failed ? `, ${failed} failed` : ''}.`)
          if (webhooks.sent || webhooks.failed)
            io.out(
              `Retried webhooks: ${webhooks.sent} sent${webhooks.failed ? `, ${webhooks.failed} gave up` : ''}.`,
            )
          if (emails.sent || emails.failed)
            io.out(
              `Retried emails: ${emails.sent} sent${emails.failed ? `, ${emails.failed} gave up` : ''}.`,
            )
          return failed ? 1 : 0
        }
        case 'migrate': {
          const applied = await cms.db.migrate()
          io.out(
            applied.length === 0
              ? 'No pending migrations.'
              : `Applied ${applied.length} migration(s).`,
          )
          return 0
        }
        case 'migrate:create': {
          const name = rest.join(' ').trim()
          if (!name) {
            io.err('Missing migration name.\n')
            io.err(COMMAND_HELP['migrate:create'] as string)
            return 1
          }
          const created = await cms.db.createMigration({ name })
          if (!created) {
            io.out('No changes; nothing to migrate.')
          } else {
            io.out(`Created ${created.file} (${created.statements.length} statements).`)
            io.out('Review it, commit it, then run `easy-cms migrate` where you deploy.')
          }
          return 0
        }
        case 'create-admin': {
          const email =
            values.email ?? (io.interactive && io.prompt ? await io.prompt('Email: ') : '')
          if (!email) {
            io.err('Missing --email.\n')
            io.err(COMMAND_HELP['create-admin'] as string)
            return 1
          }
          const password =
            process.env.EASY_CMS_ADMIN_PASSWORD ??
            (io.interactive && io.prompt
              ? await io.prompt('Password (8+ characters): ', { hidden: true })
              : '')
          if (!password) {
            io.err('Missing password: run in a terminal or set EASY_CMS_ADMIN_PASSWORD.')
            return 1
          }
          try {
            const user = await cms.create('users', {
              email,
              password,
              role: values.role ?? 'admin',
              ...(values.name ? { name: values.name } : {}),
            })
            io.out(`Created ${user.role} ${user.email}. Log in at ${cms.config.admin.path}`)
            return 0
          } catch (error) {
            if (error instanceof ValidationError) {
              for (const e of error.errors) io.err(`${e.field}: ${e.message}`)
              return 1
            }
            throw error
          }
        }
        case 'migrate:status': {
          const list = await cms.db.migrationStatus()
          if (list.length === 0)
            io.out('No migrations yet. Create one with `easy-cms migrate:create init`.')
          for (const m of list) io.out(`${m.applied ? '✓ applied' : '• pending'}  ${m.name}`)
          return 0
        }
      }
      return 1
    } finally {
      await cms.destroy()
    }
  } catch (error) {
    const known = error instanceof ConfigError || error instanceof EasyCMSError
    if (error instanceof Error)
      io.err(!known && process.env.DEBUG ? (error.stack ?? error.message) : error.message)
    else io.err(String(error))
    return 1
  }
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      cwd: { type: 'string' },
      out: { type: 'string' },
      from: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
      watch: { type: 'boolean' },
      'trust-proxy': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
}

async function serve(
  values: ReturnType<typeof parse>['values'],
  cwd: string,
  logger: Logger,
  load: () => ReturnType<typeof loadConfig>,
  io: IO,
): Promise<number> {
  const port = Number(values.port ?? process.env.PORT ?? 4000)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    io.err(`Invalid port "${values.port ?? process.env.PORT}".`)
    return 1
  }
  const host = values.host ?? process.env.HOST
  const server = await startServer({
    port,
    ...(host ? { host } : {}),
    cwd,
    logger,
    loadConfig: load,
    watch: values.watch ?? false,
    trustProxy: values['trust-proxy'] ?? false,
  })
  const config = await load()
  io.out(`Easy CMS running at ${server.url}`)
  io.out(`  admin  ${server.url}/${config.admin.path.replace(/^\/+|\/+$/g, '')}`)
  io.out(`  API    ${server.url}${config.routes.api}`)
  if (values.watch) io.out('  watching for changes')

  await new Promise<void>((resolveStop) => {
    const stop = (signal: string) => {
      io.out(`\n${signal} received, shutting down…`)
      resolveStop()
    }
    process.once('SIGINT', () => stop('SIGINT'))
    process.once('SIGTERM', () => stop('SIGTERM'))
  })
  await server.close()
  return 0
}

/** `easy-cms copy`: opens both databases and copies the source into the (empty) target. */
async function copy(
  from: string | undefined,
  config: Awaited<ReturnType<typeof loadConfig>>,
  cwd: string,
  logger: Logger,
  io: IO,
): Promise<number> {
  if (!from) {
    io.err('Missing --from <config>.\n')
    io.err(COMMAND_HELP.copy as string)
    return 1
  }
  const sourceConfig = await loadConfig({ cwd, configFile: from })
  // Only read the source: never change its schema.
  const source = await createEasyCMS(sourceConfig, {
    cwd,
    schema: 'skip',
    logger,
    scheduler: false,
  })
  try {
    const target = await createEasyCMS(config, {
      cwd,
      // Development: create the target's tables. Production: they must be migrated already.
      schema: process.env.NODE_ENV === 'production' ? 'verify' : 'push',
      logger,
      interactive: io.interactive,
      scheduler: false,
    })
    try {
      io.out(`Copying from ${sourceConfig.db.name} (${from}) to ${config.db.name}…`)
      const result = await copyDatabase(source.db, target.db, {
        onTable: ({ table, rows }) => {
          if (rows > 0) io.out(`  ${table}: ${rows}`)
        },
      })
      io.out(`Copied ${result.rows} row(s) from ${result.tables} table(s).`)
      io.out('Uploaded files were not copied; they stay in the uploads folder or bucket.')
      return 0
    } finally {
      await target.destroy()
    }
  } finally {
    await source.destroy()
  }
}

/** Loads `<cwd>/.env` like Nuxt and Next do. Variables already set are kept. */
function loadDotEnv(cwd: string) {
  const file = join(cwd, '.env')
  if (existsSync(file)) process.loadEnvFile(file)
}

export {
  createStandaloneHandler,
  type RunningServer,
  type StartOptions,
  startServer,
} from './serve.js'
