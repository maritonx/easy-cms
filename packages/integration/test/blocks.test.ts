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
              ],
            },
            {
              slug: 'cards',
              fields: [
                { name: 'columns', type: 'number', defaultValue: 3 },
                { name: 'items', type: 'array', fields: [{ name: 'title', type: 'text' }] },
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
        { field: 'layout.1.blockType', message: 'must be one of: hero, cards' },
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

  it('generates a union type for blocks', async () => {
    const types = generateTypes(await resolveConfig(config))
    expect(types).toContain(`blockType: "hero"`)
    expect(types).toContain(`blockType: "cards"`)
    expect(types).toMatch(/layout: \(\{[\s\S]*\} \| \{[\s\S]*\}\)\[\]/)
  })
})
