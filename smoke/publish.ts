// Publishes every public package of the repo to the smoke-test registry (run `pnpm build` first).
//   node smoke/publish.ts [registry]
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REGISTRY = process.argv[2] ?? 'http://localhost:4873'
const ROOT = join(import.meta.dirname, '..')

// A user for the registry: npm clients won't publish without a token.
const response = await fetch(`${REGISTRY}/-/user/org.couchdb.user:smoke`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'smoke', password: 'smoke-password' }),
})
const { token } = (await response.json()) as { token?: string }
if (!token) throw new Error(`no registry token (${response.status})`)
const npmrc = join(ROOT, 'smoke', '.registry', '.npmrc')
writeFileSync(npmrc, `//${new URL(REGISTRY).host}/:_authToken=${token}\n`)

for (const name of readdirSync(join(ROOT, 'packages'))) {
  const dir = join(ROOT, 'packages', name)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (pkg.private) continue
  // pnpm turns `workspace:^` into the version, like the real release.
  execFileSync('pnpm', ['publish', '--registry', REGISTRY, '--no-git-checks', '--tag', 'latest'], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, npm_config_userconfig: npmrc },
  })
}
