// Upgrade test: a database made and filled by an older release, then migrated and read by the
// packages in this repo, the way an app is upgraded in production (`migrate:create`, `migrate`).
//   node upgrade/run.ts [sqlite|postgres|pglite] [versions...]
// `postgres` needs POSTGRES_URL; its public schema is emptied before each version.
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Releases to upgrade from, oldest first; the latest release on npm is added. */
const OLD_VERSIONS = ['0.10.0', '0.20.0', '0.35.0', '0.48.0']
const DATABASES = ['sqlite', 'postgres', 'pglite'] as const
type Database = (typeof DATABASES)[number]

const [dbArg = 'sqlite', ...versionArgs] = process.argv.slice(2)
if (!DATABASES.includes(dbArg as Database))
  throw new Error(`usage: run.ts [${DATABASES.join('|')}] [versions...]`)
const db = dbArg as Database
const versions = versionArgs.length > 0 ? versionArgs : [...OLD_VERSIONS, latestRelease()]
if (db === 'postgres' && !process.env.POSTGRES_URL) throw new Error('postgres needs POSTGRES_URL')

const repo = join(import.meta.dirname, '..')
const packages = join(repo, 'packages')
const pgliteVersion = (
  JSON.parse(readFileSync(join(packages, 'db-postgres', 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>
  }
).devDependencies['@electric-sql/pglite'] as string

const env = { ...process.env, NODE_ENV: 'production', UPGRADE_DB: db }

/** The latest version of `easy-cms` on npm: today's users upgrade from it. */
function latestRelease(): string {
  const result = spawnSync('npm', ['view', 'easy-cms', 'version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const version = result.stdout.trim()
  if (result.status !== 0 || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`npm view easy-cms version failed: ${result.stderr}`)
  return version
}

function run(command: string, args: string[], cwd: string) {
  console.log(`$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`)
}

const cli = (project: string, ...args: string[]) =>
  run(
    process.execPath,
    [join(project, 'node_modules', 'easy-cms', 'bin', 'easy-cms.js'), ...args],
    project,
  )

/** Empties the Postgres database, with the `postgres` driver db-postgres uses. */
async function resetPostgres() {
  const require = createRequire(join(packages, 'db-postgres', 'package.json'))
  const postgres = require('postgres') as (
    url: string,
    options: object,
  ) => {
    unsafe(query: string): Promise<unknown>
    end(): Promise<void>
  }
  const sql = postgres(process.env.POSTGRES_URL as string, { max: 1, onnotice: () => {} })
  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  } finally {
    await sql.end()
  }
}

/** Points the project's packages at this repo's, as upgrading them would. */
function useCurrentPackages(project: string) {
  const modules = join(project, 'node_modules')
  rmSync(modules, { recursive: true, force: true })
  mkdirSync(join(modules, '@easy-cms'), { recursive: true })
  const link = (from: string, to: string) => symlinkSync(from, to, 'junction')
  for (const name of ['core', 'db-sqlite', 'db-postgres', 'drizzle', 'admin'])
    link(join(packages, name), join(modules, '@easy-cms', name))
  link(join(packages, 'cli'), join(modules, 'easy-cms'))
}

async function upgradeFrom(version: string) {
  console.log(`\n=== ${db}: ${version} → this repo`)
  const project = mkdtempSync(join(tmpdir(), `easy-cms-upgrade-${version}-`))
  try {
    cpSync(join(import.meta.dirname, 'project'), project, { recursive: true })
    if (db === 'postgres') await resetPostgres()

    // The old release: install, create the schema with its migrations, fill it.
    run(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        `@easy-cms/core@${version}`,
        `@easy-cms/db-sqlite@${version}`,
        `@easy-cms/db-postgres@${version}`,
        `easy-cms@${version}`,
        ...(db === 'pglite' ? [`@electric-sql/pglite@${pgliteVersion}`] : []),
      ],
      project,
    )
    cli(project, 'migrate:create', 'init')
    cli(project, 'migrate')
    run(process.execPath, ['seed.mjs'], project)

    // This repo's packages: a migration for what changed, if anything, then read it all back.
    useCurrentPackages(project)
    cli(project, 'migrate:create', 'upgrade')
    cli(project, 'migrate')
    cli(project, 'migrate:status')
    const migrations = readdirSync(join(project, 'easy-cms', 'migrations')).filter((f) =>
      f.endsWith('.sql'),
    )
    console.log(`migrations: ${migrations.join(', ')}`)
    run(process.execPath, ['verify.mjs'], project)
  } finally {
    rmSync(project, { recursive: true, force: true, maxRetries: 5 })
  }
}

for (const version of versions) await upgradeFrom(version)
console.log(`\nUpgraded ${db} from ${versions.join(', ')}`)
