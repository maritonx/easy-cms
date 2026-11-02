import { createRestHandler, defineConfig, ValidationError, type Where } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

// Relationships to several collections (#327): `to: ['posts', 'pages']`, values
// `{ relationTo, value }`.

const pages = {
  slug: 'pages',
  // Drafts only for editors: anonymous readers see none of them.
  access: { read: ({ user }: { user: unknown }) => user !== null },
  fields: [{ name: 'title', type: 'text' }],
} as const

const posts = {
  slug: 'posts',
  access: { read: () => true },
  fields: [{ name: 'title', type: 'text' }],
} as const

const menu = (localized = false) =>
  ({
    slug: 'menu-items',
    access: { read: () => true },
    fields: [
      { name: 'label', type: 'text' },
      { name: 'link', type: 'relationship', to: ['posts', 'pages'], localized },
      { name: 'related', type: 'relationship', to: ['posts', 'pages'], hasMany: true },
      {
        name: 'columns',
        type: 'array',
        fields: [{ name: 'target', type: 'relationship', to: ['posts', 'pages'] }],
      },
      {
        name: 'layout',
        type: 'blocks',
        blocks: [
          {
            slug: 'card',
            fields: [{ name: 'doc', type: 'relationship', to: ['posts', 'pages'] }],
          },
        ],
      },
    ],
  }) as const

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [posts, pages, menu()],
})

