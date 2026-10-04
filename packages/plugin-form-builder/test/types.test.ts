import { type CollectionDocument, defineConfig, resolveConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { formBuilderPlugin } from '../src/index.js'

// Checked by `pnpm typecheck`.
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [],
  plugins: [formBuilderPlugin({ defaultTo: 'hello@example.com' })],
})

describe('formBuilderPlugin types', () => {
  it('adds the forms and submissions collections', () => {
    type Form = CollectionDocument<typeof config, 'forms'>
    type Submission = CollectionDocument<typeof config, 'form-submissions'>
    expectTypeOf<Form['title']>().toEqualTypeOf<string>()
    expectTypeOf<Form['status']>().toEqualTypeOf<'draft' | 'published'>()
    expectTypeOf<Submission['form']>().toEqualTypeOf<import('@easy-cms/core').ID | Form>()
    // The rate-limit key is never readable.
    expectTypeOf<Submission>().not.toHaveProperty('rateKey')
  })

  it('lists the same fields as the plugin adds (keep the types in step)', async () => {
    const resolved = await resolveConfig(config)
    const names = (slug: string) =>
      resolved.collections.find((c) => c.slug === slug)?.fields.map((f) => f.name)
    expect(names('forms')).toEqual([
      'title',
      'slug',
      'fields',
      'submitLabel',
      'confirmationType',
      'confirmationMessage',
      'redirectUrl',
      'emails',
    ])
    // `rateKey` is left out of the types: nobody can read it.
    expect(names('form-submissions')).toEqual([
      'form',
      'summary',
      'data',
      'locale',
      'page',
      'rateKey',
    ])
  })
})
