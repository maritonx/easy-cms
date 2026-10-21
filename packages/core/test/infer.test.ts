import { describe, expectTypeOf, it } from 'vitest'
import {
  type CollectionDocument,
  type CollectionSlug,
  defineConfig,
  type FIELD_TYPES,
  type FieldType,
  type GlobalDocument,
  type ID,
  isAdmin,
  type MediaDocument,
  type RichTextDocument,
} from '../src/index.js'
import { fakeDb } from './helpers.js'

// These assertions are checked by `pnpm typecheck`; at runtime they are no-ops.

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: fakeDb,
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: {
        read: ({ user }) => user !== null,
        update: isAdmin,
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'views', type: 'number' },
        { name: 'featured', type: 'boolean', required: true },
        { name: 'publishedAt', type: 'date' },
        {
          name: 'kind',
          type: 'select',
          options: ['news', { label: 'Blog', value: 'blog' }],
          required: true,
        },
        { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true },
        { name: 'body', type: 'richText' },
        { name: 'cover', type: 'upload' },
        { name: 'author', type: 'relationship', to: 'authors', required: true },
        { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
        { name: 'links', type: 'array', fields: [{ name: 'url', type: 'text', required: true }] },
        { name: 'seo', type: 'group', fields: [{ name: 'description', type: 'textarea' }] },
        { name: 'meta', type: 'json' },
      ],
    },
    {
      slug: 'authors',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'posts', type: 'relationship', to: 'posts', hasMany: true },
      ],
    },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'siteName', type: 'text', required: true }] }],
})

type Config = typeof config
type Post = CollectionDocument<Config, 'posts'>
type Author = CollectionDocument<Config, 'authors'>

describe('type inference', () => {
  it('lists slugs', () => {
    expectTypeOf<CollectionSlug<Config>>().toEqualTypeOf<'posts' | 'authors' | 'users' | 'media'>()
  })

  it('adds system fields', () => {
    expectTypeOf<Post['id']>().toEqualTypeOf<ID>()
    expectTypeOf<Post['createdAt']>().toEqualTypeOf<string>()
    expectTypeOf<Post['status']>().toEqualTypeOf<'draft' | 'published'>()
    expectTypeOf<Author>().not.toHaveProperty('status')
  })

  it('makes required fields non-nullable and others optional', () => {
    expectTypeOf<Post['title']>().toEqualTypeOf<string>()
    expectTypeOf<Post['featured']>().toEqualTypeOf<boolean>()
    expectTypeOf<Post['views']>().toEqualTypeOf<number | null | undefined>()
    expectTypeOf<Post['publishedAt']>().toEqualTypeOf<string | null | undefined>()
  })

  it('infers select values', () => {
    expectTypeOf<Post['kind']>().toEqualTypeOf<'news' | 'blog'>()
    expectTypeOf<Post['tags']>().toEqualTypeOf<('a' | 'b')[]>()
  })

  it('infers rich text, upload and json', () => {
    expectTypeOf<Post['body']>().toEqualTypeOf<RichTextDocument | null | undefined>()
    expectTypeOf<Post['cover']>().toEqualTypeOf<ID | MediaDocument | null | undefined>()
    expectTypeOf<Post['meta']>().toEqualTypeOf<unknown>()
  })

  it('resolves relationships, including circular ones', () => {
    expectTypeOf<Post['author']>().toEqualTypeOf<ID | Author>()
    expectTypeOf<Exclude<Post['author'], ID>['name']>().toEqualTypeOf<string>()
    expectTypeOf<NonNullable<Post['related']>>().toEqualTypeOf<(ID | Post)[]>()
    expectTypeOf<NonNullable<Author['posts']>>().toEqualTypeOf<(ID | Post)[]>()
  })

  it('infers arrays and groups', () => {
    expectTypeOf<NonNullable<Post['links']>>().toEqualTypeOf<{ url: string; id: string }[]>()
    expectTypeOf<NonNullable<Post['seo']>>().toEqualTypeOf<{ description?: string | null }>()
  })

  it('infers globals', () => {
    expectTypeOf<GlobalDocument<Config, 'site'>>().toEqualTypeOf<{
      updatedAt: string | null
      siteName: string
    }>()
  })

  it('FIELD_TYPES lists every field type', () => {
    expectTypeOf<(typeof FIELD_TYPES)[number]>().toEqualTypeOf<FieldType>()
  })
})

