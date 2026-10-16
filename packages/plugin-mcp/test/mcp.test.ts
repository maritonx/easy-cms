import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  resolveConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTools, mcpPlugin } from '../src/index.js'

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  apiKeys: true,
  localization: { locales: ['th', 'en'] },
  collections: [
    {
      slug: 'categories',
      labels: { plural: 'Categories' },
      access: { read: () => true },
      fields: [{ name: 'name', type: 'text', required: true }],
    },
    {
      slug: 'notes',
      fields: [
        { name: 'text', type: 'text' },
        { name: 'secret', type: 'text', access: { read: () => false } },
      ],
    },
    {
      slug: 'posts',
      labels: { plural: { en: 'Posts', th: 'บทความ' } },
      drafts: true,
      versions: true,
      schedule: true,
      access: {
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
        create: ({ user }) => !!user,
        update: ({ user }) => !!user,
        delete: ({ user }) => user?.role === 'admin',
      },
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        { name: 'body', type: 'richText' },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'cover', type: 'upload' },
        { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true },
      ],
    },
  ],
  globals: [
    { slug: 'site', fields: [{ name: 'name', type: 'text' }] },
    { slug: 'banner', drafts: true, versions: true, fields: [{ name: 'text', type: 'text' }] },
  ],
  plugins: [mcpPlugin({ instructions: 'Write in a friendly tone.' })],
})

let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
const ORIGIN = 'http://cms.test'

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-mcp-'))
  cms = await createEasyCMS(config, {
    cwd: dir,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'ed@x.co', password: 'password123', role: 'editor' })
  await cms.create('categories', { name: 'News' })
})
afterAll(async () => {
  await cms.destroy()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Windows may still hold the SQLite file; the OS cleans temp.
  }
})

async function keyFor(email: string, permissions: object) {
  const [owner] = (await cms.find('users', { where: { email: { equals: email } } })).docs
  return (
    await cms.createApiKey({ name: `key for ${email}`, user: owner?.id as number, permissions })
  ).key
}

/** A real MCP client, talking Streamable HTTP to the REST handler (no network). */
async function connect(key: string | undefined) {
  const client = new Client({ name: 'test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${ORIGIN}/api/cms/mcp`), {
    ...(key ? { requestInit: { headers: { authorization: `Bearer ${key}` } } } : {}),
    fetch: (url, init) => handle(new Request(url, init)),
  })
  // The SDK's own types disagree under exactOptionalPropertyTypes; the objects are compatible.
  await client.connect(transport as Parameters<Client['connect']>[0])
  return client
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean
    content: { type: string; text: string }[]
  }
  const text = result.content[0]?.text ?? ''
  return {
    error: result.isError === true,
    text,
    json: result.isError ? undefined : JSON.parse(text),
  }
}

