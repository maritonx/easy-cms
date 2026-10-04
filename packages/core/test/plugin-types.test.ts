import { describe, expectTypeOf, it } from 'vitest'
import {
  type CollectionDocument,
  type CollectionSlug,
  type CreateInput,
  defineConfig,
  definePlugin,
  type GlobalDocument,
  type ID,
} from '../src/index.js'
import { fakeDb } from './helpers.js'

// Checked by `pnpm typecheck`: what plugins add shows in the inferred document types.

type ColorField = { readonly name: 'color'; readonly type: 'text'; readonly required: true }

/** A plugin that adds `color` to the collections it's given, like the official ones do. */
// biome-ignore lint/correctness/noUnusedFunctionParameters: the option only shapes the types here
const colorPlugin = <const S extends string>(options: { collections: readonly S[] }) =>
  definePlugin<{
    fields: { [K in S]: readonly [ColorField] }
    globalFields: { site: readonly [{ readonly name: 'theme'; readonly type: 'text' }] }
    collections: readonly [
      {
        readonly slug: 'swatches'
        readonly fields: readonly [
          { readonly name: 'hex'; readonly type: 'text'; readonly required: true },
        ]
      },
    ]
  }>((config) => config)

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: fakeDb,
  collections: [
    { slug: 'posts', drafts: true, fields: [{ name: 'title', type: 'text', required: true }] },
    { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }],
  plugins: [colorPlugin({ collections: ['posts'] })],
})
type C = typeof config

describe('types that plugins add', () => {
  it('adds fields to the collections and globals the plugin was given', () => {
    expectTypeOf<CollectionDocument<C, 'posts'>>().toEqualTypeOf<{
      id: ID
      createdAt: string
      updatedAt: string
      status: 'draft' | 'published'
      title: string
      color: string
    }>()
    // Other collections are unchanged.
    expectTypeOf<CollectionDocument<C, 'pages'>>().not.toHaveProperty('color')
    expectTypeOf<GlobalDocument<C, 'site'>>().toHaveProperty('theme')
    // Inputs need the plugin's required fields too.
    expectTypeOf<CreateInput<C, 'posts'>>().toHaveProperty('color')
  })

  it('adds collections', () => {
    expectTypeOf<'swatches'>().toExtend<CollectionSlug<C>>()
    expectTypeOf<CollectionDocument<C, 'swatches'>['hex']>().toEqualTypeOf<string>()
  })

  it('leaves plugins without types and options that are not literals alone', () => {
    const loose = defineConfig({
      secret: 'x'.repeat(32),
      db: fakeDb,
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
      plugins: [(c) => c, colorPlugin({ collections: ['posts'] as string[] })],
    })
    expectTypeOf<CollectionDocument<typeof loose, 'posts'>>().not.toHaveProperty('color')
    expectTypeOf<CollectionDocument<typeof loose, 'posts'>>().toHaveProperty('title')
  })
})
