import { type Config, createRestHandler, defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const base = {
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      access: { read: () => true },
      fields: [{ name: 'title', type: 'text' }],
    },
    {
      slug: 'pages',
      access: { read: () => true },
      httpCache: { sMaxAge: 5 },
      fields: [{ name: 'title', type: 'text' }],
    },
    {
      slug: 'private',
      access: { read: () => true },
      httpCache: false,
      fields: [{ name: 'title', type: 'text' }],
    },
  ],
  globals: [
    { slug: 'site', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
  ],
} as const

async function setup(extra: Partial<Config> = {}) {
  const cms = await open(defineConfig({ ...base, ...extra } as Config))
  const handle = createRestHandler(cms)
  const get = (path: string, headers: Record<string, string> = {}) =>
    handle(new Request(`http://cms.test/api/cms${path}`, { headers }))
  return { cms, get }
}

describe('httpCache (#174)', () => {
  it('keeps every read no-store unless httpCache is set', async () => {
    const { cms, get } = await setup({ collections: base.collections.slice(0, 1) } as never)
    await cms.create('posts', { title: 'A', status: 'published' })
    const response = await get('/posts')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('etag')).toBeNull()
    await cms.destroy()
  })

  it('lets a CDN cache public reads of published content, with tags and an ETag', async () => {
    const { cms, get } = await setup({ httpCache: {} })
    const post = await cms.create('posts', { title: 'A', status: 'published' })
    await cms.updateGlobal('site', { name: 'Site' })
    const list = await get('/posts')
    expect(list.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    )
    expect(list.headers.get('cache-tag')).toBe('ecms,ecms:posts')
    expect(list.headers.get('surrogate-key')).toBe('ecms ecms:posts')
    const one = await get(`/posts/${post.id}`)
    expect(one.headers.get('cache-tag')).toBe(`ecms,ecms:posts,ecms:posts:${post.id}`)
    const etag = one.headers.get('etag') as string
    expect(etag).toMatch(/^W\/".+"$/)
    // The client (or CDN) has it: 304, no body.
    const again = await get(`/posts/${post.id}`, { 'if-none-match': etag })
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
    expect((await get('/globals/site')).headers.get('cache-tag')).toBe('ecms,ecms:global:site')
    // Per collection: its own times, or off.
    expect((await get('/pages')).headers.get('cache-control')).toContain('s-maxage=5,')
    expect((await get('/private')).headers.get('cache-control')).toBe('no-store')
    await cms.destroy()
  })

  it('keeps reads with a login, a token or drafts out of shared caches', async () => {
    const { cms, get } = await setup({ httpCache: {} })
    await cms.create('users', { email: 'ed@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'ed@x.co', password: 'password123' })
    expect(
      (await get('/posts', { authorization: `Bearer ${token}` })).headers.get('cache-control'),
    ).toBe('no-store')
    expect((await get('/posts?draft=true')).headers.get('cache-control')).toBe('no-store')
    // A cookie that isn't a valid session still isn't public.
    expect(
      (await get('/posts', { cookie: 'ecms-session=expired' })).headers.get('cache-control'),
    ).toBe('no-store')
    await cms.destroy()
  })

  it('purges what readers see change, and not drafts', async () => {
    const purged: string[][] = []
    const { cms } = await setup({ httpCache: { purge: (tags) => void purged.push(tags) } })
    const settle = () => new Promise((r) => setTimeout(r, 10))
    const post = await cms.create('posts', { title: 'Draft' })
    await settle()
    expect(purged).toEqual([])
    await cms.update('posts', post.id, { title: 'Live', status: 'published' })
    await settle()
    expect(purged.at(-1)).toEqual(['ecms', 'ecms:posts', `ecms:posts:${post.id}`])
    // A draft on a published post: readers still see the published one.
    await cms.update('posts', post.id, { title: 'Next', status: 'draft' })
    await settle()
    expect(purged).toHaveLength(1)
    await cms.updateGlobal('site', { name: 'New' })
    await settle()
    expect(purged.at(-1)).toEqual(['ecms', 'ecms:global:site'])
    await cms.delete('posts', post.id)
    await settle()
    expect(purged).toHaveLength(3)
    // Off for this collection: no purge.
    await cms.create('private', { title: 'x' })
    await settle()
    expect(purged).toHaveLength(3)
    await cms.destroy()
  })

  it('logs a purge that fails instead of failing the save', async () => {
    const { cms } = await setup({
      httpCache: {
        purge: () => {
          throw new Error('CDN down')
        },
      },
    })
    await expect(cms.create('pages', { title: 'x' })).resolves.toMatchObject({ title: 'x' })
    await cms.destroy()
  })
})
