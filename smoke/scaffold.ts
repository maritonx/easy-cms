// Creates a standalone Easy CMS project the way a user would, with one package manager, from
// the smoke-test registry, and checks that it works: migrations, an admin, the server, and its
// REST API (smoke/api.ts).
//   node smoke/scaffold.ts <npm|pnpm|yarn|bun> [registry]
// With SMOKE_RUNTIME=bun or deno, the CLI and the server run on that runtime instead of Node
// (ADR-0067), as `bun --bun easy-cms …` and `deno run -A npm:easy-cms …` would.
// With SMOKE_RUNTIME=workers (npm only), the project becomes a Cloudflare Worker the way the
// guide says (guide/deploy/cloudflare-workers) and runs in `wrangler dev`: workerd, on this
// machine. It needs a database over HTTP and an S3 bucket: DATABASE_URL (e.g. sqld), S3_ENDPOINT,
// AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.
// Against a release on npmjs instead (#82), e.g. the release candidate:
//   SMOKE_TAG=rc SMOKE_VERSION=1.0.0-rc.0 node smoke/scaffold.ts npm https://registry.npmjs.org
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { checkApi } from './api.ts'

const PM = process.argv[2] as 'npm' | 'pnpm' | 'yarn' | 'bun'
const REGISTRY = process.argv[3] ?? 'http://localhost:4873'
if (!['npm', 'pnpm', 'yarn', 'bun'].includes(PM)) throw new Error('usage: scaffold.ts <pm>')
// biome-ignore lint/suspicious/noUndeclaredEnvVars: set by whoever runs the smoke test, not Turborepo
const RUNTIME = (process.env.SMOKE_RUNTIME ?? 'node') as 'node' | 'bun' | 'deno' | 'workers'
if (!['node', 'bun', 'deno', 'workers'].includes(RUNTIME))
  throw new Error(`unknown runtime ${RUNTIME}`)
if (RUNTIME === 'workers' && PM !== 'npm') throw new Error('SMOKE_RUNTIME=workers runs with npm')
// Next to a Worker, the CLI runs on Node: migrate, admin:create and build, as on your machine.
const CLI_RUNTIME = RUNTIME === 'workers' ? 'node' : RUNTIME
const NAME = RUNTIME === 'node' ? PM : `${PM}, ${RUNTIME}`
const windows = process.platform === 'win32'

const root = mkdtempSync(join(tmpdir(), `easy-cms-smoke-${PM}-`))
const project = join(root, 'my-cms')
// Only this registry, like a user's default one; no CI or workspace settings leak in.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  npm_config_registry: REGISTRY,
  NPM_CONFIG_REGISTRY: REGISTRY,
  BUN_CONFIG_REGISTRY: REGISTRY,
  YARN_NPM_REGISTRY_SERVER: REGISTRY, // Yarn 2+
  YARN_REGISTRY: REGISTRY, // Yarn 1, which reads neither npm_config_registry nor a parent .npmrc
  YARN_UNSAFE_HTTP_WHITELIST: 'localhost',
  YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
  YARN_ENABLE_GLOBAL_CACHE: 'false',
  // Yarn 4.10+ waits a day before installing a new version; these were published a minute ago.
  YARN_NPM_MINIMAL_AGE_GATE: '0',
  npm_config_user_agent: undefined,
  // Fresh caches: package lists cached from an earlier run would miss this run's versions.
  npm_config_cache: join(root, '.cache', 'npm'),
  BUN_INSTALL_CACHE_DIR: join(root, '.cache', 'bun'),
  npm_config_store_dir: join(root, '.cache', 'pnpm'),
  EASY_CMS_ADMIN_PASSWORD: 'smoke-admin-password',
}
// Bun reads its registry from bunfig or .npmrc; the env var covers `bun create`'s install.
writeFileSync(join(root, '.npmrc'), `registry=${REGISTRY}\n`)

/** The last lines a command printed, for the error annotation (CI logs need a login). */
let lastOutput: string[] = []

