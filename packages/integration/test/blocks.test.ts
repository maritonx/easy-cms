import { defineConfig, generateTypes, resolveConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  localization: { locales: ['th', 'en'] },
  collections: [
    { slug: 'authors', fields: [{ name: 'name', type: 'text' }] },
    {
      slug: 'pages',
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'layout',
          type: 'blocks',
          maxRows: 5,
          blocks: [
            {
              slug: 'hero',
              fields: [
                { name: 'heading', type: 'text', required: true, localized: true },
                { name: 'author', type: 'relationship', to: 'authors' },
                { name: 'featured', type: 'boolean' },
                { name: 'tags', type: 'select', options: ['news', 'sale'], hasMany: true },
                { name: 'meta', type: 'group', fields: [{ name: 'tone', type: 'text' }] },
              ],
            },
            {
              slug: 'cards',
              fields: [
                { name: 'columns', type: 'number', defaultValue: 3 },
                {
                  name: 'items',
                  type: 'array',
                  fields: [
                    { name: 'title', type: 'text' },
                    { name: 'label', type: 'text', localized: true },
                  ],
                },
              ],
            },
            {
              slug: 'section',
              fields: [
                {
                  name: 'content',
                  type: 'blocks',
                  blocks: [{ slug: 'quote', fields: [{ name: 'text', type: 'text' }] }],
                },
              ],
            },
          ],
        },
        // A whole layout per language.
        {
          name: 'banner',
          type: 'blocks',
          localized: true,
          blocks: [{ slug: 'notice', fields: [{ name: 'text', type: 'text' }] }],
        },
      ],
    },
  ],
})

