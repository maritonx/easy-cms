import { type Config, defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    { slug: 'tags', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
    {
      slug: 'posts',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'keywords',
          type: 'select',
          options: ['a', 'b', 'c'],
          hasMany: true,
          localized: true,
        },
        { name: 'tags', type: 'relationship', to: 'tags', hasMany: true, localized: true },
        {
          name: 'faq',
          type: 'array',
          localized: true,
          fields: [
            { name: 'question', type: 'text', required: true },
            { name: 'links', type: 'array', fields: [{ name: 'url', type: 'text' }] },
          ],
        },
      ],
    },
  ],
})

describe('localized arrays and hasMany (FR-L10N-06)', () => {
  it('keeps one list per locale', async () => {
    const cms = await open(config)
    const [t1, t2] = [
      await cms.create('tags', { name: 'one' }),
      await cms.create('tags', { name: 'two' }),
    ]
    const post = await cms.create('posts', {
      title: 'x',
      keywords: ['a'],
      tags: [t1.id],
      faq: [{ question: 'ทำไม', links: [{ url: 'https://th.example' }] }],
    })
    await cms.update(
      'posts',
      post.id,
      {
        keywords: ['b', 'c'],
        tags: [t2.id, t1.id],
        faq: [{ question: 'Why?' }, { question: 'How?' }],
      },
      { locale: 'en' },
    )
    const th = await cms.findById('posts', post.id)
    const en = await cms.findById('posts', post.id, { locale: 'en' })
    expect(th).toMatchObject({
      keywords: ['a'],
      tags: [{ name: 'one' }],
      faq: [{ question: 'ทำไม', links: [{ url: 'https://th.example' }] }],
    })
    expect(en).toMatchObject({
      keywords: ['b', 'c'],
      tags: [{ name: 'two' }, { name: 'one' }],
      faq: [{ question: 'Why?' }, { question: 'How?' }],
    })
    // Row ids stay stable across saves in each locale.
    const again = await cms.update('posts', post.id, { faq: th?.faq ?? [] }, {})
    expect(again.faq[0]?.id).toBe(th?.faq[0]?.id)

    // All locales at once; relationships in maps are left as ids.
    expect(await cms.findById('posts', post.id, { locale: 'all' })).toMatchObject({
      keywords: { th: ['a'], en: ['b', 'c'] },
      tags: { th: [t1.id], en: [t2.id, t1.id] },
    })
    await cms.destroy()
  })

  it('falls back to the default locale and queries per locale', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'x', keywords: ['a'] })
    expect((await cms.findById('posts', post.id, { locale: 'en' }))?.keywords).toEqual(['a'])
    expect(
      (await cms.findById('posts', post.id, { locale: 'en', fallbackLocale: false }))?.keywords,
    ).toEqual([])
    await cms.update('posts', post.id, { keywords: ['c'] }, { locale: 'en' })
    expect(await cms.count('posts', { where: { keywords: { in: ['c'] } } })).toBe(0)
    expect(await cms.count('posts', { where: { keywords: { in: ['c'] } }, locale: 'en' })).toBe(1)
    expect(await cms.count('posts', { where: { 'keywords.th': { in: ['a'] } } })).toBe(1)
    await cms.destroy()
  })

  it('validates each locale and refuses localized fields inside localized lists', async () => {
    const cms = await open(config)
    await expect(
      cms.create('posts', { faq: [{ question: '' }] }, { locale: 'en' }),
    ).rejects.toMatchObject({ errors: [{ field: 'faq.0.question', message: 'is required' }] })
    await cms.destroy()
    const { validateConfig } = await import('@easy-cms/core')
    expect(
      validateConfig({
        ...config,
        collections: [
          {
            slug: 'x',
            fields: [
              {
                name: 'rows',
                type: 'array',
                localized: true,
                fields: [{ name: 'label', type: 'text', localized: true }],
              },
            ],
          },
        ],
      }).map((i) => i.path),
    ).toEqual(['collections[0].fields.rows.fields.label.localized'])
  })

  it('keeps existing rows as the default locale when a list becomes localized', async () => {
    const cwd = tempProject()
    const plain: Config = {
      secret: SECRET,
      db: db(),
      localization: { locales: ['th', 'en'] },
      collections: [
        {
          slug: 'pages',
          fields: [
            { name: 'labels', type: 'select', options: ['x', 'y'], hasMany: true },
            { name: 'rows', type: 'array', fields: [{ name: 'text', type: 'text' }] },
          ],
        },
      ],
    }
    const before = await open(plain, cwd)
    const page = await before.create('pages', { labels: ['x'], rows: [{ text: 'เดิม' }] })
    await before.destroy()
    const localizedConfig: Config = {
      ...plain,
      collections: [
        {
          slug: 'pages',
          fields: [
            { name: 'labels', type: 'select', options: ['x', 'y'], hasMany: true, localized: true },
            {
              name: 'rows',
              type: 'array',
              localized: true,
              fields: [{ name: 'text', type: 'text' }],
            },
          ],
        },
      ],
    }
    const after = await open(localizedConfig, cwd)
    expect(await after.findById('pages', page.id, { locale: 'all' })).toMatchObject({
      labels: { th: ['x'], en: [] },
      rows: { th: [{ text: 'เดิม' }], en: [] },
    })
    await after.destroy()
  })
})