function run(command: string, args: string[], cwd: string, extra: NodeJS.ProcessEnv = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  lastOutput = []
  return new Promise<void>((done, fail) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...env, ...extra },
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: windows,
    })
    const keep = (chunk: Buffer, to: NodeJS.WriteStream) => {
      to.write(chunk)
      lastOutput = [...lastOutput, ...String(chunk).split('\n')].slice(-20)
    }
    child.stdout?.on('data', (chunk: Buffer) => keep(chunk, process.stdout))
    child.stderr?.on('data', (chunk: Buffer) => keep(chunk, process.stderr))
    child.on('error', fail)
    child.on('close', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} exited with ${code}`)),
    )
  })
}

process.on('uncaughtException', report)
process.on('unhandledRejection', report)
function report(error: unknown) {
  const message = [
    String((error as Error)?.message ?? error),
    ...lastOutput.map((line) => stripVTControlCharacters(line)).filter((line) => line.trim()),
  ].join('\n')
  console.error(message)
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: set by GitHub Actions, not a Turborepo input
  if (process.env.GITHUB_ACTIONS)
    console.log(
      `::error title=smoke (${NAME})::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`,
    )
  process.exit(1)
}

// 1. `npm create easy-cms`, `pnpm create easy-cms`…: the package manager runs create-easy-cms,
//    which then installs with it (it sees which one in npm_config_user_agent).
// biome-ignore lint/suspicious/noUndeclaredEnvVars: set by whoever runs the smoke test, not Turborepo
const TAG = process.env.SMOKE_TAG
const initializer = TAG ? `easy-cms@${TAG}` : 'easy-cms'
const create: Record<typeof PM, [string, string[]]> = {
  npm: ['npm', ['create', TAG ? initializer : 'easy-cms@latest', '--', 'my-cms', '--yes']],
  pnpm: ['pnpm', ['create', initializer, 'my-cms', '--yes']],
  yarn: ['yarn', ['create', initializer, 'my-cms', '--yes']],
  bun: ['bun', ['create', initializer, 'my-cms', '--yes']],
}
// Yarn 1's `yarn create` can't take a version or tag: it runs a binary named `create-easy-cms@rc`.
// Its users try a tagged release through npx, telling create-easy-cms to install with Yarn.
if (PM === 'yarn' && TAG && (await yarnMajor()) === 1)
  create.yarn = ['npx', ['--yes', `create-easy-cms@${TAG}`, 'my-cms', '--yes', '--pm', 'yarn']]

async function yarnMajor() {
  const { execFileSync } = await import('node:child_process')
  return Number(
    execFileSync('yarn', ['--version'], { cwd: root, env, shell: windows })
      .toString()
      .split('.')[0],
  )
}
await run(...create[PM], root)

const lockfiles: Record<typeof PM, string[]> = {
  npm: ['package-lock.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
}
const lock = lockfiles[PM].find((file) => {
  try {
    readFileSync(join(project, file))
    return true
  } catch {
    return false
  }
})
if (!lock) throw new Error(`installed without ${PM}: no ${lockfiles[PM].join(' or ')}`)
// The packages from this commit (smoke/publish.ts gave them a version npmjs doesn't have).
const expected =
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: set by whoever runs the smoke test, not Turborepo
  process.env.SMOKE_VERSION ??
  readFileSync(join(import.meta.dirname, '.registry', 'version'), 'utf8').trim()
const installed = JSON.parse(
  readFileSync(join(project, 'node_modules', '@easy-cms', 'core', 'package.json'), 'utf8'),
).version
if (installed !== expected)
  throw new Error(`installed @easy-cms/core ${installed}, not ${expected} from ${REGISTRY}`)
console.log(`\n✓ installed ${expected} with ${PM} (${lock})`)

// 2. The CLI, as the next steps say to run it.
const exec: Record<typeof PM, [string, string[]]> = {
  npm: ['npx', []],
  pnpm: ['pnpm', ['exec']],
  yarn: ['yarn', []],
  bun: ['bunx', []],
}
// On Bun or Deno: the installed CLI as the docs say to run it (guide/standalone#bun-and-deno);
// its `#!/usr/bin/env node` would otherwise pick Node.
const onRuntime: Record<'bun' | 'deno', [string, string[]]> = {
  bun: ['bunx', ['--bun', 'easy-cms']],
  deno: ['deno', ['run', '-A', 'npm:easy-cms']],
}
const cli = (args: string[]): [string, string[]] => {
  const [command, prefix] = CLI_RUNTIME === 'node' ? exec[PM] : onRuntime[CLI_RUNTIME]
  return [command, [...prefix, ...(CLI_RUNTIME === 'node' ? ['easy-cms'] : []), ...args]]
}
const cms = (...args: string[]) => run(...cli(args), project)
if (RUNTIME === 'workers') await prepareWorker()
await cms('migrate:create', 'init')
await cms('migrate')
await cms('admin:create', '--email', 'admin@smoke.test')

