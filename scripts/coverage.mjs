// Measures test coverage of the server packages: `pnpm coverage`, and the coverage job in CI.
//
// The packages are built with source maps, then every package's vitest suite runs with coverage.
// Most code is reached through other packages' dist (the integration suite imports the built
// @easy-cms/core), so coverage includes dist and the maps carry it back to src. The reports are
// merged into coverage/lcov.info with repo-relative paths, for Codecov, and summed per package.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Not measured: the admin is a Vue app (its tests are e2e), integration holds only tests, and the
// Nuxt module's tests run a Nuxt server in another process, out of coverage's sight.
const skip = new Set(['admin', 'integration', 'nuxt'])

function run(args) {
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit' })
  return result.status ?? 1
}

// Packages only: the examples and templates are apps, built with `next build` or `nuxt build`.
if (run(['turbo', 'run', 'build', '--filter=./packages/*', '--', '--sourcemap']) !== 0)
  process.exit(1)
// --only: the build with maps above stays; a test's usual build would replace it.
const tests = run([
  'turbo',
  'run',
  'test',
  '--only',
  '--continue',
  // The reports are not cached outputs: always run.
  '--force',
  '--filter=./packages/*',
  '--filter=!@easy-cms/admin',
  '--',
  '--coverage.enabled',
  '--coverage.provider=v8',
  '--coverage.reporter=lcovonly',
  '--coverage.reportsDirectory=coverage',
  '--coverage.allowExternal',
  // The package's own src (its unit tests), and other packages' src and dist (imported).
  '--coverage.include=src/**',
  '--coverage.include=**/packages/*/src/**',
  '--coverage.include=**/packages/*/dist/**',
])

/** file → { lines: line → hits, fns: name → { line, hits }, branches: key → hits } */
const files = new Map()
for (const pkg of readdirSync(join(root, 'packages'))) {
  const report = join(root, 'packages', pkg, 'coverage', 'lcov.info')
  if (!existsSync(report)) continue
  let file = null
  for (const line of readFileSync(report, 'utf8').split('\n')) {
    const [tag, value = ''] = line.split(/:(.*)/s)
    if (tag === 'SF') {
      const path = relative(root, resolve(root, 'packages', pkg, value)).replaceAll('\\', '/')
      const [, owner] = path.match(/^packages\/([^/]+)\/src\//) ?? []
      file = owner && !skip.has(owner) && !path.endsWith('.d.ts') ? path : null
      if (file && !files.has(file))
        files.set(file, { lines: new Map(), fns: new Map(), branches: new Map() })
      continue
    }
    if (!file) continue
    if (tag === 'DA') {
      const [n, hits] = value.split(',')
      const { lines } = files.get(file)
      lines.set(Number(n), (lines.get(Number(n)) ?? 0) + Number(hits))
    } else if (tag === 'FN') {
      const [n, name] = value.split(/,(.*)/s)
      const { fns } = files.get(file)
      if (!fns.has(name)) fns.set(name, { line: Number(n), hits: 0 })
    } else if (tag === 'FNDA') {
      const [hits, name] = value.split(/,(.*)/s)
      const fn = files.get(file).fns.get(name)
      if (fn) fn.hits += Number(hits)
    } else if (tag === 'BRDA') {
      const [n, block, branch, hits] = value.split(',')
      const { branches } = files.get(file)
      const key = `${n},${block},${branch}`
      branches.set(key, (branches.get(key) ?? 0) + (hits === '-' ? 0 : Number(hits)))
    } else if (tag === 'end_of_record') file = null
  }
}

const out = []
const totals = new Map()
for (const [file, { lines, fns, branches }] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
  out.push('TN:', `SF:${file}`)
  for (const [name, fn] of fns) out.push(`FN:${fn.line},${name}`)
  for (const [name, fn] of fns) out.push(`FNDA:${fn.hits},${name}`)
  out.push(`FNF:${fns.size}`, `FNH:${[...fns.values()].filter((fn) => fn.hits > 0).length}`)
  for (const [key, hits] of branches) out.push(`BRDA:${key},${hits}`)
  const branchesHit = [...branches.values()].filter((hits) => hits > 0).length
  out.push(`BRF:${branches.size}`, `BRH:${branchesHit}`)
  const sorted = [...lines].sort(([a], [b]) => a - b)
  for (const [n, hits] of sorted) out.push(`DA:${n},${hits}`)
  const hit = sorted.filter(([, hits]) => hits > 0).length
  out.push(`LF:${lines.size}`, `LH:${hit}`, 'end_of_record')

  const pkg = file.split('/')[1]
  const total = totals.get(pkg) ?? { found: 0, hit: 0 }
  total.found += lines.size
  total.hit += hit
  totals.set(pkg, total)
}
mkdirSync(join(root, 'coverage'), { recursive: true })
writeFileSync(join(root, 'coverage', 'lcov.info'), `${out.join('\n')}\n`)

const percent = ({ found, hit }) => (found ? ((hit / found) * 100).toFixed(1) : '-').padStart(6)
console.log('\nLine coverage (coverage/lcov.info):')
for (const [pkg, total] of [...totals].sort(([a], [b]) => a.localeCompare(b)))
  console.log(`  ${pkg.padEnd(24)}${percent(total)}%`)
const all = [...totals.values()].reduce(
  (a, b) => ({ found: a.found + b.found, hit: a.hit + b.hit }),
  { found: 0, hit: 0 },
)
console.log(`  ${'all'.padEnd(24)}${percent(all)}%`)
// Coverage is reported, not enforced: the exit code is the tests'.
process.exit(tests)