describe('input types', () => {
  it('requires required fields unless Easy CMS can fill them', () => {
    type Input = import('../src/index.js').CreateInput<Config, 'posts'>
    expectTypeOf<Input>().toHaveProperty('title')
    expectTypeOf<{ title: string; featured: boolean; kind: 'news'; author: 1 }>().toExtend<Input>()
    expectTypeOf<{ title: string }>().not.toExtend<Input>()
  })

  it('accepts ids for relationships and readonly arrays', () => {
    type Input = import('../src/index.js').CreateInput<Config, 'posts'>
    expectTypeOf<Input['author']>().toEqualTypeOf<ID>()
    expectTypeOf<readonly ['a']>().toExtend<NonNullable<Input['tags']>>()
    expectTypeOf<readonly [{ url: string }]>().toExtend<NonNullable<Input['links']>>()
    expectTypeOf<Input['status']>().toEqualTypeOf<'draft' | 'published' | undefined>()
  })

  it('makes every field optional on update', () => {
    expectTypeOf<{ views: 1 }>().toExtend<import('../src/index.js').UpdateInput<Config, 'posts'>>()
  })
})

describe('built-in media', () => {
  it('types media documents with url and sizes', () => {
    type Media = CollectionDocument<Config, 'media'>
    expectTypeOf<Media>().toEqualTypeOf<MediaDocument>()
    expectTypeOf<Media['url']>().toEqualTypeOf<string>()
  })
})

describe('APIs accept typed instances', () => {
  it('createRestHandler takes EasyCMS<typeof config>', () => {
    type Typed = import('../src/index.js').EasyCMS<Config>
    expectTypeOf<
      Parameters<typeof import('../src/index.js').createRestHandler<Config>>[0]
    >().toEqualTypeOf<Typed>()
  })
})

describe("reads with locale: 'all'", () => {
  const localized = defineConfig({
    secret: 'x'.repeat(32),
    db: fakeDb,
    localization: { locales: ['th', 'en'] },
    collections: [
      {
        slug: 'pages',
        fields: [
          { name: 'title', type: 'text', required: true, localized: true },
          { name: 'slug', type: 'text', required: true },
          { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true, localized: true },
          { name: 'parent', type: 'relationship', to: 'pages', localized: true },
          { name: 'author', type: 'relationship', to: 'pages' },
          {
            name: 'seo',
            type: 'group',
            fields: [{ name: 'description', type: 'textarea', localized: true }],
          },
        ],
      },
    ],
    globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text', localized: true }] }],
  })
  type Localized = typeof localized
  type Cms = import('../src/index.js').EasyCMS<Localized>
  type Map<V> = { th?: V | null; en?: V | null }

  // Never called: the calls are only type-checked.
  const reads = (cms: Cms, anyLocale: string) => ({
    all: cms.find('pages', { locale: 'all' }),
    one: cms.find('pages', { locale: 'th' }),
    dynamic: cms.find('pages', { locale: anyLocale }),
    byId: cms.findById('pages', 1, { locale: 'all' }),
    global: cms.findGlobal('site', { locale: 'all' }),
    globalDefault: cms.findGlobal('site'),
  })
  type Reads = { [K in keyof ReturnType<typeof reads>]: Awaited<ReturnType<typeof reads>[K]> }
  type Page = Reads['all']['docs'][number]

  it('types localized fields as maps of their locales', () => {
    expectTypeOf<Page['title']>().toEqualTypeOf<Map<string>>()
    expectTypeOf<Page['slug']>().toEqualTypeOf<string>()
    expectTypeOf<Page['tags']>().toEqualTypeOf<Map<('a' | 'b')[]>>()
    expectTypeOf<NonNullable<Page['seo']>['description']>().toEqualTypeOf<
      Map<string> | null | undefined
    >()
  })

  it('leaves localized relationships as ids and populates the others in every locale', () => {
    expectTypeOf<Page['parent']>().toEqualTypeOf<Map<ID> | null | undefined>()
    expectTypeOf<Exclude<NonNullable<Page['author']>, ID>['title']>().toEqualTypeOf<Map<string>>()
  })

  it('types findById and findGlobal too', () => {
    expectTypeOf<NonNullable<Reads['byId']>['title']>().toEqualTypeOf<Map<string>>()
    expectTypeOf<Reads['global']['name']>().toEqualTypeOf<Map<string> | null | undefined>()
    expectTypeOf<Reads['globalDefault']['name']>().toEqualTypeOf<string | null | undefined>()
  })

  it('reads one locale otherwise', () => {
    expectTypeOf<Reads['one']['docs'][number]['title']>().toEqualTypeOf<string>()
    expectTypeOf<Reads['dynamic']['docs'][number]['title']>().toEqualTypeOf<string>()
  })

  it("ignores 'all' without localization", () => {
    const plain = (cms: import('../src/index.js').EasyCMS<Config>) =>
      cms.find('posts', { locale: 'all' })
    expectTypeOf<
      Awaited<ReturnType<typeof plain>>['docs'][number]['title']
    >().toEqualTypeOf<string>()
  })
})
