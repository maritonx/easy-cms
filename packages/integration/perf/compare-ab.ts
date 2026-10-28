// Compares the code under test with a base on the same runner, in the same run:
// `node perf/compare-ab.ts <dir>`, where dir holds the rounds the Perf workflow ran in the order
// base, head, head, base (ABBA): editors-<n>-<side>.json (perf/editors.ts) and
// scenarios-<n>-<side>.txt (load.ts, its last line the JSON results). A kind of request fails the
// run when head's p95 is more than LIMIT above base's in both halves; in one half, it is a
// warning. Runners differ by up to about 40% between runs, but the ratio within one run doesn't.
// Writes a Markdown table to stdout (and to GITHUB_STEP_SUMMARY in Actions).
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Side = 'base' | 'head'
interface Scenario {
  name: string
  p95: number
}

const LIMIT = Number(process.env.PERF_LIMIT ?? 1.25)
const dir = process.argv[2]
if (!dir) throw new Error('Pass the directory of the rounds')
const ROUNDS: [number, Side][] = [
  [1, 'base'],
  [2, 'head'],
  [3, 'head'],
  [4, 'base'],
]

/** p95 by request, for one round; empty when the round left no file. */
function round(n: number, side: Side): Map<string, number> {
  const out = new Map<string, number>()
  const editors = join(dir as string, `editors-${n}-${side}.json`)
  if (existsSync(editors))
    for (const s of (JSON.parse(readFileSync(editors, 'utf8')) as { scenarios: Scenario[] })
      .scenarios)
      out.set(`200 editors: ${s.name}`, s.p95)
  const scenarios = join(dir as string, `scenarios-${n}-${side}.txt`)
  if (existsSync(scenarios)) {
    const json = readFileSync(scenarios, 'utf8')
      .split('\n')
      .find((line) => line.startsWith('['))
    for (const s of JSON.parse(json ?? '[]') as Scenario[]) out.set(s.name, s.p95)
  }
  return out
}

const [b1, h1, h2, b2] = ROUNDS.map(([n, side]) => round(n, side)) as Map<string, number>[]
const names = [...new Set([...(b1?.keys() ?? []), ...(h1?.keys() ?? [])])]
const pct = (r: number) => `${r >= 1 ? '+' : ''}${((r - 1) * 100).toFixed(0)}%`

const failed: string[] = []
const warned: string[] = []
const rows = names.map((name) => {
  const pair = (base?: number, head?: number) => (base && head ? head / base : undefined)
  const first = pair(b1?.get(name), h1?.get(name))
  const second = pair(b2?.get(name), h2?.get(name))
  const over = [first, second].filter((r) => r !== undefined && r > LIMIT).length
  const both = first !== undefined && second !== undefined
  let mark = ''
  if (both && over === 2) {
    failed.push(name)
    mark = ' ❌'
  } else if (over > 0) {
    warned.push(name)
    mark = ' ⚠️'
  }
  const ms = (v?: number) => (v === undefined ? '—' : v.toFixed(1))
  return `| ${name} | ${ms(b1?.get(name))} | ${ms(h1?.get(name))} | ${ms(h2?.get(name))} | ${ms(b2?.get(name))} | ${first === undefined ? '—' : pct(first)} | ${second === undefined ? '—' : pct(second)}${mark} |`
})

const table = [
  '### Head against base, on this runner',
  '',
  `p95 in ms, rounds run base, head, head, base. ❌ head more than ${Math.round((LIMIT - 1) * 100)}% slower in both halves (fails the run), ⚠️ in one.`,
  '',
  '| Request | Base 1 | Head 1 | Head 2 | Base 2 | First half | Second half |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  '',
].join('\n')
console.log(table)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`)
if (names.length === 0) {
  console.error('No rounds found: nothing was compared')
  process.exit(1)
}
if (warned.length) console.log(`Slower in one half only: ${warned.join(', ')}`)
if (failed.length) {
  console.error(
    `More than ${Math.round((LIMIT - 1) * 100)}% slower than base in both halves: ${failed.join(', ')}`,
  )
  process.exit(1)
}
