import { describe, expect, expectTypeOf, it } from 'vitest'
import { createClient, EasyCMSClientError } from '../src/client.js'
import { defineConfig } from '../src/index.js'
import { fakeDb } from './helpers.js'

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: fakeDb,
  collections: [
    {
      slug: 'posts',
      drafts: true,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'views', type: 'number' },
      ],
    },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text', required: true }] }],
})

/** A client whose fetch records the requests and answers with `body`. */
function recording(body: unknown = { docs: [] }, status = 200) {
  const requests: { url: URL; init: RequestInit & Record<string, unknown> }[] = []
  const cms = createClient<typeof config>({
    url: 'https://cms.test/api/cms/',
    token: 'key-1',
    fetchOptions: { next: { revalidate: 60 } },
    fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), init: init as never })
      return Response.json(body, { status })
    },
  })
  return { cms, requests }
}

describe('createClient (#336)', () => {
  it('asks the REST API with the query in its own format', async () => {
    const { cms, requests } = recording()
    await cms.find('posts', {
      where: { title: { equals: 'A' } },
      sort: ['-views', 'title'],
      limit: 5,
      page: 2,
      depth: 1,
      locale: 'th',
      fallbackLocale: false,
      count: false,
      draft: true,
      fetch: { next: { tags: ['posts'] } },
    })
    const [req] = requests
    expect(req?.url.pathname).toBe('/api/cms/posts')
    expect(Object.fromEntries(req?.url.searchParams ?? [])).toEqual({
      where: '{"title":{"equals":"A"}}',
      sort: '-views,title',
      limit: '5',
      page: '2',
      depth: '1',
      locale: 'th',
      fallbackLocale: 'false',
      count: 'false',
      draft: 'true',
    })
    // The call's fetch options replace the client's.
    expect(req?.init.next).toEqual({ tags: ['posts'] })
    expect(new Headers(req?.init.headers).get('authorization')).toBe('Bearer key-1')
  })

  it('reads one document, a global and a draft by preview token', async () => {
    const { cms, requests } = recording({ title: 'A' })
    await cms.findById('posts', 7, { preview: 'tok', draft: true })
    await cms.findGlobal('site', { depth: 0 })
    await cms.search('hello', { collections: ['posts'], limit: 3 })
    expect(requests.map((r) => `${r.url.pathname}${r.url.search}`)).toEqual([
      '/api/cms/posts/7?preview=tok',
      '/api/cms/globals/site?depth=0',
      '/api/cms/search?q=hello&collections=posts&limit=3',
    ])
    expect(requests[0]?.init.next).toEqual({ revalidate: 60 })
  })

  it('gives null for a missing document and throws the API’s errors', async () => {
    expect(
      await recording({ errors: [{ message: 'Not found' }] }, 404).cms.findById('posts', 1),
    ).toBeNull()
    const refused = recording({ errors: [{ message: 'Forbidden', code: 'FORBIDDEN' }] }, 403)
    const error = await refused.cms.find('posts').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EasyCMSClientError)
    expect(error).toMatchObject({ status: 403, message: 'Forbidden' })
  })

  it('types documents from the config or from generated types', () => {
    const { cms } = recording()
    expectTypeOf(cms.find('posts')).resolves.toHaveProperty('totalDocs').toEqualTypeOf<number>()
    expectTypeOf(cms.find('posts', { cursor: 'c' }))
      .resolves.toHaveProperty('nextCursor')
      .toEqualTypeOf<string | null>()
    expectTypeOf(cms.findById('posts', 1))
      .resolves.exclude<null>()
      .toHaveProperty('title')
      .toEqualTypeOf<string>()
    expectTypeOf(cms.findGlobal('site')).resolves.toHaveProperty('name').toEqualTypeOf<string>()
    // @ts-expect-error: no such collection
    void cms.find('pages')

    interface Collections {
      pages: { id: number; slug: string }
    }
    const generated = createClient<{ collections: Collections; globals: Record<never, never> }>({
      url: '/api/cms',
    })
    expectTypeOf<ReturnType<typeof generated.findById<'pages'>>>().resolves.toEqualTypeOf<{
      id: number
      slug: string
    } | null>()
  })
})
