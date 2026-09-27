// Load test: a realistic schema with many documents, under concurrent requests.
// Run: POSTGRES_URL=postgres://... node load.ts [documents=100000] [seconds=15] [concurrency=20]
// Reuses the seeded tables of an earlier run with the same size (prefix `load<documents>_`).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEasyCMS, createRestHandler, defineConfig, silentLogger } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'

const url = process.env.POSTGRES_URL
if (!url) throw new Error('Set POSTGRES_URL')
const DOCS = Number(process.argv[2] ?? 100_000)
const SECONDS = Number(process.argv[3] ?? 15)
const CONCURRENCY = Number(process.argv[4] ?? 20)
const POOL = Number(process.env.POOL ?? 10)

const config = defineConfig({
  secret: 's'.repeat(32),
  db: postgres({ url, max: POOL, tablePrefix: `load${DOCS}_` }),
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    { slug: 'authors', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
    {
      slug: 'categories',
      access: { read: () => true },
      fields: [{ name: 'name', type: 'text', localized: true }],
    },
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        { name: 'slug', type: 'slug', from: 'title', localized: true },
        { name: 'excerpt', type: 'textarea', localized: true },
        { name: 'views', type: 'number', index: true },
        { name: 'publishedAt', type: 'date', index: true },
        { name: 'author', type: 'relationship', to: 'authors' },
        { name: 'category', type: 'relationship', to: 'categories' },
        {
          name: 'tags',
          type: 'select',
          options: ['news', 'guide', 'review', 'event'],
          hasMany: true,
        },
        {
          name: 'seo',
          type: 'group',
          fields: [{ name: 'description', type: 'text', localized: true }],
        },
        {
          name: 'layout',
          type: 'blocks',
          blocks: [
            { slug: 'hero', fields: [{ name: 'heading', type: 'text', localized: true }] },
            { slug: 'text', fields: [{ name: 'body', type: 'textarea', localized: true }] },
            {
              slug: 'gallery',
              fields: [
                { name: 'items', type: 'array', fields: [{ name: 'caption', type: 'text' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
})

const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-load-'))
const cms = await createEasyCMS(config, { cwd, logger: silentLogger, scheduler: false })
const handle = createRestHandler(cms)

// --- Seed ------------------------------------------------------------------

async function pool<T>(count: number, parallel: number, run: (i: number) => Promise<T>) {
  let next = 0
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (next < count) await run(next++)
    }),
  )
}

const TAGS = ['news', 'guide', 'review', 'event'] as const
let authors = (await cms.find('authors', { limit: 0 })).docs.map((d) => d.id)
const categories = (await cms.find('categories', { limit: 0 })).docs.map((d) => d.id)
const existing = await cms.count('posts', { draft: true } as never)
if (existing < DOCS) {
  const t = performance.now()
  if (authors.length === 0) {
    for (let i = 0; i < 50; i++)
      authors.push((await cms.create('authors', { name: `Author ${i}` })).id)
    for (let i = 0; i < 20; i++)
      categories.push((await cms.create('categories', { name: `หมวด ${i}` })).id)
  }
  await pool(DOCS - existing, 16, async (n) => {
    const i = existing + n
    const post = await cms.create('posts', {
      title: `บทความที่ ${i}`,
      excerpt: 'เนื้อหาย่อ '.repeat(10),
      views: (i * 7919) % 10_000,
      publishedAt: new Date(Date.UTC(2024, 0, 1) + i * 60_000).toISOString(),
      author: authors[i % authors.length] as number,
      category: categories[i % categories.length] as number,
      tags: [TAGS[i % 4] as (typeof TAGS)[number], TAGS[(i + 1) % 4] as (typeof TAGS)[number]],
      seo: { description: `คำอธิบาย ${i}` },
      layout: [
        { blockType: i % 10 === 0 ? 'hero' : 'text', heading: `หัวข้อ ${i}`, body: 'ย่อหน้า' },
        { blockType: 'gallery', items: [{ caption: `ภาพ ${i}` }, { caption: 'ภาพสอง' }] },
      ] as never,
      status: i % 5 === 0 ? 'draft' : 'published',
    })
    await cms.update('posts', post.id, { title: `Post ${i}` }, { locale: 'en' })
    if ((n + 1) % 10_000 === 0) console.log(`  seeded ${n + 1}`)
  })
  console.log(`seeded ${DOCS - existing} posts in ${((performance.now() - t) / 1000).toFixed(0)}s`)
}
authors = (await cms.find('authors', { limit: 0 })).docs.map((d) => d.id)

const admin =
  (await cms.find('users', { limit: 1 })).docs[0] ??
  (await cms.create('users', {
    email: 'load@example.test',
    password: 'load-test-password',
    role: 'admin',
  } as never))
const { token } = await cms.auth.createSession(admin.id)
const maxId = (await cms.find('posts', { limit: 1, sort: '-id', draft: true } as never)).docs[0]
  ?.id as number

// --- Load ------------------------------------------------------------------

const rand = (n: number) => Math.floor(Math.random() * n)
const get = (path: string, auth = false) =>
  handle(
    new Request(
      `http://cms.test/api/cms${path}`,
      auth ? { headers: { authorization: `Bearer ${token}` } } : {},
    ),
  ).then(async (r) => {
    await r.arrayBuffer()
    if (r.status >= 400) throw new Error(`${path} → ${r.status}`)
  })
const send = (method: string, path: string, body: unknown) =>
  handle(
    new Request(`http://cms.test/api/cms${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  ).then(async (r) => {
    await r.arrayBuffer()
    if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status}`)
  })

interface Result {
  name: string
  rps: number
  p50: number
  p95: number
  p99: number
  errors: number
}

/** Closed loop: `CONCURRENCY` workers send requests back to back for `SECONDS`. */
async function scenario(name: string, request: () => Promise<unknown>): Promise<Result> {
  for (let i = 0; i < 20; i++) await request() // warm up
  const times: number[] = []
  let errors = 0
  const until = performance.now() + SECONDS * 1000
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (performance.now() < until) {
        const t = performance.now()
        try {
          await request()
          times.push(performance.now() - t)
        } catch {
          errors++
        }
      }
    }),
  )
  times.sort((a, b) => a - b)
  const q = (p: number) => Number((times[Math.floor(p * (times.length - 1))] ?? 0).toFixed(1))
  const result = {
    name,
    rps: Math.round(times.length / SECONDS),
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    errors,
  }
  console.log(
    `${name.padEnd(46)} ${String(result.rps).padStart(6)} req/s   p50 ${result.p50} ms   p95 ${result.p95} ms   p99 ${result.p99} ms${errors ? `   errors ${errors}` : ''}`,
  )
  return result
}

console.log(
  `\n${DOCS.toLocaleString()} posts, ${CONCURRENCY} concurrent requests, pool ${POOL}, ${SECONDS}s each\n`,
)
const pages = Math.floor((DOCS * 0.8) / 10)
const results = [
  await scenario('list page (limit 10, depth 1, en)', () =>
    get(`/posts?limit=10&page=${1 + rand(pages)}&locale=en`),
  ),
  await scenario('list first page, no count needed', () => get('/posts?limit=10&locale=en')),
  await scenario('by id (depth 2)', () => get(`/posts/${1 + rand(maxId)}?depth=2`).catch(() => {})),
  await scenario('by slug (where slug equals)', () =>
    get(`/posts?where[slug][equals]=post-${rand(DOCS)}&locale=en&limit=1`),
  ),
  await scenario('filter hasMany + sort by number', () =>
    get(`/posts?where[tags][equals]=${TAGS[rand(4)]}&sort=-views&limit=10`),
  ),
  await scenario('filter relationship + sort by date', () =>
    get(`/posts?where[author][equals]=${authors[rand(authors.length)]}&sort=-publishedAt&limit=10`),
  ),
  await scenario('text search (like)', () =>
    get(`/posts?where[title][like]=${rand(1000)}&locale=en&limit=10`),
  ),
  await scenario('inside blocks (layout.blockType)', () =>
    get(`/posts?where[layout.blockType][equals]=hero&limit=10&page=${1 + rand(100)}`),
  ),
  await scenario('admin list with drafts (logged in)', () =>
    get(`/posts?limit=20&draft=true&page=${1 + rand(100)}`, true),
  ),
  await scenario('save draft (versions, logged in)', () =>
    send('PATCH', `/posts/${1 + rand(maxId)}?draft=true`, {
      title: `Edited ${rand(1e6)}`,
      status: 'draft',
    }).catch(() => {}),
  ),
  await scenario('mixed: 95% reads, 5% saves', () =>
    Math.random() < 0.05
      ? send('PATCH', `/posts/${1 + rand(maxId)}`, { views: rand(10_000) }).catch(() => {})
      : get(`/posts?limit=10&page=${1 + rand(pages)}&locale=en`),
  ),
]
console.log(`\n${JSON.stringify(results)}`)
await cms.destroy()
