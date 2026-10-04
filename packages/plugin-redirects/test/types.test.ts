import { type CollectionDocument, defineConfig, type ID, resolveConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { redirectsPlugin } from '../src/index.js'

// Checked by `pnpm typecheck`.
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
    { slug: 'case-studies', fields: [{ name: 'title', type: 'text' }] },
  ],
  plugins: [
    redirectsPlugin({
      collections: ['posts', 'case-studies'],
      url: ({ doc }) => `/${String(doc.slug)}`,
    }),
  ],
})
type Redirect = CollectionDocument<typeof config, 'redirects'>

describe('redirectsPlugin types', () => {
  it('adds the redirects collection, with a field per target collection', () => {
    expectTypeOf<Redirect['from']>().toEqualTypeOf<string>()
    expectTypeOf<Redirect['type']>().toEqualTypeOf<'301' | '302' | '307' | '308'>()
    expectTypeOf<Redirect['to_posts']>().toEqualTypeOf<
      ID | CollectionDocument<typeof config, 'posts'> | null | undefined
    >()
    expectTypeOf<Redirect>().toHaveProperty('to_case_studies')
  })

  it('lists the same fields as the plugin adds (keep the types in step)', async () => {
    const resolved = await resolveConfig(config)
    const fields = resolved.collections.find((c) => c.slug === 'redirects')?.fields
    // `locale` only with localization; the types list it as optional either way.
    expect(fields?.map((f) => f.name)).toEqual([
      'from',
      'to',
      'to_posts',
      'to_case_studies',
      'type',
    ])
  })
})
