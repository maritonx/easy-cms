import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { configTemplate, type DatabaseChoice, nextAdminRoute, nextApiRoute } from './templates.js'

export type Framework = 'nuxt' | 'next'
/** Where Easy CMS runs: inside a Nuxt or Next.js app, or as its own server. */
export type Target = Framework | 'standalone'
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface IO {
  readonly out: (line: string) => void
  readonly err: (line: string) => void
  readonly interactive: boolean
  readonly prompt?: (question: string) => Promise<string>
  /** Runs a command (the package manager). Returns the exit code. */
  readonly exec?: (command: string, args: string[], cwd: string) => Promise<number>
}

const defaultIO: IO = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  prompt: async (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      return (await rl.question(question)).trim()
    } finally {
      rl.close()
    }
  },
  exec: (command, args, cwd) =>
    new Promise((done) => {
      const child = spawn(command, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      })
      child.on('close', (code) => done(code ?? 1))
      child.on('error', () => done(1))
    }),
}

const HELP = `Usage: create-easy-cms [dir] [options]

Adds Easy CMS to the Nuxt or Next.js project in [dir] (default: current directory).
In an empty or new directory it sets up a standalone Easy CMS server instead, the
backend for a Vite, React, Vue or static frontend.

Options:
  --standalone            Set up a standalone server even in an existing project
  --db <sqlite|postgres>  Database (default: ask, or sqlite with --yes)
  --yes, -y               Accept the defaults without asking
  --skip-install          Write files only; install the packages yourself
  -h, --help              Show help
`

/** Detects the framework from package.json dependencies. */
export function detectFramework(pkg: Record<string, unknown>): Framework | undefined {
  const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<
    string,
    string
  >
  if (deps.nuxt) return 'nuxt'
  if (deps.next) return 'next'
  return undefined
}

/** Detects the package manager from the lockfile, falling back to the one running us. */
export function detectPackageManager(dir: string): PackageManager {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb'))) return 'bun'
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm'
  const agent = process.env.npm_config_user_agent ?? ''
  for (const pm of ['pnpm', 'yarn', 'bun'] as const) if (agent.startsWith(pm)) return pm
  return 'npm'
}

function ownVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
    )
    return pkg.version && pkg.version !== '0.0.0' ? `^${pkg.version}` : 'latest'
  } catch {
    return 'latest'
  }
}

export function packagesFor(
  target: Target,
  db: DatabaseChoice,
): { deps: string[]; devDeps: string[] } {
  const v = ownVersion()
  // Standalone: the `easy-cms` CLI is the server, so it is a runtime dependency.
  const deps =
    target === 'standalone'
      ? [`@easy-cms/core@${v}`, `easy-cms@${v}`]
      : [`@easy-cms/core@${v}`, `@easy-cms/${target}@${v}`]
  if (db === 'sqlite') deps.push(`@easy-cms/db-sqlite@${v}`)
  else deps.push(`@easy-cms/db-postgres@${v}`, '@electric-sql/pglite')
  return { deps, devDeps: target === 'standalone' ? [] : [`easy-cms@${v}`] }
}

function installArgs(pm: PackageManager, packages: string[], dev: boolean): string[] {
  const add = pm === 'npm' ? 'install' : 'add'
  const devFlag = pm === 'npm' ? '--save-dev' : pm === 'bun' ? '--dev' : '-D'
  return [add, ...(dev ? [devFlag] : []), ...packages]
}

