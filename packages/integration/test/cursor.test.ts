import { type Config, createRestHandler, defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  localization: { locales: ['en', 'th'], defaultLocale: 'en' },
  collections: [
    {
      slug: 'items',
      access: { read: () => true },
      fields: [
        { name: 'n', type: 'number' },
        { name: 'group', type: 'text' },
        { name: 'title', type: 'text', localized: true },
        {
          name: 'layout',
          type: 'blocks',
          blocks: [{ slug: 'text', fields: [{ name: 'body', type: 'text' }] }],
        },
      ],
    },
  ],
})

async function seeded(extra: Partial<Config> = {}) {
  const cms = await open({ ...config, ...extra } as typeof config)
  // Duplicates and nulls on purpose: the id breaks ties, and nulls must keep their place.
  const values = [3, null, 1, 3, 2, null, 5, 1, 4, 2, null]
  for (const [i, n] of values.entries())
    await cms.create('items', { n, group: i % 2 ? 'odd' : 'even', title: `Item ${i}` } as never)
  return cms
}

/** Every page, by cursor, as one list of ids. */
async function walk(cms: Awaited<ReturnType<typeof seeded>>, options: Record<string, unknown>) {
  const ids: unknown[] = []
  let cursor = ''
  for (let pages = 0; pages < 50; pages++) {
    const page = await cms.find('items', { ...options, limit: 3, cursor } as never)
    expect(page.docs.length).toBeLessThanOrEqual(3)
    ids.push(...page.docs.map((d: { id: unknown }) => d.id))
    if (!page.nextCursor) {
      expect(page.hasNextPage).toBe(false)
      return ids
    }
    expect(page.hasNextPage).toBe(true)
    cursor = page.nextCursor
  }
  throw new Error('cursor did not end')
}

describe('cursor pagination (#175)', () => {
  it.each([
    ['the default sort', {}],
    ['a number, ascending, with nulls', { sort: 'n' }],
    ['a number, descending, with nulls', { sort: '-n' }],
    ['two fields', { sort: ['group', '-n'] }],
    ['a localized field', { sort: 'title', locale: 'th' }],
    ['a filter', { sort: 'n', where: { group: { equals: 'odd' } } }],
  ])('pages through everything in the same order as one read: %s', async (_, options) => {
    const cms = await seeded()
    const all = await cms.find('items', { ...options, limit: 0 } as never)
    expect(await walk(cms, options)).toEqual(all.docs.map((d) => d.id))
    await cms.destroy()
  })

  it('has no totals or page numbers, and says whether it started after the first', async () => {
    const cms = await seeded()
    const first = await cms.find('items', { limit: 4, cursor: '' })
    expect(first).toMatchObject({
      totalDocs: null,
      totalPages: null,
      page: null,
      limit: 4,
      hasPrevPage: false,
      hasNextPage: true,
    })
    const second = await cms.find('items', { limit: 4, cursor: first.nextCursor as string })
    expect(second.hasPrevPage).toBe(true)
    await cms.destroy()
  })

  it('refuses a cursor from another query, a broken one, page with it, and sorts it cannot follow', async () => {
    const cms = await seeded()
    const { nextCursor } = await cms.find('items', { limit: 2, cursor: '', sort: 'n' })
    await expect(
      cms.find('items', { limit: 2, cursor: nextCursor as string, sort: '-n' }),
    ).rejects.toThrow('another query')
    await expect(cms.find('items', { limit: 2, cursor: 'not-a-cursor' })).rejects.toThrow(
      'not a cursor',
    )
    await expect(cms.find('items', { limit: 2, cursor: '', page: 2 } as never)).rejects.toThrow(
      'either cursor or page',
    )
    await expect(
      cms.find('items', { limit: 2, cursor: '', sort: 'layout.body' } as never),
    ).rejects.toThrow("can't follow a sort")
    await cms.destroy()
  })

  it('takes ?cursor= over REST, and maxPage stops API clients on deep pages', async () => {
    const cms = await seeded({ maxPage: 2 })
    const handle = createRestHandler(cms)
    const get = (q: string) => handle(new Request(`http://cms.test/api/cms/items?${q}`))
    const first = (await (await get('limit=4&cursor=')).json()) as { nextCursor: string }
    expect(first.nextCursor).toEqual(expect.any(String))
    const next = await get(`limit=4&cursor=${encodeURIComponent(first.nextCursor)}`)
    expect(next.status).toBe(200)
    expect((await get('limit=4&cursor=&page=2')).status).toBe(400)
    expect((await get('limit=4&page=2')).status).toBe(200)
    const deep = await get('limit=4&page=3')
    expect(deep.status).toBe(400)
    expect(await deep.text()).toContain('use cursor')
    await cms.destroy()
  })
})