describe('relationships to several collections (#327)', () => {
  it('links a menu item to a post or a page, and populates each from its own collection', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'A post' })
    const page = await cms.create('pages', { title: 'About' })
    const item = await cms.create(
      'menu-items',
      {
        label: 'About',
        link: { relationTo: 'pages', value: page.id },
        related: [
          { relationTo: 'posts', value: post.id },
          { relationTo: 'pages', value: page.id },
        ],
        columns: [{ target: { relationTo: 'posts', value: post.id } }],
        layout: [{ blockType: 'card', doc: { relationTo: 'pages', value: page.id } }],
      },
      { depth: 0 },
    )
    expect(item.link).toEqual({ relationTo: 'pages', value: page.id })

    const flat = await cms.findById('menu-items', item.id, { depth: 0 })
    expect(flat?.related).toEqual([
      { relationTo: 'posts', value: post.id },
      { relationTo: 'pages', value: page.id },
    ])
    expect(flat?.columns[0]?.target).toEqual({ relationTo: 'posts', value: post.id })

    const full = await cms.findById('menu-items', item.id, { depth: 1 })
    expect(full?.link).toMatchObject({
      relationTo: 'pages',
      value: { id: page.id, title: 'About' },
    })
    expect(full?.related.map((r) => r.relationTo)).toEqual(['posts', 'pages'])
    expect(full?.layout[0]).toMatchObject({
      doc: { relationTo: 'pages', value: { title: 'About' } },
    })
    // Narrowed by relationTo.
    const link = full?.link
    if (link?.relationTo === 'pages' && typeof link.value === 'object')
      expect(link.value.title).toBe('About')

    // A populated document can be saved back as it was read.
    const saved = await cms.update(
      'menu-items',
      item.id,
      { link: full?.link as never },
      { depth: 0 },
    )
    expect(saved.link).toEqual({ relationTo: 'pages', value: page.id })
    // No link.
    expect((await cms.update('menu-items', item.id, { link: null })).link).toBeNull()
    await cms.destroy()
  })

  it('populates with each collection’s access: unreadable links are left out', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'Public' })
    const page = await cms.create('pages', { title: 'Members only' })
    const item = await cms.create('menu-items', {
      link: { relationTo: 'pages', value: page.id },
      related: [
        { relationTo: 'pages', value: page.id },
        { relationTo: 'posts', value: post.id },
      ],
    })
    const anonymous = { overrideAccess: false, user: null, depth: 1 }
    const read = await cms.findById('menu-items', item.id, anonymous)
    expect(read?.link).toBeNull()
    expect(read?.related).toEqual([
      { relationTo: 'posts', value: expect.objectContaining({ id: post.id }) },
    ])
    await cms.destroy()
  })

  it('refuses a collection the field does not link to, and a missing document', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'A' })
    const errorOf = (data: unknown) =>
      cms.create('menu-items', data as never).then(
        () => null,
        (e: unknown) => (e instanceof ValidationError ? e.errors[0] : e),
      )
    expect(await errorOf({ link: { relationTo: 'users', value: 1 } })).toMatchObject({
      field: 'link',
      message: expect.stringContaining('can\'t link to "users"'),
    })
    expect(await errorOf({ link: post.id })).toMatchObject({ field: 'link' })
    expect(await errorOf({ link: { relationTo: 'pages', value: 999 } })).toMatchObject({
      field: 'link',
      message: 'pages 999 does not exist',
    })
    await cms.destroy()
  })

  it('filters by relationTo and value, in the Local API and over REST', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'P' })
    const page = await cms.create('pages', { title: 'Q' })
    const toPost = await cms.create('menu-items', {
      label: 'to post',
      link: { relationTo: 'posts', value: post.id },
      related: [{ relationTo: 'posts', value: post.id }],
      layout: [{ blockType: 'card', doc: { relationTo: 'posts', value: post.id } }],
    })
    const toPage = await cms.create('menu-items', {
      label: 'to page',
      link: { relationTo: 'pages', value: page.id },
      related: [{ relationTo: 'pages', value: page.id }],
    })
    await cms.create('menu-items', { label: 'nowhere' })
    const labels = async (where: Where) =>
      (await cms.find('menu-items', { where, sort: 'label', depth: 0 })).docs.map((d) => d.label)

    expect(await labels({ 'link.relationTo': { equals: 'pages' } })).toEqual(['to page'])
    expect(
      await labels({ 'link.relationTo': { equals: 'posts' }, 'link.value': { equals: post.id } }),
    ).toEqual(['to post'])
    expect(await labels({ link: { exists: false } })).toEqual(['nowhere'])
    expect(await labels({ 'related.relationTo': { equals: 'pages' } })).toEqual(['to page'])
    // Ids repeat across collections (both are 1 here): a value alone matches both.
    expect(post.id).toBe(page.id)
    expect(await labels({ 'related.value': { in: [post.id] } })).toEqual(['to page', 'to post'])
    expect(await labels({ 'layout.doc.relationTo': { equals: 'posts' } })).toEqual(['to post'])
    // `link.<collection>`: that collection's documents, by id; in a list, on the same value.
    expect(await labels({ 'link.pages': { in: [page.id] } })).toEqual(['to page'])
    expect(await labels({ 'link.posts': { exists: true } })).toEqual(['to post'])
    expect(await labels({ 'link.posts': { not_equals: post.id } })).toEqual(['nowhere', 'to page'])
    expect(await labels({ 'related.posts': { equals: post.id } })).toEqual(['to post'])
    expect(await labels({ 'related.pages': { exists: false } })).toEqual(['nowhere', 'to post'])
    await expect(labels({ link: { equals: post.id } })).rejects.toThrow(
      /links to several collections: query "link.relationTo" and "link.value", or "link.<collection>"/,
    )

    const handle = createRestHandler(cms)
    const res = await handle(
      new Request(
        `http://cms.test/api/cms/menu-items?where[link.relationTo][equals]=pages&depth=0`,
      ),
    )
    expect(
      ((await res.json()) as { docs: { id: number }[] }).docs.map((d: { id: number }) => d.id),
    ).toEqual([toPage.id])
    expect(toPost.id).not.toBe(toPage.id)
    await cms.destroy()
  })

  it('gives filterOptions the collection it filters', async () => {
    const seen: string[] = []
    const filtered = defineConfig({
      secret: SECRET,
      db: db(),
      collections: [
        posts,
        pages,
        {
          slug: 'menu-items',
          fields: [
            {
              name: 'link',
              type: 'relationship',
              to: ['posts', 'pages'],
              filterOptions: ({ relationTo }) => {
                seen.push(relationTo)
                return relationTo === 'pages' ? { title: { equals: 'Allowed' } } : true
              },
            },
          ],
        },
      ],
    })
    const cms = await open(filtered)
    const post = await cms.create('posts', { title: 'Any' })
    const allowed = await cms.create('pages', { title: 'Allowed' })
    const other = await cms.create('pages', { title: 'Other' })
    await cms.create('menu-items', { link: { relationTo: 'posts', value: post.id } })
    await cms.create('menu-items', { link: { relationTo: 'pages', value: allowed.id } })
    await expect(
      cms.create('menu-items', { link: { relationTo: 'pages', value: other.id } }),
    ).rejects.toThrow(/allowed choices/)
    expect(new Set(seen)).toEqual(new Set(['posts', 'pages']))
    await cms.destroy()
  })

  it('keeps links per locale', async () => {
    const localized = defineConfig({
      secret: SECRET,
      db: db(),
      localization: { locales: ['en', 'th'], defaultLocale: 'en' },
      collections: [posts, pages, menu(true)],
    })
    const cms = await open(localized)
    const post = await cms.create('posts', { title: 'P' })
    const page = await cms.create('pages', { title: 'Q' })
    const item = await cms.create('menu-items', { link: { relationTo: 'posts', value: post.id } })
    await cms.update(
      'menu-items',
      item.id,
      { link: { relationTo: 'pages', value: page.id } },
      { locale: 'th' },
    )
    const all = await cms.findById('menu-items', item.id, { locale: 'all', depth: 0 })
    expect(all?.link).toEqual({
      en: { relationTo: 'posts', value: post.id },
      th: { relationTo: 'pages', value: page.id },
    })
    const th = await cms.find('menu-items', {
      locale: 'th',
      where: { 'link.th.relationTo': { equals: 'pages' } },
    })
    expect(th.totalDocs).toBe(1)
    await cms.destroy()
  })

  it('keeps existing links when a relationship gets more collections, and back', async () => {
    const cwd = tempProject()
    const one = defineConfig({
      secret: SECRET,
      db: db(),
      collections: [
        posts,
        pages,
        {
          slug: 'menu-items',
          fields: [
            { name: 'link', type: 'relationship', to: 'posts' },
            { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
          ],
        },
      ],
    })
    const several = defineConfig({
      ...one,
      collections: [
        posts,
        pages,
        {
          slug: 'menu-items',
          fields: [
            { name: 'link', type: 'relationship', to: ['posts', 'pages'] },
            { name: 'related', type: 'relationship', to: ['posts', 'pages'], hasMany: true },
          ],
        },
      ],
    })
    let cms = await open(one, cwd)
    const post = await cms.create('posts', { title: 'P' })
    const item = await cms.create('menu-items', { link: post.id, related: [post.id] })
    await cms.destroy()

    const wide = await open(several, cwd)
    const page = await wide.create('pages', { title: 'Q' })
    expect(await wide.findById('menu-items', item.id, { depth: 0 })).toMatchObject({
      link: { relationTo: 'posts', value: post.id },
      related: [{ relationTo: 'posts', value: post.id }],
    })
    await wide.update('menu-items', item.id, {
      related: [
        { relationTo: 'pages', value: page.id },
        { relationTo: 'posts', value: post.id },
      ],
    })
    const columns = await rawQuery(cwd, `select * from ${table(cwd, 'menu_items')}`)
    expect(columns[0]).toMatchObject({ link_relation_to: 'posts', link_value: post.id })
    await wide.destroy()

    // Back to one collection: the posts stay, the page is removed.
    cms = await open(one, cwd)
    expect(await cms.findById('menu-items', item.id, { depth: 0 })).toMatchObject({
      link: post.id,
      related: [post.id],
    })
    await cms.destroy()
  })
})
