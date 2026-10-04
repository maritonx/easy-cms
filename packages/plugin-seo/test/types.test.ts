import { type CollectionDocument, defineConfig, type GlobalDocument } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { describe, expectTypeOf, it } from 'vitest'
import { seoPlugin } from '../src/index.js'

// Checked by `pnpm typecheck`.
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
    { slug: 'tags', fields: [{ name: 'name', type: 'text' }] },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }],
  plugins: [
    seoPlugin({
      collections: ['posts'],
      globals: ['site'],
      // Callbacks keep their parameter types.
      generateTitle: ({ doc }) => `${String(doc.title)} | Blog`,
    }),
  ],
})

describe('seoPlugin types', () => {
  it('adds meta to the collections and globals it was given', () => {
    type Post = CollectionDocument<typeof config, 'posts'>
    expectTypeOf<Post['meta']>().toEqualTypeOf<{
      title?: string | null
      description?: string | null
      image?: (string | number) | import('@easy-cms/core').MediaDocument | null
      noindex?: boolean | null
    }>()
    expectTypeOf<CollectionDocument<typeof config, 'tags'>>().not.toHaveProperty('meta')
    expectTypeOf<GlobalDocument<typeof config, 'site'>>().toHaveProperty('meta')
  })
})