describe('blocks (FR-BLK)', () => {
  it('stores rows of different kinds, with ids, defaults and populated relationships (FR-BLK-01)', async () => {
    const cms = await open(config)
    const author = await cms.create('authors', { name: 'Ann' })
    const page = await cms.create('pages', {
      title: 'Home',
      layout: [
        { blockType: 'hero', heading: 'ยินดีต้อนรับ', author: author.id },
        { blockType: 'cards', items: [{ title: 'One' }] },
      ],
    })
    expect(page.layout).toHaveLength(2)
    expect(page.layout[0]).toMatchObject({
      blockType: 'hero',
      heading: 'ยินดีต้อนรับ',
      author: { id: author.id, name: 'Ann' },
    })
    expect(page.layout[1]).toMatchObject({
      blockType: 'cards',
      columns: 3,
      items: [{ title: 'One' }],
    })
    expect(typeof page.layout[0]?.id).toBe('string')

    // Reorder and keep ids.
    const [hero, cards] = page.layout
    const reordered = await cms.update('pages', page.id, {
      layout: [cards, hero].map((b) => ({ ...b, author: author.id })) as never,
    })
    expect(reordered.layout.map((b) => b.blockType)).toEqual(['cards', 'hero'])
    expect(reordered.layout[1]?.id).toBe(hero?.id)
    await cms.destroy()
  })

  it('validates block types and the fields inside blocks (FR-BLK-02)', async () => {
    const cms = await open(config)
    await expect(
      cms.create('pages', {
        layout: [{ blockType: 'hero' }, { blockType: 'video' }] as never,
      }),
    ).rejects.toMatchObject({
      errors: [
        { field: 'layout.0.heading', message: 'is required' },
        { field: 'layout.1.blockType', message: 'must be one of: hero, cards, section' },
      ],
    })
    await expect(
      cms.create('pages', { layout: Array(6).fill({ blockType: 'cards' }) }),
    ).rejects.toMatchObject({
      errors: [{ field: 'layout', message: 'must have at most 5 blocks' }],
    })
    await cms.destroy()
  })

  it('localizes fields inside blocks, or a whole blocks field', async () => {
    const cms = await open(config)
    const page = await cms.create('pages', {
      layout: [{ blockType: 'hero', heading: 'สวัสดี' }],
      banner: [{ blockType: 'notice', text: 'ประกาศ' }],
    })
    const heroId = page.layout[0]?.id as string
    await cms.update(
      'pages',
      page.id,
      {
        layout: [{ id: heroId, blockType: 'hero', heading: 'Hello' }],
        banner: [
          { blockType: 'notice', text: 'Notice' },
          { blockType: 'notice', text: 'Two' },
        ],
      },
      { locale: 'en' },
    )
    const th = await cms.findById('pages', page.id)
    const en = await cms.findById('pages', page.id, { locale: 'en' })
    expect(th?.layout[0]).toMatchObject({ id: heroId, heading: 'สวัสดี' })
    expect(en?.layout[0]).toMatchObject({ id: heroId, heading: 'Hello' })
    expect(th?.banner.map((b) => b.text)).toEqual(['ประกาศ'])
    expect(en?.banner.map((b) => b.text)).toEqual(['Notice', 'Two'])
    await cms.destroy()
  })

  it('queries values inside blocks (FR-BLK-03)', async () => {
    const cms = await open(config)
    const author = await cms.create('authors', { name: 'Ann' })
    const hero = await cms.create('pages', {
      title: 'Hero page',
      layout: [
        {
          blockType: 'hero',
          heading: 'สวัสดี',
          author: author.id,
          featured: true,
          tags: ['sale'],
          meta: { tone: 'warm' },
        },
      ],
      banner: [{ blockType: 'notice', text: 'ประกาศ' }],
    })
    await cms.update(
      'pages',
      hero.id,
      {
        layout: [{ ...hero.layout[0], author: author.id, heading: 'Hello' } as never],
        banner: [{ blockType: 'notice', text: 'Notice' }],
      },
      { locale: 'en' },
    )
    const cards = await cms.create('pages', {
      title: 'Cards page',
      layout: [
        {
          blockType: 'cards',
          columns: 4,
          items: [{ title: 'First', label: 'แรก' }, { title: 'Second' }],
        },
        { blockType: 'section', content: [{ blockType: 'quote', text: 'Be brief' }] },
      ],
    })
    await cms.create('pages', {
      title: 'Two columns',
      layout: [{ blockType: 'cards', columns: 2, items: [] }],
    })
    await cms.create('pages', { title: 'Empty' })

    const titles = async (where: object, locale?: string) =>
      (
        await cms.find('pages', { where, sort: 'title', ...(locale ? { locale } : {}) } as never)
      ).docs.map((d) => d.title)

    expect(await titles({ 'layout.blockType': { equals: 'hero' } })).toEqual(['Hero page'])
    expect(await titles({ 'layout.blockType': { in: ['hero', 'cards'] } })).toEqual([
      'Cards page',
      'Hero page',
      'Two columns',
    ])
    expect(await titles({ 'layout.columns': { gte: 4 } })).toEqual(['Cards page'])
    expect(await titles({ 'layout.featured': { equals: true } })).toEqual(['Hero page'])
    expect(await titles({ 'layout.author': { equals: String(author.id) } })).toEqual(['Hero page'])
    expect(await titles({ 'layout.meta.tone': { like: 'war' } })).toEqual(['Hero page'])
    expect(await titles({ layout: { exists: false } })).toEqual(['Empty'])
    // Lists inside blocks: arrays, hasMany values and blocks inside blocks.
    expect(await titles({ 'layout.items.title': { equals: 'Second' } })).toEqual(['Cards page'])
    expect(await titles({ 'layout.items': { exists: true } })).toEqual(['Cards page'])
    expect(await titles({ 'layout.items.label': { equals: 'แรก' } })).toEqual(['Cards page'])
    expect(await titles({ 'layout.items.label.th': { equals: 'แรก' } })).toEqual(['Cards page'])
    expect(await titles({ 'layout.items.label': { equals: 'แรก' } }, 'en')).toEqual([])
    expect(await titles({ 'layout.tags': { equals: 'sale' } })).toEqual(['Hero page'])
    expect(await titles({ 'layout.tags': { in: ['news'] } })).toEqual([])
    expect(await titles({ 'layout.content.blockType': { equals: 'quote' } })).toEqual([
      'Cards page',
    ])
    expect(await titles({ 'layout.content.text': { like: 'brief' } })).toEqual(['Cards page'])
    // Localized values inside blocks: the default locale, a named locale, or the one being read.
    expect(await titles({ 'layout.heading': { equals: 'สวัสดี' } })).toEqual(['Hero page'])
    expect(await titles({ 'layout.heading.en': { equals: 'Hello' } })).toEqual(['Hero page'])
    expect(await titles({ 'layout.heading': { equals: 'Hello' } }, 'en')).toEqual(['Hero page'])
    expect(await titles({ 'layout.heading': { equals: 'Hello' } })).toEqual([])
    // A localized blocks field: one layout per locale.
    expect(await titles({ 'banner.text': { equals: 'ประกาศ' } })).toEqual(['Hero page'])
    expect(await titles({ 'banner.en.text': { equals: 'Notice' } })).toEqual(['Hero page'])
    expect(await titles({ 'banner.text': { equals: 'Notice' } }, 'en')).toEqual(['Hero page'])
    expect(cards.id).toBeDefined()

    await expect(titles({ 'layout.nope': { equals: 1 } })).rejects.toThrow(
      /Unknown field "layout.nope"/,
    )
    await expect(titles({ 'layout.tags.x': { equals: 'x' } })).rejects.toThrow(
      /Cannot query inside "layout.tags"/,
    )
    await expect(titles({ layout: { equals: 'x' } })).rejects.toThrow(/query one of its fields/)
    await expect(titles({ 'layout.items': { equals: 'x' } })).rejects.toThrow(
      /query one of its fields/,
    )

    // Sorting uses the value in the first block that has the field; pages without it come last
    // ascending on Postgres and first on SQLite, like other empty values.
    const sorted = async (sort: string) =>
      (await cms.find('pages', { sort, where: { 'layout.columns': { exists: true } } })).docs.map(
        (d) => d.title,
      )
    expect(await sorted('layout.columns')).toEqual(['Two columns', 'Cards page'])
    expect(await sorted('-layout.columns')).toEqual(['Cards page', 'Two columns'])
    const byHeading = await cms.find('pages', {
      sort: '-layout.heading',
      locale: 'en',
      where: { 'layout.heading': { exists: true } },
    })
    expect(byHeading.docs.map((d) => d.title)).toEqual(['Hero page'])
    await expect(cms.find('pages', { sort: 'layout.items.title' })).rejects.toThrow(/Cannot sort/)
    await cms.destroy()
  })

  it('generates a union type for blocks', async () => {
    const types = generateTypes(await resolveConfig(config))
    expect(types).toContain(`blockType: "hero"`)
    expect(types).toContain(`blockType: "cards"`)
    expect(types).toMatch(/layout: \(\{[\s\S]*\} \| \{[\s\S]*\}\)\[\]/)
  })
})
