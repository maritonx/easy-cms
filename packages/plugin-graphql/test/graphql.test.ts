import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Block,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  type EasyCMS,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { GraphQLInt, printSchema } from 'graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildGraphQLSchema, graphqlPlugin, runGraphQL } from '../src/index.js'
import { checkNames } from '../src/schema.js'

const hero: Block = {
  slug: 'hero',
  fields: [
    { name: 'heading', type: 'text', required: true },
    { name: 'image', type: 'upload' },
  ],
}
const quote: Block = { slug: 'quote', fields: [{ name: 'text', type: 'textarea' }] }

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  apiKeys: true,
  localization: { locales: ['th', 'en'] },
  collections: [
    {
      slug: 'categories',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'parent', type: 'relationship', to: 'categories' },
      ],
    },
    {
      slug: 'posts',
      labels: { singular: 'Post', plural: 'Posts' },
      drafts: true,
      access: {
        read: () => true,
        create: ({ user }) => !!user,
        update: ({ user }) => !!user,
        delete: ({ user }) => user?.role === 'admin',
      },
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        { name: 'views', type: 'number' },
        { name: 'publishedAt', type: 'date' },
        { name: 'body', type: 'richText' },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
        { name: 'cover', type: 'upload' },
        { name: 'tags', type: 'select', options: ['news', 'tips'], hasMany: true },
        { name: 'size', type: 'select', options: ['1x', '2x'] },
        {
          name: 'seo',
          type: 'group',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'noindex', type: 'boolean' },
          ],
        },
        { name: 'links', type: 'array', fields: [{ name: 'url', type: 'text' }] },
        { name: 'layout', type: 'blocks', blocks: [hero, quote] },
        { name: 'notes', type: 'text', access: { read: ({ user }) => user?.role === 'admin' } },
        { name: 'secret', type: 'text', hidden: true },
      ],
    },
    {
      slug: 'pages',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'layout', type: 'blocks', blocks: [hero] },
      ],
    },
  ],
  globals: [
    {
      slug: 'site-settings',
      access: { read: () => true, update: ({ user }) => user?.role === 'admin' },
      fields: [
        { name: 'name', type: 'text', localized: true },
        { name: 'featured', type: 'relationship', to: 'posts' },
      ],
    },
  ],
  plugins: [
    graphqlPlugin({
      extend: ({ type }) => ({
        query: {
          // Returns a generated type: its relationships resolve as usual.
          mostViewed: {
            type: type('Post'),
            resolve: async (_s, _a, ctx) =>
              (
                await ctx.cms.find('posts', {
                  user: ctx.user,
                  overrideAccess: false,
                  sort: '-views',
                  limit: 1,
                  depth: 0,
                  locale: 'en',
                })
              ).docs[0],
          },
          postCount: {
            type: GraphQLInt,
            resolve: (_s, _a, ctx) =>
              ctx.cms.count('posts', { user: ctx.user, overrideAccess: false }),
          },
        },
        fields: {
          Post: {
            titleLength: {
              type: GraphQLInt,
              resolve: (post: { title?: string }) => post.title?.length ?? 0,
            },
          },
        },
      }),
    }),
  ],
})

const ORIGIN = 'http://cms.test'
let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
let admin: string
let editor: string
let news: number | string
let tips: number | string

type Result = {
  // biome-ignore lint/suspicious/noExplicitAny: response data, checked by the assertions
  data?: Record<string, any>
  errors?: { message: string; extensions?: Record<string, unknown> }[]
}

