// Creates a standalone Easy CMS project the way a user would, with one package manager, from
// the smoke-test registry, and checks that it works: migrations, an admin, the server.
//   node smoke/scaffold.ts <npm|pnpm|yarn|bun> [registry]
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

const PM = process.argv[2] as 'npm' | 'pnpm' | 'yarn' | 'bun'
const REGISTRY = process.argv[3] ?? 'http://localhost:4873'
if (!['npm', 'pnpm', 'yarn', 'bun'].includes(PM)) throw new Error('usage: scaffold.ts <pm>')
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
      `::error title=smoke (${PM})::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`,
    )
  process.exit(1)
}

// 1. `npm create easy-cms`, `pnpm create easy-cms`…: the package manager runs create-easy-cms,
//    which then installs with it (it sees which one in npm_config_user_agent).
const create: Record<typeof PM, [string, string[]]> = {
  npm: ['npm', ['create', 'easy-cms@latest', '--', 'my-cms', '--yes']],
  pnpm: ['pnpm', ['create', 'easy-cms', 'my-cms', '--yes']],
  yarn: ['yarn', ['create', 'easy-cms', 'my-cms', '--yes']],
  bun: ['bun', ['create', 'easy-cms', 'my-cms', '--yes']],
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
const expected = readFileSync(join(import.meta.dirname, '.registry', 'version'), 'utf8').trim()
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
const cms = (...args: string[]) => {
  const [command, prefix] = exec[PM]
  return run(command, [...prefix, 'easy-cms', ...args], project)
}
await cms('migrate:create', 'init')
await cms('migrate')
await cms('create-admin', '--email', 'admin@smoke.test')

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
console.log(`\n$ ${start[PM][0]} ${start[PM][1].join(' ')}`)
const server: ChildProcess = spawn(start[PM][0], start[PM][1], {
  cwd: project,
  env: { ...env, NODE_ENV: 'production' },
  stdio: 'inherit',
  shell: windows,
  detached: !windows,
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
  const init = (await (await fetch(`http://localhost:${port}/api/cms/users/init`)).json()) as {
    hasUsers?: boolean
  }
  if (init.hasUsers !== true) throw new Error(`expected the admin: ${JSON.stringify(init)}`)
  console.log(`\n✓ ${PM}: created, installed, migrated and served`)
} finally {
  stop()
}
process.exit(0)
