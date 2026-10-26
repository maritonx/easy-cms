// Compares tonight's results with earlier nights: `node perf/compare.ts <results.json> [dir]`,
// where dir holds earlier results.json files (one per subfolder or file). A kind of request whose
// p95 is more than 20% above the median of the last 7 nights fails the run. Writes a Markdown
// table to stdout (and to GITHUB_STEP_SUMMARY in Actions).
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface Scenario {
  name: string
  count: number
  p50: number
  p95: number
  p99: number
  errors: number
}
interface Results {
  at: string
  docs: number
  users: number
  scenarios: Scenario[]
}

const LIMIT = 1.2
const TARGET_MS = 200
const [current, dir] = process.argv.slice(2)
if (!current) throw new Error('Pass the results file')
const tonight = JSON.parse(readFileSync(current, 'utf8')) as Results

function files(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name)
    if (statSync(full).isDirectory()) return files(full)
    return name.endsWith('.json') ? [full] : []
  })
}
const earlier = (dir ? files(dir) : [])
  .map((file) => JSON.parse(readFileSync(file, 'utf8')) as Results)
  .filter((r) => r.docs === tonight.docs && r.users === tonight.users && r.at < tonight.at)
  .sort((a, b) => b.at.localeCompare(a.at))
  .slice(0, 7)

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

const slower: string[] = []
const rows = tonight.scenarios.map((s) => {
  const before = earlier.flatMap((r) =>
    r.scenarios.filter((e) => e.name === s.name).map((e) => e.p95),
  )
  const base = before.length ? median(before) : null
  const change = base ? s.p95 / base : null
  if (change !== null && change > LIMIT) slower.push(s.name)
  const vs = change === null ? '—' : `${change >= 1 ? '+' : ''}${((change - 1) * 100).toFixed(0)}%`
  const flag = change !== null && change > LIMIT ? ' ❌' : ''
  return `| ${s.name} | ${s.count} | ${s.p50} | ${s.p95}${s.p95 > TARGET_MS ? ' ⚠️' : ''} | ${s.p99} | ${s.errors} | ${base === null ? '—' : base.toFixed(1)} | ${vs}${flag} |`
})
const table = [
  `### ${tonight.docs.toLocaleString('en')} posts, ${tonight.users} editors`,
  '',
  `p95 compared with the median of the last ${earlier.length} night(s); ⚠️ over the ${TARGET_MS} ms target, ❌ more than ${Math.round((LIMIT - 1) * 100)}% slower.`,
  '',
  '| Request | Count | p50 ms | p95 ms | p99 ms | Errors | Median p95 before | Change |',
  '|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
].join('\n')
console.log(table)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`)
if (slower.length) {
  console.error(
    `More than ${Math.round((LIMIT - 1) * 100)}% slower than usual: ${slower.join(', ')}`,
  )
  process.exit(1)
}