// 3. The production server (`start`), until /healthz answers. A port the system says is free:
// a random one could be taken, e.g. by the registry on 4873.
const port = await new Promise<string>((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, () => {
    const address = probe.address()
    probe.close(() => resolve(String(typeof address === 'object' && address ? address.port : 0)))
  })
})
const start: Record<typeof PM, [string, string[]]> = {
  npm: ['npm', ['run', 'start', '--', '--port', port]],
  pnpm: ['pnpm', ['start', '--port', port]],
  yarn: ['yarn', ['start', '--port', port]],
  bun: ['bun', ['run', 'start', '--port', port]],
}
// `start` is `easy-cms serve`; on Bun or Deno, the same command on that runtime. A Worker: built,
// then `wrangler dev` (production: wrangler.jsonc's vars).
if (RUNTIME === 'workers') await cms('build', '--target', 'workers')
const [startCommand, startArgs] =
  RUNTIME === 'workers'
    ? ['npx', ['wrangler', 'dev', '--port', port, '--test-scheduled']]
    : RUNTIME === 'node'
      ? start[PM]
      : cli(['serve', '--port', port])
console.log(`\n$ ${startCommand} ${startArgs.join(' ')}`)
/** What the server printed: a Worker's errors in `scheduled` show only there. */
let serverOutput = ''
const server: ChildProcess = spawn(startCommand, startArgs, {
  cwd: project,
  env: { ...env, NODE_ENV: 'production', WRANGLER_SEND_METRICS: 'false' },
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: windows,
  detached: !windows,
})
for (const [from, to] of [
  [server.stdout, process.stdout],
  [server.stderr, process.stderr],
] as const)
  from?.on('data', (chunk: Buffer) => {
    to.write(chunk)
    serverOutput += String(chunk)
  })
// A server that stops by itself (a crash, a port in use) fails the check at once, with its code.
let exited: number | null | undefined
server.on('exit', (code) => {
  exited = code
})
const stop = () => {
  if (windows) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'])
  else if (server.pid) process.kill(-server.pid, 'SIGTERM')
}
try {
  let ok = false
  const started = Date.now()
  // Slow runners can take a while to start Node and open the database.
  for (let i = 0; i < 120 && !ok && exited === undefined; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    ok = await fetch(`http://localhost:${port}/healthz`)
      .then((r) => r.ok)
      .catch(() => false)
  }
  if (exited !== undefined)
    throw new Error(`the server stopped (exit code ${exited}) before /healthz answered`)
  if (!ok)
    throw new Error(
      `the server did not answer /healthz in ${Math.round((Date.now() - started) / 1000)} s`,
    )
  console.log(`✓ /healthz answered after ${Math.round((Date.now() - started) / 1000)} s`)
  const init = (await (await fetch(`http://localhost:${port}/api/cms/auth/init`)).json()) as {
    hasUsers?: boolean
  }
  if (init.hasUsers !== true) throw new Error(`expected the admin: ${JSON.stringify(init)}`)
  await checkApi(
    `http://localhost:${port}`,
    'admin@smoke.test',
    env.EASY_CMS_ADMIN_PASSWORD as string,
  )
  if (RUNTIME === 'workers') await checkWorker(`http://localhost:${port}`)
  console.log(`\n✓ ${NAME}: created, installed, migrated, served and used`)
} finally {
  stop()
}
process.exit(0)