describe('mcpPlugin', () => {
  it('needs apiKeys', async () => {
    const { apiKeys: _apiKeys, ...rest } = config
    await expect(resolveConfig(rest as Config)).rejects.toThrow('set `apiKeys: true`')
  })

  it('refuses requests without an API key', async () => {
    const response = await handle(
      new Request(`${ORIGIN}/api/cms/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    )
    expect(response.status).toBe(401)
    await expect(connect(undefined)).rejects.toThrow()
  })

  it('lists tools for exactly what the key allows, with instructions', async () => {
    const client = await connect(
      await keyFor('admin@x.co', {
        collections: { posts: ['read', 'create', 'update', 'publish'], categories: ['read'] },
        globals: { site: ['read'] },
      }),
    )
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_posts',
      'find_categories',
      'find_posts',
      'get_categories',
      'get_global_site',
      'get_posts',
      'publish_posts',
      'schedule_posts',
      'unpublish_posts',
      'update_posts',
    ])
    const create = tools.find((t) => t.name === 'create_posts')
    expect(create?.description).toContain('saved as a draft')
    const properties = create?.inputSchema.properties as Record<
      string,
      { properties: Record<string, unknown> }
    >
    const data = properties.data as { properties: Record<string, unknown> }
    expect(Object.keys(data.properties)).toEqual(['title', 'body', 'category', 'cover', 'tags'])
    expect(data.properties.tags).toMatchObject({ type: 'array', items: { enum: ['a', 'b'] } })
    expect(client.getInstructions()).toContain('Write in a friendly tone.')
    await client.close()
  })

  it('creates drafts, publishes only on request, and turns plain text into rich text', async () => {
    const client = await connect(
      await keyFor('admin@x.co', {
        collections: { posts: ['read', 'create', 'update', 'publish'], categories: ['read'] },
      }),
    )
    const news = await call(client, 'find_categories', { where: { name: { equals: 'News' } } })
    const categoryId = news.json.docs[0].id

    // Even when asked for "published", create saves a draft.
    const created = await call(client, 'create_posts', {
      data: {
        title: 'สวัสดี',
        body: 'First paragraph.\n\nSecond one.',
        category: categoryId,
        status: 'published',
      },
      locale: 'th',
    })
    expect(created.error).toBe(false)
    expect(created.json.status).toBe('draft')
    expect(created.json.body.content).toHaveLength(2)
    const id = created.json.id

    await call(client, 'update_posts', { id, data: { title: 'Hello' }, locale: 'en' })
    const found = await call(client, 'find_posts', {
      where: { title: { like: 'Hello' } },
      locale: 'en',
    })
    expect(found.json.totalDocs).toBe(1)
    // Visitors don't see it yet.
    expect((await cms.find('posts', { overrideAccess: false, user: null })).totalDocs).toBe(0)

    const published = await call(client, 'publish_posts', { id })
    expect(published.json.status).toBe('published')
    expect((await cms.find('posts', { overrideAccess: false, user: null })).totalDocs).toBe(1)

    // An update after publishing is a draft again: the live version stays as it was.
    await call(client, 'update_posts', { id, data: { title: 'Draft change' }, locale: 'en' })
    const live = await cms.findById('posts', id, { locale: 'en' })
    expect(live?.title).toBe('Hello')
    await client.close()
  })

  it('reports errors the assistant can act on', async () => {
    const client = await connect(
      await keyFor('ed@x.co', { collections: { posts: ['read', 'create', 'delete'] } }),
    )
    const invalid = await call(client, 'create_posts', { data: { tags: ['zzz'] } })
    expect(invalid.error).toBe(true)
    expect(invalid.text).toContain('Invalid data: tags')
    const post = await call(client, 'create_posts', { data: { title: 'Mine' } })
    // The key lists delete, but editors may not delete posts.
    const denied = await call(client, 'delete_posts', { id: post.json.id })
    expect(denied).toMatchObject({ error: true })
    // Tools the key doesn't have are not there.
    expect((await call(client, 'publish_posts', { id: post.json.id })).text).toContain(
      'Unknown tool',
    )
    const missing = await call(client, 'get_posts', { id: 999 })
    expect(missing.text).toContain('No posts document with id 999')
    await client.close()
  })

  it('uploads media as base64', async () => {
    const client = await connect(
      await keyFor('admin@x.co', { collections: { media: ['read', 'create'] } }),
    )
    // A 1×1 PNG.
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const uploaded = await call(client, 'upload_media', {
      filename: 'dot.png',
      data: png,
      alt: 'A dot',
    })
    expect(uploaded.error).toBe(false)
    expect(uploaded.json).toMatchObject({
      mimeType: 'image/png',
      alt: 'A dot',
      width: 1,
      height: 1,
    })
    await client.close()
  })

  it('answers clients on older protocol versions', async () => {
    const key = await keyFor('admin@x.co', { collections: { categories: ['read'] } })
    for (const protocolVersion of ['2024-11-05', '2025-03-26', '2025-06-18']) {
      const response = await handle(
        new Request(`${ORIGIN}/api/cms/mcp`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion,
              capabilities: {},
              clientInfo: { name: 'old', version: '1' },
            },
          }),
        }),
      )
      const { result } = (await response.json()) as {
        result: { protocolVersion: string; serverInfo: { name: string } }
      }
      expect(result).toMatchObject({ protocolVersion, serverInfo: { name: 'easy-cms' } })
    }
  })

  it('unpublishes, schedules and deletes', async () => {
    const client = await connect(
      await keyFor('admin@x.co', {
        collections: { posts: ['read', 'create', 'update', 'delete', 'publish'] },
      }),
    )
    const visible = async () =>
      (
        await cms.find('posts', {
          overrideAccess: false,
          user: null,
          where: { id: { equals: id } },
        })
      ).totalDocs
    const id = (await call(client, 'create_posts', { data: { title: 'Soon' } })).json.id
    await call(client, 'publish_posts', { id })
    expect(await visible()).toBe(1)
    const unpublished = await call(client, 'unpublish_posts', { id })
    expect(unpublished.json.status).toBe('draft')
    expect(await visible()).toBe(0)

    const at = new Date(Date.now() + 86_400_000).toISOString()
    const scheduled = await call(client, 'schedule_posts', { id, action: 'publish', at })
    expect(scheduled.json).toMatchObject({ action: 'publish', state: 'pending' })
    expect(await cms.findSchedule('posts', id)).toHaveLength(1)

    expect((await call(client, 'delete_posts', { id })).error).toBe(false)
    expect((await call(client, 'get_posts', { id })).text).toContain(`No posts document with id`)
    await client.close()
  })

  it('reads every language at once with locale "all"', async () => {
    const client = await connect(
      await keyFor('admin@x.co', { collections: { posts: ['read', 'create', 'update'] } }),
    )
    const id = (await call(client, 'create_posts', { data: { title: 'สวัสดี' }, locale: 'th' })).json
      .id
    await call(client, 'update_posts', { id, data: { title: 'Hello' }, locale: 'en' })
    const all = await call(client, 'get_posts', { id, locale: 'all' })
    expect(all.json.title).toEqual({ th: 'สวัสดี', en: 'Hello' })
    await client.close()
  })

  it('reads, changes and publishes globals', async () => {
    const client = await connect(
      await keyFor('admin@x.co', {
        globals: { site: ['read', 'update'], banner: ['read', 'update', 'publish'] },
      }),
    )
    const names = (await client.listTools()).tools.map((t) => t.name).sort()
    const tools = (await client.listTools()).tools
    const about = (name: string) => tools.find((t) => t.name === name)?.description
    expect(about('update_global_banner')).toContain('the live settings stay')
    expect(about('update_global_site')).not.toContain('draft')
    expect(names).toEqual([
      'get_global_banner',
      'get_global_site',
      'publish_global_banner',
      'update_global_banner',
      'update_global_site',
    ])
    await call(client, 'update_global_site', { data: { name: 'My site' } })
    expect((await call(client, 'get_global_site')).json.name).toBe('My site')

    // A global with drafts: changes after the first publish stay a draft until published again.
    await call(client, 'update_global_banner', { data: { text: 'Sale' } })
    expect((await call(client, 'publish_global_banner')).json.status).toBe('published')
    await call(client, 'update_global_banner', { data: { text: 'Later', status: 'published' } })
    expect((await cms.findGlobal('banner')).text).toBe('Sale')
    await call(client, 'publish_global_banner')
    expect((await cms.findGlobal('banner')).text).toBe('Later')
    await client.close()
  })

  it('leaves out fields the user may not read', async () => {
    const note = await cms.create('notes', { text: 'Hi', secret: 'hidden' })
    const client = await connect(await keyFor('admin@x.co', { collections: { notes: ['read'] } }))
    const read = await call(client, 'get_notes', { id: note.id })
    expect(read.json.text).toBe('Hi')
    expect(read.json).not.toHaveProperty('secret')
    await client.close()
  })

  it('never offers users or API keys, and offers only the listed collections and globals', async () => {
    const key = await keyFor('admin@x.co', {
      collections: { users: ['read'], 'api-keys': ['read'], categories: ['read'], notes: ['read'] },
      globals: { site: ['read'] },
    })
    const client = await connect(key)
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([
      'find_categories',
      'find_notes',
      'get_categories',
      'get_global_site',
      'get_notes',
    ])
    await client.close()
    const user = await cms.auth.userFromHeaders(new Headers({ authorization: `Bearer ${key}` }))
    const tools = buildTools(cms as never, user as never, { collections: ['notes'], globals: [] })
    expect(tools.map((t) => t.name).sort()).toEqual(['find_notes', 'get_notes'])
  })
})
