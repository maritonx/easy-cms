import { createRestHandler, defineConfig, resolveConfig, ValidationError } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Core pieces a hierarchy needs: slugs unique per parent, filtered choices, a tree list. */
const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'pages',
      access: { read: () => true },
      useAsTitle: 'title',
      admin: { list: { tree: 'parent', sort: 'title' } },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'slug', from: 'title', uniqueWithin: 'parent' },
        {
          name: 'parent',
          type: 'relationship',
          to: 'pages',
          // Not itself, and not a page marked `locked`.
          filterOptions: ({ id }) => ({
            and: [
              ...(id === undefined ? [] : [{ id: { not_equals: id } }]),
              { locked: { not_equals: true } },
            ],
          }),
        },
        { name: 'locked', type: 'boolean' },
      ],
    },
  ],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
beforeAll(async () => {
  cms = await open(config)
})
afterAll(() => cms.destroy())

describe('slug uniqueWithin', () => {
  it('keeps slugs unique only among documents with the same parent', async () => {
    const about = await cms.create('pages', { title: 'About' })
    const careers = await cms.create('pages', { title: 'Careers' })
    const a = await cms.create('pages', { title: 'Team', parent: about.id })
    const b = await cms.create('pages', { title: 'Team', parent: careers.id })
    const c = await cms.create('pages', { title: 'Team', parent: about.id })
    const root = await cms.create('pages', { title: 'Team' })
    const root2 = await cms.create('pages', { title: 'Team' })
    expect([a.slug, b.slug, c.slug, root.slug, root2.slug]).toEqual([
      'team',
      'team',
      'team-2',
      'team',
      'team-2',
    ])
    // Moving a page under a parent that has the slug already renames it.
    const moved = await cms.update('pages', root.id, { parent: careers.id })
    expect(moved.slug).toBe('team-2')
  })

  it('checks its option', async () => {
    const bad = (uniqueWithin: string) =>
      resolveConfig(
        defineConfig({
          secret: SECRET,
          db: db(),
          collections: [
            {
              slug: 'x',
              fields: [
                { name: 'slug', type: 'slug', uniqueWithin },
                { name: 'tags', type: 'select', options: ['a'], hasMany: true },
              ],
            },
          ],
        }),
      )
    await expect(bad('nope')).rejects.toThrow(/uniqueWithin.*no sibling field/s)
    await expect(bad('tags')).rejects.toThrow(/uniqueWithin.*single, unlocalized/s)
  })
})

describe('relationship filterOptions', () => {
  it('refuses a choice the filter leaves out', async () => {
    const page = await cms.create('pages', { title: 'Self' })
    const locked = await cms.create('pages', { title: 'Locked', locked: true })
    const error = await cms.update('pages', page.id, { parent: page.id }).catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect(error.errors).toEqual([
      { field: 'parent', message: 'is not one of the allowed choices' },
    ])
    await expect(cms.create('pages', { title: 'Child', parent: locked.id })).rejects.toThrow(
      /allowed choices/,
    )
  })

  it('narrows the REST list for the admin picker', async () => {
    const handle = createRestHandler(cms)
    const get = async (query: string) => {
      const response = await handle(new Request(`http://cms.test/api/cms/pages?limit=100${query}`))
      return {
        status: response.status,
        body: (await response.json()) as {
          docs: { id: number; locked?: boolean }[]
          totalDocs: number
        },
      }
    }
    const page = await cms.create('pages', { title: 'Picker' })
    const all = await get('')
    const filtered = await get(`&filterFor=pages.parent&filterId=${page.id}`)
    const ids = filtered.body.docs.map((d) => d.id)
    expect(ids).not.toContain(page.id)
    expect(filtered.body.docs.every((d) => d.locked !== true)).toBe(true)
    expect(filtered.body.totalDocs).toBeLessThan(all.body.totalDocs)
    // A new document: only the rest of the filter applies.
    const creating = await get('&filterFor=pages.parent')
    expect(creating.body.docs.map((d) => d.id)).toContain(page.id)
    // It narrows the caller's own `where` rather than replacing it.
    const both = await get(`&filterFor=pages.parent&where[title][equals]=Picker`)
    expect(both.body.totalDocs).toBe(1)
    expect((await get('&filterFor=pages.title')).status).toBe(400)
    expect((await get('&filterFor=nope.parent')).status).toBe(400)
  })
})

describe('admin.list', () => {
  it('is kept in the resolved config', async () => {
    const resolved = await resolveConfig(config)
    expect(resolved.collections.find((c) => c.slug === 'pages')?.admin?.list).toEqual({
      tree: 'parent',
      sort: 'title',
    })
  })

  it('needs a relationship to the same collection for the tree', async () => {
    const bad = resolveConfig(
      defineConfig({
        secret: SECRET,
        db: db(),
        collections: [
          {
            slug: 'x',
            admin: { list: { tree: 'title' } },
            fields: [{ name: 'title', type: 'text' }],
          },
        ],
      }),
    )
    await expect(bad).rejects.toThrow(/admin\.list\.tree.*relationship field to "x"/s)
  })
})

describe('update({ live: true })', () => {
  it('changes the live document and keeps the pending draft', async () => {
    const drafts = defineConfig({
      secret: SECRET,
      db: db(),
      collections: [
        {
          slug: 'docs',
          drafts: true,
          versions: true,
          access: { read: () => true },
          fields: [
            { name: 'title', type: 'text' },
            { name: 'path', type: 'text' },
          ],
        },
      ],
    })
    const other = await open(drafts)
    try {
      const doc = await other.create('docs', { title: 'Live', path: '/a', status: 'published' })
      await other.update('docs', doc.id, { title: 'Draft', status: 'draft' })
      const updated = await other.update('docs', doc.id, { path: '/b' }, { live: true })
      expect(updated).toMatchObject({ title: 'Live', path: '/b', status: 'published' })
      expect(await other.findById('docs', doc.id)).toMatchObject({ title: 'Live', path: '/b' })
      // The draft is still pending, with its own edits.
      expect(await other.findById('docs', doc.id, { draft: true })).toMatchObject({
        title: 'Draft',
        status: 'draft',
      })
      // Without a pending draft it is a normal save.
      const plain = await other.create('docs', { title: 'P', status: 'published' })
      await other.update('docs', plain.id, { path: '/p', status: 'draft' }, { live: true })
      expect(await other.findById('docs', plain.id)).toMatchObject({
        path: '/p',
        status: 'published',
      })
    } finally {
      await other.destroy()
    }
  })
})