/**
 * A Worker has no disk: uploads go to an S3 bucket (R2 in production), and the database is
 * reached over HTTP. What the deploy guide has a user add: @easy-cms/storage-s3, Wrangler, the
 * config's `upload.storage`, and the variables in .env (read by the CLI and by `wrangler dev`).
 */
async function prepareWorker() {
  const need = ['DATABASE_URL', 'S3_ENDPOINT', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
  const missing = need.filter((name) => !env[name])
  if (missing.length) throw new Error(`SMOKE_RUNTIME=workers needs ${missing.join(', ')}`)
  await run('npm', ['install', `@easy-cms/storage-s3@${expected}`, 'wrangler@4'], project)

  const configFile = join(project, 'easy-cms.config.ts')
  const config = readFileSync(configFile, 'utf8')
  const anchor = `  admin: { locale: 'en' },\n`
  if (!config.includes(anchor)) throw new Error(`no "${anchor.trim()}" in easy-cms.config.ts`)
  writeFileSync(
    configFile,
    `import { s3Storage } from '@easy-cms/storage-s3'\n${config.replace(
      anchor,
      `${anchor}  upload: {\n    storage: s3Storage({ bucket: process.env.S3_BUCKET ?? '', endpoint: process.env.S3_ENDPOINT }),\n  },\n`,
    )}`,
  )

  const bucket = `smoke-${Date.now()}`
  const vars: Record<string, string> = {
    ...Object.fromEntries(need.map((name) => [name, env[name] as string])),
    S3_BUCKET: bucket,
  }
  const dotenv = join(project, '.env')
  writeFileSync(
    dotenv,
    `${readFileSync(dotenv, 'utf8')}${Object.entries(vars)
      .map(([name, value]) => `${name}=${value}\n`)
      .join('')}`,
  )

  // The bucket, with the S3 client that @easy-cms/storage-s3 installed.
  const require = createRequire(join(project, 'package.json'))
  const { AwsClient } = (await import(pathToFileURL(require.resolve('aws4fetch')).href)) as {
    AwsClient: new (options: Record<string, string>) => { fetch: typeof fetch }
  }
  const s3 = new AwsClient({
    accessKeyId: vars.AWS_ACCESS_KEY_ID,
    secretAccessKey: vars.AWS_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'us-east-1',
  })
  const created = await s3.fetch(`${vars.S3_ENDPOINT}/${bucket}`, { method: 'PUT' })
  if (!created.ok) throw new Error(`creating the bucket: ${created.status} ${await created.text()}`)
  console.log(`✓ added @easy-cms/storage-s3 and Wrangler, and the bucket ${bucket}`)
}

/** The admin app from the ASSETS binding, and Cron Triggers running the jobs. */
async function checkWorker(origin: string) {
  const admin = await fetch(`${origin}/admin/`)
  const shell = await admin.text()
  const script = shell.match(/<script[^>]+src="([^"]+)"/)?.[1]
  if (!admin.ok || !script) throw new Error(`/admin/: ${admin.status} ${shell.slice(0, 300)}`)
  const asset = await fetch(new URL(script, `${origin}/admin/`))
  if (!asset.ok) throw new Error(`the admin's ${script}: ${asset.status}`)
  console.log('✓ served the admin from the ASSETS binding')

  const before = serverOutput.length
  const scheduled = await fetch(`${origin}/__scheduled?cron=*+*+*+*+*`)
  if (!scheduled.ok) throw new Error(`the scheduled event: ${scheduled.status}`)
  // Its jobs run in ctx.waitUntil: an error there is only printed.
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const printed = serverOutput.slice(before)
  if (/error|uncaught/i.test(printed)) throw new Error(`the scheduled event failed:\n${printed}`)
  console.log('✓ ran the Cron Trigger')
}
