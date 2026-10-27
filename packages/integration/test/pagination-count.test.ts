import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  silentLogger,
} from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'notes',
      access: { read: () => true },
      fields: [{ name: 'n', type: 'number' }],
    },
  ],
})

async function seeded(count: number, extra: Partial<Config> = {}, cwd = tempProject()) {
  const cms = await open({ ...config, ...extra } as typeof config, cwd)
  for (let n = 0; n < count; n++) await cms.create('notes', { n })
  return cms
}

describe('pagination without counting (#231)', () => {
  it('skips the totals with count: false and still knows about the next page', async () => {
    const cms = await seeded(5)
    const first = await cms.find('notes', { limit: 2, count: false, sort: 'n' })
    expect(first).toMatchObject({
      totalDocs: null,
      totalPages: null,
      page: 1,
      limit: 2,
      hasNextPage: true,
      hasPrevPage: false,
    })
    expect(first.docs.map((d) => d.n)).toEqual([0, 1])
    const last = await cms.find('notes', { limit: 2, page: 3, count: false, sort: 'n' })
    expect(last).toMatchObject({ hasNextPage: false, hasPrevPage: true })
    expect(last.docs.map((d) => d.n)).toEqual([4])
    // An exact page: no next page, although the page is full.
    const exact = await cms.find('notes', { limit: 5, count: false })
    expect(exact).toMatchObject({ hasNextPage: false })
    expect(exact.docs).toHaveLength(5)
    // The default still counts.
    expect(await cms.find('notes', { limit: 2 })).toMatchObject({ totalDocs: 5, totalPages: 3 })
    await cms.destroy()
  })

  it('takes ?count=false over REST, and refuses other values', async () => {
    const cms = await seeded(3)
    const handle = createRestHandler(cms)
    const get = (q: string) => handle(new Request(`http://cms.test/api/cms/notes?${q}`))
    expect(await (await get('limit=2&count=false')).json()).toMatchObject({
      totalDocs: null,
      totalPages: null,
      hasNextPage: true,
    })
    expect(await (await get('limit=2&count=true')).json()).toMatchObject({ totalDocs: 3 })
    expect((await get('count=maybe')).status).toBe(400)
    await cms.destroy()
  })

  it('reuses a total for countCacheSeconds, writes included, with current documents', async () => {
    const cwd = tempProject()
    const cms = await seeded(4, { countCacheSeconds: 0.3 }, cwd)
    // Another instance on the same database, as on a second server.
    const other = await createEasyCMS(config, {
      cwd,
      schema: 'skip',
      scheduler: false,
      logger: silentLogger,
    })
    expect((await cms.find('notes', { limit: 2 })).totalDocs).toBe(4)
    await other.create('notes', { n: 99 })
    await cms.create('notes', { n: 100 })
    // The total is reused (a full page needs it), the documents are not.
    const page = await cms.find('notes', { limit: 2, sort: '-n' })
    expect(page.totalDocs).toBe(4)
    expect(page.docs.map((d) => d.n)).toEqual([100, 99])
    // Counting directly is never cached.
    expect(await cms.count('notes')).toBe(6)
    await new Promise((r) => setTimeout(r, 400))
    expect((await cms.find('notes', { limit: 2 })).totalDocs).toBe(6)
    await other.destroy()
    await cms.destroy()
  })

  it('counts every time with countCacheSeconds: 0', async () => {
    const cwd = tempProject()
    const cms = await seeded(2, { countCacheSeconds: 0 }, cwd)
    const other = await createEasyCMS(config, {
      cwd,
      schema: 'skip',
      scheduler: false,
      logger: silentLogger,
    })
    expect((await cms.find('notes', { limit: 1 })).totalDocs).toBe(2)
    await other.create('notes', { n: 3 })
    expect((await cms.find('notes', { limit: 1 })).totalDocs).toBe(3)
    await other.destroy()
    await cms.destroy()
  })
})
