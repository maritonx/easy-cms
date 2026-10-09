import { type CollectionDocument, createEasyCMS, defineConfig, type ID } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { describe, expectTypeOf, it } from 'vitest'
import { findByPath, nestedDocsPlugin } from '../src/index.js'

// Checked by `pnpm typecheck`.
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'pages',
      useAsTitle: 'title',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
      ],
    },
    { slug: 'docs', fields: [{ name: 'slug', type: 'slug' }] },
  ],
  plugins: [
    nestedDocsPlugin({ collections: ['pages'] }),
    nestedDocsPlugin({ collections: ['docs'], fieldNames: { parent: 'chapter', path: 'url' } }),
  ],
})
type Page = CollectionDocument<typeof config, 'pages'>
type Doc = CollectionDocument<typeof config, 'docs'>

describe('nestedDocsPlugin types', () => {
  it('adds parent, path and breadcrumbs, with the names it was given', () => {
    expectTypeOf<Page['path']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<Page['parent']>().toEqualTypeOf<ID | Page | null | undefined>()
    expectTypeOf<NonNullable<Page['breadcrumbs']>[number]['url']>().toEqualTypeOf<
      string | null | undefined
    >()
    expectTypeOf<Doc>().toHaveProperty('chapter')
    expectTypeOf<Doc>().toHaveProperty('url')
    expectTypeOf<Doc>().not.toHaveProperty('parent')
  })

  it('types what findByPath returns', () => {
    const find = async () => findByPath(await createEasyCMS(config), 'pages', '/about')
    expectTypeOf<Awaited<ReturnType<typeof find>>>().toEqualTypeOf<Page | null>()
  })
})
