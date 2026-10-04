import { type CollectionDocument, defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { describe, expectTypeOf, it } from 'vitest'
import { color } from '../src/index.js'

// Checked by `pnpm typecheck`.
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  fieldTypes: [color],
  collections: [
    {
      slug: 'categories',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'color', type: 'color', presets: ['#2f6f5e'] },
        { name: 'accent', type: 'color', required: true, alpha: true },
      ],
    },
  ],
})
type Category = CollectionDocument<typeof config, 'categories'>

describe('color types', () => {
  it('types the value as a string', () => {
    expectTypeOf<Category['color']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<Category['accent']>().toEqualTypeOf<string>()
  })

  it("checks the type's options", () => {
    defineConfig({
      secret: 'x'.repeat(32),
      db: sqlite({ url: 'file:./cms.db' }),
      fieldTypes: [color],
      collections: [
        {
          slug: 'x',
          // @ts-expect-error presets is a list of strings
          fields: [{ name: 'c', type: 'color', presets: '#2f6f5e' }],
        },
      ],
    })
  })
})
