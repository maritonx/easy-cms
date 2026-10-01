// Creates a standalone Easy CMS project the way a user would, with one package manager, from
// the smoke-test registry, and checks that it works: migrations, an admin, the server.
//   node smoke/scaffold.ts <npm|pnpm|yarn|bun> [registry]
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  YARN_NPM_REGISTRY_SERVER: REGISTRY,
  YARN_UNSAFE_HTTP_WHITELIST: 'localhost',
  YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
  YARN_ENABLE_GLOBAL_CACHE: 'false',
  npm_config_user_agent: undefined,
  EASY_CMS_ADMIN_PASSWORD: 'smoke-admin-password',
}
// Bun reads its registry from bunfig or .npmrc; the env var covers `bun create`'s install.
writeFileSync(join(root, '.npmrc'), `registry=${REGISTRY}\n`)

function run(command: string, args: string[], cwd: string, extra: NodeJS.ProcessEnv = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  return new Promise<void>((done, fail) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...env, ...extra },
      stdio: 'inherit',
      shell: windows,
    })
    child.on('error', fail)
    child.on('close', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} exited with ${code}`)),
    )
  })
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
console.log(`\n✓ installed with ${PM} (${lock})`)

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

// 3. The production server (`start`), until /healthz answers.
const port = String(4000 + Math.floor(Math.random() * 1000))
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
const stop = () => {
  if (windows) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'])
  else if (server.pid) process.kill(-server.pid, 'SIGTERM')
}
try {
  let ok = false
  for (let i = 0; i < 60 && !ok; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    ok = await fetch(`http://localhost:${port}/healthz`)
      .then((r) => r.ok)
      .catch(() => false)
  }
  if (!ok) throw new Error('the server did not answer /healthz')
  const init = (await (await fetch(`http://localhost:${port}/api/cms/users/init`)).json()) as {
    hasUsers?: boolean
  }
  if (init.hasUsers !== true) throw new Error(`expected the admin: ${JSON.stringify(init)}`)
  console.log(`\n✓ ${PM}: created, installed, migrated and served`)
} finally {
  stop()
}
process.exit(0)