/** Runs create-easy-cms and returns the exit code. */
export async function run(argv: readonly string[], io: IO = defaultIO): Promise<number> {
  let values: {
    db?: string
    yes?: boolean
    standalone?: boolean
    'skip-install'?: boolean
    help?: boolean
  }
  let positionals: string[]
  try {
    ;({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        db: { type: 'string' },
        yes: { type: 'boolean', short: 'y' },
        standalone: { type: 'boolean' },
        'skip-install': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    }))
  } catch (error) {
    io.err((error as Error).message)
    io.err(HELP)
    return 1
  }
  if (values.help) {
    io.out(HELP)
    return 0
  }

  const dir = resolve(positionals[0] ?? process.cwd())
  const pkgFile = join(dir, 'package.json')
  const hasPackage = existsSync(pkgFile)
  const framework = hasPackage
    ? detectFramework(JSON.parse(await readFile(pkgFile, 'utf8')))
    : undefined
  let target: Target | undefined = values.standalone ? 'standalone' : framework
  if (!target && !hasPackage) {
    // A new or empty directory: nothing to add Easy CMS to, so it becomes the server itself.
    target = 'standalone'
  } else if (!target) {
    const question =
      'This is not a Nuxt or Next.js project. Set up a standalone Easy CMS server here? [Y/n] '
    // Only on request: an existing frontend (e.g. a Vite app) rarely wants server packages added.
    const yes =
      !values.yes && io.interactive && io.prompt ? !/^n/i.test(await io.prompt(question)) : false
    if (!yes) {
      io.err('This does not look like a Nuxt or Next.js project (no "nuxt" or "next" dependency).')
      io.err(
        'Create one first (`npx nuxi init my-app`, `npx create-next-app my-app`), or run with --standalone.',
      )
      return 1
    }
    target = 'standalone'
  }

  let db = values.db as DatabaseChoice | undefined
  if (db !== undefined && db !== 'sqlite' && db !== 'postgres') {
    io.err(`--db must be "sqlite" or "postgres" (got "${db}")`)
    return 1
  }
  if (!db) {
    if (!values.yes && io.interactive && io.prompt) {
      const answer = (
        await io.prompt('Database? [1] SQLite (default)  [2] Postgres (PGlite locally): ')
      ).toLowerCase()
      db = answer === '2' || answer.startsWith('p') ? 'postgres' : 'sqlite'
    } else {
      db = 'sqlite'
    }
  }

  io.out(
    target === 'standalone'
      ? `Setting up a standalone Easy CMS server in ${relative(process.cwd(), dir) || '.'} (${db}).`
      : `Adding Easy CMS to this ${target === 'nuxt' ? 'Nuxt' : 'Next.js'} project (${db}).`,
  )
  const changes: string[] = []
  const notes: string[] = []

  // easy-cms.config.ts
  const configFile = join(dir, 'easy-cms.config.ts')
  if (existsSync(configFile)) {
    notes.push('easy-cms.config.ts already exists; left unchanged.')
  } else {
    await mkdir(dir, { recursive: true })
    await writeFile(configFile, configTemplate(db, { standalone: target === 'standalone' }))
    changes.push('created easy-cms.config.ts')
  }

  // .env with a random secret (FR-INS-03)
  const envFile = join(dir, '.env')
  const env = existsSync(envFile) ? await readFile(envFile, 'utf8') : ''
  if (!/^EASY_CMS_SECRET=\S+/m.test(env)) {
    const secret = randomBytes(32).toString('hex')
    await writeFile(
      envFile,
      `${env}${env && !env.endsWith('\n') ? '\n' : ''}EASY_CMS_SECRET=${secret}\n`,
    )
    changes.push('added EASY_CMS_SECRET to .env')
  }

  // .gitignore
  const ignoreFile = join(dir, '.gitignore')
  const ignore = existsSync(ignoreFile) ? await readFile(ignoreFile, 'utf8') : ''
  const wanted = ['.env', 'cms.db*', 'uploads/', '.pglite/'].filter(
    (entry) => !ignore.split('\n').some((line) => line.trim() === entry),
  )
  if (wanted.length) {
    const block = `\n# Easy CMS\n${wanted.join('\n')}\n`
    await writeFile(
      ignoreFile,
      `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}${block.trimStart()}`,
    )
    changes.push(`added ${wanted.join(', ')} to .gitignore`)
  }

  if (target === 'nuxt') await setupNuxt(dir, changes, notes)
  else if (target === 'next') await setupNext(dir, changes, notes)
  else await setupStandalone(dir, changes)

  for (const change of changes) io.out(`  ✓ ${change}`)
  for (const note of notes) io.out(`  • ${note}`)

  const pm = detectPackageManager(dir)
  const { deps, devDeps } = packagesFor(target, db)
  if (values['skip-install']) {
    io.out('\nInstall the packages:')
    io.out(`  ${pm} ${installArgs(pm, deps, false).join(' ')}`)
    if (devDeps.length) io.out(`  ${pm} ${installArgs(pm, devDeps, true).join(' ')}`)
  } else if (io.exec) {
    io.out(`\nInstalling with ${pm}…`)
    const code =
      (await io.exec(pm, installArgs(pm, deps, false), dir)) ||
      (devDeps.length ? await io.exec(pm, installArgs(pm, devDeps, true), dir) : 0)
    if (code !== 0) {
      io.err(
        `\nInstalling failed. Run it yourself:\n  ${pm} ${installArgs(pm, deps, false).join(' ')}`,
      )
      return 1
    }
  }

  const devCommand = pm === 'npm' ? 'npm run dev' : `${pm} dev`
  if (target === 'standalone') {
    const cd = relative(process.cwd(), dir)
    io.out(`
Done. Next:
  1. ${cd ? `cd ${cd} && ` : ''}${devCommand}   (http://localhost:4000/admin)
  2. Create the first admin there (or run: npx easy-cms create-admin)
  3. Point your frontend at http://localhost:4000/api/cms and list its origin in \`cors\`
     in easy-cms.config.ts.
  4. Before deploying: npx easy-cms migrate:create init, commit easy-cms/migrations,
     run npx easy-cms migrate, then NODE_ENV=production ${pm === 'npm' ? 'npm start' : `${pm} start`}.`)
    return 0
  }
  io.out(`
Done. Next:
  1. ${devCommand}
  2. Open /admin and create the first admin (or run: npx easy-cms create-admin)
  3. Before deploying: npx easy-cms migrate:create init, commit easy-cms/migrations,
     and run npx easy-cms migrate where you deploy.
  4. Set EASY_CMS_SECRET in the production environment.${
    target === 'nuxt'
      ? `\n     Nuxt's production server does not read .env: set it on the host, or start with\n     node --env-file=.env .output/server/index.mjs`
      : ''
  }`)
  return 0
}

const STANDALONE_SCRIPTS: Record<string, string> = {
  dev: 'easy-cms serve --watch',
  start: 'easy-cms serve',
  migrate: 'easy-cms migrate',
  'migrate:create': 'easy-cms migrate:create',
}

async function setupStandalone(dir: string, changes: string[]) {
  const file = join(dir, 'package.json')
  const existing = existsSync(file)
  const pkg = existing
    ? (JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>)
    : {
        name: basename(dir)
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-'),
        private: true,
        type: 'module',
      }
  const scripts = { ...(pkg.scripts as Record<string, string> | undefined) }
  const added = Object.entries(STANDALONE_SCRIPTS).filter(([name]) => !(name in scripts))
  if (existing && added.length === 0) return
  for (const [name, command] of added) scripts[name] = command
  await writeFile(file, `${JSON.stringify({ ...pkg, scripts }, null, 2)}\n`)
  changes.push(
    existing
      ? `added ${added.map(([name]) => name).join(', ')} scripts to package.json`
      : 'created package.json',
  )
}

async function setupNuxt(dir: string, changes: string[], notes: string[]) {
  const file = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs']
    .map((f) => join(dir, f))
    .find(existsSync)
  const manual = "add '@easy-cms/nuxt' to `modules` in nuxt.config"
  if (!file) {
    notes.push(`No nuxt.config found: ${manual}.`)
    return
  }
  const source = await readFile(file, 'utf8')
  if (source.includes('@easy-cms/nuxt')) return
  let next: string | undefined
  if (/modules\s*:\s*\[/.test(source)) {
    next = source.replace(/modules\s*:\s*\[/, (match) => `${match}'@easy-cms/nuxt', `)
  } else if (/defineNuxtConfig\(\s*\{/.test(source)) {
    next = source.replace(
      /defineNuxtConfig\(\s*\{/,
      (match) => `${match}\n  modules: ['@easy-cms/nuxt'],`,
    )
  }
  if (next) {
    await writeFile(file, next)
    changes.push(`added @easy-cms/nuxt to modules in ${relative(dir, file)}`)
  } else {
    notes.push(`Could not edit ${relative(dir, file)}: ${manual}.`)
  }
}

async function setupNext(dir: string, changes: string[], notes: string[]) {
  const appDir = existsSync(join(dir, 'src', 'app')) ? join(dir, 'src', 'app') : join(dir, 'app')
  const routes = [
    { file: join(appDir, 'api', 'cms', '[[...path]]', 'route.ts'), template: nextApiRoute },
    { file: join(appDir, 'admin', '[[...path]]', 'route.ts'), template: nextAdminRoute },
  ]
  for (const { file, template } of routes) {
    if (existsSync(file)) {
      notes.push(`${relative(dir, file)} already exists; left unchanged.`)
      continue
    }
    const configImport = relative(dirname(file), join(dir, 'easy-cms.config')).replace(/\\/g, '/')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, template(configImport))
    changes.push(`created ${relative(dir, file)}`)
  }

  const configFile = ['next.config.ts', 'next.config.mjs', 'next.config.js']
    .map((f) => join(dir, f))
    .find(existsSync)
  const manual =
    "wrap your Next config: `export default withEasyCMS(config)` from '@easy-cms/next/config'"
  if (!configFile) {
    await writeFile(
      join(dir, 'next.config.ts'),
      `import { withEasyCMS } from '@easy-cms/next/config'\n\nexport default withEasyCMS({})\n`,
    )
    changes.push('created next.config.ts')
    return
  }
  const source = await readFile(configFile, 'utf8')
  if (source.includes('withEasyCMS')) return
  // create-next-app exports a named constant (`export default nextConfig`); only rewrite that shape.
  const match = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/.exec(source)
  if (!match) {
    notes.push(`Could not edit ${relative(dir, configFile)}: ${manual}.`)
    return
  }
  const updated = `import { withEasyCMS } from '@easy-cms/next/config'\n${source.replace(
    match[0],
    `export default withEasyCMS(${(match[1] as string).trim()})`,
  )}`
  await writeFile(configFile, updated)
  changes.push(`wrapped the config in withEasyCMS() in ${relative(dir, configFile)}`)
}
