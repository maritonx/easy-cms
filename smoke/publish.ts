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

// A version npmjs doesn't have, so a package manager that reads another registry fails instead
// of quietly installing the released packages.
const dirs = readdirSync(join(ROOT, 'packages'))
  .map((name) => join(ROOT, 'packages', name))
  .filter((dir) => !JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).private)
const original = new Map(dirs.map((dir) => [dir, readFileSync(join(dir, 'package.json'), 'utf8')]))
const base = JSON.parse(original.get(join(ROOT, 'packages', 'core')) as string).version
const version = `${base}-smoke.${Date.now()}`
writeFileSync(join(ROOT, 'smoke', '.registry', 'version'), version)
try {
  for (const [dir, text] of original)
    writeFileSync(
      join(dir, 'package.json'),
      text.replace(/"version": "[^"]+"/, `"version": "${version}"`),
    )
  for (const dir of dirs) {
    // pnpm turns `workspace:^` into `^<version>`, like the real release.
    execFileSync(
      'pnpm',
      ['publish', '--registry', REGISTRY, '--no-git-checks', '--tag', 'latest'],
      {
        cwd: dir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: { ...process.env, npm_config_userconfig: npmrc },
      },
    )
  }
} finally {
  for (const [dir, text] of original) writeFileSync(join(dir, 'package.json'), text)
}
console.log(`Published ${dirs.length} packages as ${version}`)