async function gql(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<Result & { status: number }> {
  const response = await handle(
    new Request(`${ORIGIN}/api/cms/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    }),
  )
  return { status: response.status, ...((await response.json()) as Result) }
}

const code = (result: Result) => result.errors?.[0]?.extensions?.code

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-graphql-'))
  cms = await createEasyCMS(config, { cwd: dir, schema: 'push', logger: silentLogger })
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'ed@x.co', password: 'password123', role: 'editor' })
  admin = (await cms.auth.login({ email: 'admin@x.co', password: 'password123' })).token
  editor = (await cms.auth.login({ email: 'ed@x.co', password: 'password123' })).token
  const root = await cms.create('categories', { name: 'Root' })
  news = (await cms.create('categories', { name: 'News', parent: root.id })).id
  tips = (await cms.create('categories', { name: 'Tips' })).id
  for (let i = 1; i <= 12; i++) {
    await cms.create(
      'posts',
      {
        title: `Post ${i}`,
        views: i * 10,
        category: i % 2 ? news : tips,
        tags: i % 2 ? ['news'] : ['tips'],
        seo: { title: `SEO ${i}`, noindex: i === 3 },
        notes: `note ${i}`,
        status: 'published',
      } as never,
      { locale: 'en' },
    )
  }
  await cms.create('posts', { title: 'Draft', status: 'draft' } as never, { locale: 'en' })
})

afterAll(async () => {
  await cms.destroy()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Windows may still hold the SQLite file; the OS cleans temp.
  }
})

describe('schema', () => {
  it('has a type, queries and mutations per collection and global', () => {
    const schema = buildGraphQLSchema(cms.config)
    const args = (type: 'query' | 'mutation', field: string) =>
      (type === 'query' ? schema.getQueryType() : schema.getMutationType())
        ?.getFields()
        [field]?.args.map((a) => `${a.name}: ${a.type}`)
    expect(args('query', 'post')).toEqual([
      'id: ID!',
      'locale: Locale',
      'fallbackLocale: Boolean',
      'draft: Boolean',
    ])
    expect(args('query', 'posts')).toEqual([
      'where: PostWhere',
      'sort: [PostSort!]',
      'limit: Int',
      'page: Int',
      'locale: Locale',
      'fallbackLocale: Boolean',
      'draft: Boolean',
    ])
    expect(args('mutation', 'createPost')).toEqual([
      'data: PostCreateInput!',
      'locale: Locale',
      'draft: Boolean',
    ])
    expect(args('mutation', 'updatePost')?.slice(0, 2)).toEqual([
      'id: ID!',
      'data: PostUpdateInput!',
    ])
    expect(args('mutation', 'deletePost')).toEqual(['id: ID!'])
    expect(args('query', 'siteSettings')).toEqual(['locale: Locale', 'fallbackLocale: Boolean'])
    expect(args('mutation', 'updateSiteSettings')?.[0]).toBe('data: SiteSettingsInput!')
    expect(args('query', 'mediaItem')?.[0]).toBe('id: ID!')
    expect(args('query', 'media')?.[0]).toBe('where: MediaWhere')
    const sdl = printSchema(schema)
    for (const part of [
      'type Post {',
      'type PostList {',
      'me: User',
      'union PostLayoutBlock = HeroBlock | QuoteBlock',
      'layout: [PageLayoutBlock!]',
      'enum PostTags {',
      'tags: [PostTags!]',
      'size: String',
      'title: String!',
      'seo: PostSeo',
      'links: [PostLinksRow!]',
      'status: DocumentStatus',
      'createdAt: DateTime!',
      'url: String',
    ])
      expect(sdl).toContain(part)
    // Not secret, not API keys, not internal collections; media is not created through GraphQL.
    expect(sdl).not.toMatch(/secret|passwordHash|ApiKey|createMedia\b|Session/)
    // A block object used in two fields is one type.
    expect(sdl.match(/type HeroBlock \{/g)).toHaveLength(1)
  })

  it('refuses names that clash, saying how to choose others', () => {
    // `data` is its own singular: one document and the list would both be `data`.
    expect(() => checkNames(['data'], [])).toThrow(/"data" is also used by collection "data"/)
    expect(() => checkNames(['data'], [])).toThrow(/names: \{ 'data'/)
    expect(() => checkNames(['posts'], ['posts'])).toThrow(/query name "posts"/)
    expect(() => checkNames(['data'], [], { data: { one: 'datum' } })).not.toThrow()
    expect(() => checkNames(['a-b'], [], { 'a-b': { type: 'Not valid' } })).toThrow(/not a valid/)
  })
})

describe('reading', () => {
  it('lists documents with typed filters, sorting and pages', async () => {
    const result = await gql(`{
      posts(where: { views: { gte: 50 }, tags: { in: [news] }, seo: { noindex: { equals: false } } },
            sort: [views_DESC], limit: 2, page: 1, locale: en) {
        docs { title views tags seo { title } }
        totalDocs page totalPages hasNextPage
      }
    }`)
    expect(result.errors).toBeUndefined()
    expect(result.data?.posts).toEqual({
      docs: [
        { title: 'Post 11', views: 110, tags: ['news'], seo: { title: 'SEO 11' } },
        { title: 'Post 9', views: 90, tags: ['news'], seo: { title: 'SEO 9' } },
      ],
      totalDocs: 4,
      page: 1,
      totalPages: 2,
      hasNextPage: true,
    })
    const or = await gql(
      `{ posts(where: { OR: [{ views: { equals: 10 } }, { views: { equals: 20 } }] }, sort: [views_ASC]) { docs { views } } }`,
    )
    expect(or.data?.posts.docs).toEqual([{ views: 10 }, { views: 20 }])
    const byCategory = await gql(
      'query ($c: ID!) { posts(where: { category: { equals: $c } }, limit: 100) { totalDocs } }',
      { c: String(tips) },
    )
    expect(byCategory.data?.posts.totalDocs).toBe(6)
  })

  it('loads relationships in one query per collection, however many documents', async () => {
    const calls: string[] = []
    const find = cms.db.find.bind(cms.db)
    cms.db.find = (args) => {
      calls.push(args.collection)
      return find(args)
    }
    try {
      const result = await gql(`{
        posts(limit: 12, locale: en) { docs { title category { name parent { name } } } }
      }`)
      expect(result.errors).toBeUndefined()
      expect(result.data?.posts.docs).toHaveLength(12)
      expect(result.data?.posts.docs[0].category).toMatchObject({ name: expect.any(String) })
      const withParent = result.data?.posts.docs.find(
        (d: { category: { name: string } }) => d.category.name === 'News',
      )
      expect(withParent.category.parent).toEqual({ name: 'Root' })
      expect(calls.filter((c) => c === 'categories')).toHaveLength(2)
    } finally {
      cms.db.find = find
    }
  })

  it('reads one document, a locale per alias, and leaves out drafts for visitors', async () => {
    const { docs } = await cms.find('posts', { limit: 1, sort: 'createdAt', locale: 'en' })
    const id = String(docs[0]?.id)
    await cms.update('posts', id, { title: 'โพสต์ 1' } as never, { locale: 'th' })
    const result = await gql(
      `query ($id: ID!) {
        en: post(id: $id, locale: en) { title }
        th: post(id: $id, locale: th) { title }
      }`,
      { id },
    )
    expect(result.data).toEqual({ en: { title: 'Post 1' }, th: { title: 'โพสต์ 1' } })

    const drafts =
      '{ posts(where: { status: { equals: draft } }, draft: true, locale: en) { totalDocs } }'
    expect((await gql(drafts)).data?.posts.totalDocs).toBe(0)
    expect((await gql(drafts, {}, editor)).data?.posts.totalDocs).toBe(1)
    expect((await gql('{ post(id: "99999") { title } }')).data?.post).toBeNull()
  })

  it('applies field access, and knows who is asking', async () => {
    const query = '{ posts(limit: 1, sort: [createdAt_ASC]) { docs { notes } } }'
    expect((await gql(query)).data?.posts.docs[0].notes).toBeNull()
    expect((await gql(query, {}, admin)).data?.posts.docs[0].notes).toBe('note 1')
    expect((await gql('{ me { email role } }')).data?.me).toBeNull()
    expect((await gql('{ me { email role } }', {}, editor)).data?.me).toEqual({
      email: 'ed@x.co',
      role: 'editor',
    })
    // Users are logged-in only.
    expect(code(await gql('{ users { totalDocs } }'))).toBe('UNAUTHORIZED')
  })

  it('reads globals, and what extend adds', async () => {
    const result = await gql(
      '{ siteSettings { name updatedAt } postCount mostViewed { title category { name } } }',
    )
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      siteSettings: { name: null, updatedAt: null },
      postCount: 12,
      mostViewed: { title: 'Post 12', category: { name: 'Tips' } },
    })
    const length = await gql(
      '{ posts(limit: 1, sort: [views_ASC], locale: en) { docs { titleLength } } }',
    )
    expect(length.data?.posts.docs[0].titleLength).toBe(6)
  })
})

describe('writing', () => {
  it('creates, updates and deletes, with the access rules of REST', async () => {
    const create = `mutation ($data: PostCreateInput!) {
      createPost(data: $data, draft: false, locale: en) {
        id title status body tags category { name }
        links { id url }
        layout { __typename ... on HeroBlock { heading } ... on QuoteBlock { text } }
      }
    }`
    const data = {
      title: 'From GraphQL',
      body: 'First paragraph\n\nSecond',
      tags: ['tips'],
      category: String(news),
      links: [{ url: 'https://example.com' }],
      layout: [
        { blockType: 'hero', heading: 'Hello' },
        { blockType: 'quote', text: 'Quoted' },
      ],
    }
    expect(code(await gql(create, { data }))).toMatch(/UNAUTHORIZED|FORBIDDEN/)
    const created = await gql(create, { data }, editor)
    expect(created.errors).toBeUndefined()
    const post = created.data?.createPost
    expect(post).toMatchObject({
      title: 'From GraphQL',
      status: 'published',
      tags: ['tips'],
      category: { name: 'News' },
      links: [{ url: 'https://example.com', id: expect.any(String) }],
      layout: [
        { __typename: 'HeroBlock', heading: 'Hello' },
        { __typename: 'QuoteBlock', text: 'Quoted' },
      ],
    })
    expect(post.body.content).toHaveLength(2)

    const updated = await gql(
      'mutation ($id: ID!) { updatePost(id: $id, data: { views: 7, seo: { title: "S" } }, locale: en) { views seo { title } } }',
      { id: post.id },
      editor,
    )
    expect(updated.data?.updatePost).toEqual({ views: 7, seo: { title: 'S' } })

    const invalid = await gql(
      'mutation ($id: ID!) { updatePost(id: $id, data: { title: null }, locale: en) { id } }',
      { id: post.id },
      editor,
    )
    expect(code(invalid)).toBe('VALIDATION_ERROR')
    expect(invalid.errors?.[0]?.extensions?.fields).toEqual([
      { field: 'title', message: expect.any(String) },
    ])

    const remove = 'mutation ($id: ID!) { deletePost(id: $id) { id } }'
    expect(code(await gql(remove, { id: post.id }, editor))).toBe('FORBIDDEN')
    expect((await gql(remove, { id: post.id }, admin)).data?.deletePost).toEqual({ id: post.id })
    expect(code(await gql(remove, { id: post.id }, admin))).toBe('NOT_FOUND')
  })

  it('updates globals', async () => {
    const update = 'mutation { updateSiteSettings(data: { name: "ไซต์" }, locale: th) { name } }'
    expect(code(await gql(update, {}, editor))).toBe('FORBIDDEN')
    expect((await gql(update, {}, admin)).data?.updateSiteSettings).toEqual({ name: 'ไซต์' })
  })

  it('lets API keys do what they may', async () => {
    const owner = await cms.find('users', { where: { email: { equals: 'admin@x.co' } } })
    const { key } = await cms.createApiKey({
      name: 'reader',
      user: owner.docs[0]?.id as number,
      permissions: { collections: { posts: ['read'], categories: ['read'] } },
    })
    expect((await gql('{ posts { totalDocs } }', {}, key)).data?.posts.totalDocs).toBe(12)
    expect(code(await gql('mutation { createPost(data: { title: "x" }) { id } }', {}, key))).toBe(
      'FORBIDDEN',
    )
  })
})

describe('over HTTP', () => {
  const get = (search: string, headers: Record<string, string> = {}) =>
    handle(new Request(`${ORIGIN}/api/cms/graphql${search}`, { headers }))

  it('answers queries over GET, never mutations', async () => {
    const ok = await get(`?query=${encodeURIComponent('{ posts { totalDocs } }')}`)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ data: { posts: { totalDocs: 12 } } })
    const mutation = await get(
      `?query=${encodeURIComponent('mutation { deletePost(id: 1) { id } }')}`,
    )
    expect(mutation.status).toBe(405)
    expect(mutation.headers.get('allow')).toBe('POST')
  })

  it('shows GraphiQL to browsers outside production', async () => {
    const page = await get('', { accept: 'text/html' })
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(await page.text()).toContain('graphiql@3.8.3')
    expect((await get('')).status).toBe(400)
  })

  it('refuses bad requests with 400, and the GraphQL response type when asked', async () => {
    const parse = await gql('{ posts { ')
    expect(parse.status).toBe(400)
    const unknown = await gql('{ posts { docs { nope } } }')
    expect(unknown.status).toBe(400)
    expect(unknown.errors?.[0]?.message).toMatch(/nope/)
    const modern = await handle(
      new Request(`${ORIGIN}/api/cms/graphql`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/graphql-response+json',
        },
        body: JSON.stringify({ query: '{ postCount }' }),
      }),
    )
    expect(modern.headers.get('content-type')).toContain('application/graphql-response+json')
  })

  it('checks where browser writes come from', async () => {
    const response = await handle(
      new Request(`${ORIGIN}/api/cms/graphql`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `ecms-session=${encodeURIComponent(admin)}`,
          origin: 'https://evil.test',
        },
        body: JSON.stringify({ query: 'mutation { deletePost(id: 1) { id } }' }),
      }),
    )
    expect(response.status).toBe(403)
  })
})

describe('limits', () => {
  it('refuses queries that go too deep', async () => {
    const deep = await gql(
      '{ posts { docs { category { parent { parent { parent { parent { name } } } } } } } }',
    )
    expect(deep.status).toBe(400)
    expect(code(deep)).toBe('QUERY_TOO_DEEP')
    // Introspection is not counted.
    const introspection = await gql(
      '{ __schema { types { fields { type { ofType { ofType { ofType { ofType { name } } } } } } } } }',
    )
    expect(introspection.errors).toBeUndefined()
  })

  it('stops at the most documents one request may load', async () => {
    const options = {
      schema: buildGraphQLSchema(cms.config),
      depth: 7,
      documents: 5,
      introspection: false,
      graphiql: false,
    }
    const result = await runGraphQL(
      cms as unknown as EasyCMS,
      null,
      { query: '{ posts(limit: 10) { totalDocs } }' },
      options,
    )
    expect((result.body as Result).errors?.[0]?.extensions?.code).toBe('QUERY_TOO_LARGE')
    const introspection = await runGraphQL(
      cms as unknown as EasyCMS,
      null,
      { query: '{ __schema { queryType { name } } }' },
      options,
    )
    expect(introspection.status).toBe(400)
    expect(
      await gql('{ posts(limit: 101) { totalDocs } }').then((r) => r.errors?.[0]?.message),
    ).toMatch(/between 1 and 100/)
  })
})

describe('easy-cms generate:graphql', () => {
  it('writes the schema for codegen', async () => {
    const command = cms.config.cliCommands.find((c) => c.name === 'generate:graphql')
    const lines: string[] = []
    const out = join(dir, 'schema.graphql')
    expect(
      await command?.run({
        cms: cms as unknown as EasyCMS,
        args: [out],
        flags: {},
        log: (l) => lines.push(l),
      }),
    ).toBe(0)
    expect(readFileSync(out, 'utf8')).toContain('type Post {')
    expect(lines).toEqual([`Wrote ${out}`])
  })
})
