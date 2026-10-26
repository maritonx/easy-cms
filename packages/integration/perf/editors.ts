// Editors at work, against a running server: `node perf/editors.ts <results.json>`, with
// BASE_URL (default http://127.0.0.1:4000), PERF_PASSWORD, PERF_USERS (200), PERF_SECONDS (300)
// and PERF_DOCS. Each editor signs in, then sends a request, waits 1 to 3 seconds, and again:
// 90% reads, 10% saves. Latencies are per kind of request, after a 30-second warm-up.
import { writeFileSync } from 'node:fs'
import { TAGS } from './schema.ts'

const BASE = `${process.env.BASE_URL ?? 'http://127.0.0.1:4000'}/api/cms`
const USERS = Number(process.env.PERF_USERS ?? 200)
const SECONDS = Number(process.env.PERF_SECONDS ?? 300)
const WARMUP = Number(process.env.PERF_WARMUP ?? 30)
const DOCS = Number(process.env.PERF_DOCS ?? 1_000_000)
const PASSWORD = process.env.PERF_PASSWORD
const out = process.argv[2]
if (!PASSWORD || !out) throw new Error('Set PERF_PASSWORD and pass the results file')

interface Session {
  headers: Record<string, string>
}

async function signIn(): Promise<Session> {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'editor@perf.test', password: PASSWORD }),
  })
  if (!response.ok) throw new Error(`sign-in: ${response.status} ${await response.text()}`)
  // `__Host-` over HTTPS or in production.
  const cookie = response.headers
    .getSetCookie()
    .find((c) => /^(__Host-)?ecms-session=/.test(c))
    ?.split(';')[0] as string
  const { csrfToken } = (await response.json()) as { csrfToken: string }
  return { headers: { cookie, 'x-csrf-token': csrfToken, origin: new URL(BASE).origin } }
}

const rand = (n: number) => Math.floor(Math.random() * n)
const first = await signIn()
const newest = (await (await fetch(`${BASE}/posts?sort=-id&limit=1&draft=true`, first)).json()) as {
  docs: { id: number }[]
}
const maxId = newest.docs[0]?.id ?? DOCS
const pages = Math.floor((DOCS * 0.8) / 10)

type Kind = { name: string; write: boolean; weight: number; run: (s: Session) => Promise<Response> }
const get = (s: Session, path: string) => fetch(`${BASE}${path}`, { headers: s.headers })
const patch = (s: Session, path: string, body: unknown) =>
  fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { ...s.headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const KINDS: Kind[] = [
  {
    name: 'list a page',
    write: false,
    weight: 30,
    run: (s) => get(s, `/posts?limit=10&page=${1 + rand(pages)}&locale=en`),
  },
  {
    name: 'open by id',
    write: false,
    weight: 25,
    run: (s) => get(s, `/posts/${1 + rand(maxId)}?depth=1&draft=true`),
  },
  {
    name: 'find by slug',
    write: false,
    weight: 15,
    run: (s) => get(s, `/posts?where[slug][equals]=post-${rand(DOCS)}&locale=en&limit=1`),
  },
  {
    name: 'filter and sort',
    write: false,
    weight: 10,
    run: (s) => get(s, `/posts?where[tags][equals]=${TAGS[rand(4)]}&sort=-publishedAt&limit=10`),
  },
  {
    name: 'admin list with drafts',
    write: false,
    weight: 10,
    run: (s) => get(s, `/posts?limit=20&draft=true&page=${1 + rand(100)}`),
  },
  {
    name: 'save a draft',
    write: true,
    weight: 7,
    run: (s) =>
      patch(s, `/posts/${1 + rand(maxId)}?draft=true`, {
        title: `Edited ${rand(1e6)}`,
        status: 'draft',
      }),
  },
  {
    name: 'publish',
    write: true,
    weight: 3,
    run: (s) => patch(s, `/posts/${1 + rand(maxId)}`, { views: rand(10_000), status: 'published' }),
  },
]
const total = KINDS.reduce((sum, k) => sum + k.weight, 0)
const pick = () => {
  let r = Math.random() * total
  for (const kind of KINDS) {
    r -= kind.weight
    if (r < 0) return kind
  }
  return KINDS[0] as Kind
}

const times = new Map<string, number[]>(KINDS.map((k) => [k.name, []]))
const errors = new Map<string, number>(KINDS.map((k) => [k.name, 0]))
const started = performance.now()
const measureFrom = started + WARMUP * 1000
const until = measureFrom + SECONDS * 1000

async function editor(index: number) {
  // Spread the sign-ins over the first seconds, as people arrive.
  await new Promise((r) => setTimeout(r, (index / USERS) * 5000))
  const session = await signIn()
  while (performance.now() < until) {
    const kind = pick()
    const t = performance.now()
    let ok = false
    try {
      const response = await kind.run(session)
      await response.arrayBuffer()
      // A random id can be missing: that is an answer, not a failure.
      ok = response.ok || response.status === 404
    } catch {}
    if (t >= measureFrom) {
      if (ok) times.get(kind.name)?.push(performance.now() - t)
      else errors.set(kind.name, (errors.get(kind.name) ?? 0) + 1)
    }
    await new Promise((r) => setTimeout(r, 1000 + rand(2000)))
  }
}

console.log(
  `${USERS} editors for ${SECONDS}s after ${WARMUP}s warm-up, ${DOCS.toLocaleString()} posts`,
)
await Promise.all(Array.from({ length: USERS }, (_, i) => editor(i)))

const quantile = (sorted: number[], p: number) =>
  Number((sorted[Math.floor(p * (sorted.length - 1))] ?? 0).toFixed(1))
function summary(name: string, values: number[], failed: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    name,
    count: sorted.length,
    rps: Number((sorted.length / SECONDS).toFixed(1)),
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    errors: failed,
  }
}
const byKind = KINDS.map((k) => summary(k.name, times.get(k.name) ?? [], errors.get(k.name) ?? 0))
const all = (write: boolean) =>
  KINDS.filter((k) => k.write === write).flatMap((k) => times.get(k.name) ?? [])
const errorsOf = (write: boolean) =>
  KINDS.filter((k) => k.write === write).reduce((sum, k) => sum + (errors.get(k.name) ?? 0), 0)
const results = {
  at: new Date().toISOString(),
  docs: DOCS,
  users: USERS,
  seconds: SECONDS,
  scenarios: [
    summary('all reads', all(false), errorsOf(false)),
    summary('all saves', all(true), errorsOf(true)),
    ...byKind,
  ],
}
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`)
for (const s of results.scenarios)
  console.log(
    `${s.name.padEnd(24)} ${String(s.count).padStart(7)} req  p50 ${s.p50} ms  p95 ${s.p95} ms  p99 ${s.p99} ms${s.errors ? `  errors ${s.errors}` : ''}`,
  )
