import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AdminCollection,
  type AdminSchema,
  type Config,
  createRestHandler,
  defineConfig,
  ForbiddenError,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const PASSWORD = 'password123'
const BASE = 'http://cms.test/api/cms'

/** A plugin that adds a field, an endpoint and an admin module, like official plugins do. */
const statsPlugin = (config: Config): Config => ({
  ...config,
  admin: { ...config.admin, modules: [...(config.admin?.modules ?? []), './admin/stats.js'] },
  endpoints: [
    ...(config.endpoints ?? []),
    {
      path: '/stats/:collection',
      method: 'get',
      handler: async ({ params, user, cms }) => {
        if (!user) throw new ForbiddenError('Log in first')
        const { totalDocs } = await cms.find(params.collection as string, {
          limit: 0,
          user,
          overrideAccess: false,
        })
        return { collection: params.collection, totalDocs }
      },
    },
    {
      path: '/stats/echo',
      method: 'post',
      handler: async ({ json, url }) => ({ got: await json(), q: url.searchParams.get('q') }),
    },
    {
      path: '/stats/raw',
      method: 'get',
      handler: () =>
        new Response('plain', { status: 202, headers: { 'content-type': 'text/plain' } }),
    },
  ],
})

const config = defineConfig({
  secret: SECRET,
  db: db(),
  admin: { modules: ['@easy-cms/missing-plugin/admin'] },
  collections: [
    {
      slug: 'posts',
      admin: { sidebar: [{ tag: 'ecms-stats-panel', props: { compact: true } }] },
      fields: [
        {
          name: 'title',
          type: 'text',
          admin: { after: ['ecms-length-meter'] },
        },
        {
          name: 'meta',
          type: 'group',
          fields: [
            {
              name: 'color',
              type: 'text',
              admin: {
                component: { tag: 'ecms-color', props: { swatches: ['#fff'], fn: () => 1 } },
              },
            },
          ],
        },
      ],
    },
  ],
  plugins: [statsPlugin],
})

let cms: Awaited<ReturnType<typeof open<typeof config>>>
let handle: RestHandler
let errors: string[]
let cwd: string

beforeAll(async () => {
  // Not tempProject(): that is removed after each test, and modules are read on each request.
  cwd = mkdtempSync(join(tmpdir(), 'easy-cms-plugins-'))
  mkdirSync(join(cwd, 'admin'))
  writeFileSync(
    join(cwd, 'admin/stats.js'),
    "customElements.define('ecms-stats-panel', class extends HTMLElement {})\n",
  )
  cms = await open(config, cwd)
  errors = []
  Object.assign(cms, { logger: { ...cms.logger, error: (m: string) => errors.push(m) } })
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: PASSWORD, role: 'admin' })
  await cms.create('posts', { title: 'One' })
  await cms.create('posts', { title: 'Two' })
})
afterAll(async () => {
  await cms.destroy()
  rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

async function call(path: string, init: RequestInit = {}) {
  return handle(new Request(`${BASE}${path}`, init))
}

async function login() {
  const response = await call('/users/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@x.co', password: PASSWORD }),
  })
  const body = (await response.json()) as { csrfToken: string }
  const session = response.headers
    .getSetCookie()
    .find((c) => c.startsWith('ecms-session='))
    ?.split(';')[0] as string
  return { cookie: session, 'x-csrf-token': body.csrfToken, origin: 'http://cms.test' }
}

describe('custom endpoints', () => {
  it('runs handlers with path params, the user and the Local API', async () => {
    expect((await call('/stats/posts')).status).toBe(403)
    const headers = await login()
    const response = await call('/stats/posts', { headers })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ collection: 'posts', totalDocs: 2 })
  })

  it('prefers fixed segments over parameters, reads JSON bodies and passes Responses through', async () => {
    const headers = await login()
    const echo = await call('/stats/echo?q=1', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    })
    expect(await echo.json()).toEqual({ got: { a: 1 }, q: '1' })
    const raw = await call('/stats/raw')
    expect(raw.status).toBe(202)
    expect(await raw.text()).toBe('plain')
  })

  it('applies the CSRF check to cookie writes and answers 405 for other methods', async () => {
    const { cookie } = await login()
    const noCsrf = await call('/stats/echo', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(noCsrf.status).toBe(403)
    const wrong = await call('/stats/echo', { method: 'DELETE', headers: await login() })
    expect(wrong.status).toBe(405)
    // GET /stats/echo would match /stats/:collection.
    expect(wrong.headers.get('allow')).toBe('GET, POST')
  })
})

describe('admin components', () => {
  it('puts components, panels and module URLs in the admin schema', async () => {
    const response = await call('/admin/schema', { headers: await login() })
    const schema = (await response.json()) as AdminSchema
    const posts = schema.collections.find((c) => c.slug === 'posts') as AdminCollection
    expect(posts.sidebar).toEqual([{ tag: 'ecms-stats-panel', props: { compact: true } }])
    expect(posts.fields[0]?.admin).toEqual({ after: [{ tag: 'ecms-length-meter' }] })
    // Props are sent as JSON: functions are dropped.
    expect(posts.fields[1]?.fields?.[0]?.admin).toEqual({
      component: { tag: 'ecms-color', props: { swatches: ['#fff'] } },
    })
    // The missing package is skipped (and logged); the plugin's module is the second entry.
    expect(schema.modules).toEqual(['/admin/modules/1.js'])
    expect(errors.join('\n')).toContain('@easy-cms/missing-plugin/admin')
  })

  it('serves module code to logged-in users, with an ETag', async () => {
    expect((await call('/admin/modules/1.js')).status).toBe(401)
    const headers = await login()
    const response = await call('/admin/modules/1.js', { headers })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/javascript')
    expect(await response.text()).toContain("customElements.define('ecms-stats-panel'")
    const etag = response.headers.get('etag') as string
    const cached = await call('/admin/modules/1.js', {
      headers: { ...headers, 'if-none-match': etag },
    })
    expect(cached.status).toBe(304)
    expect((await call('/admin/modules/0.js', { headers })).status).toBe(404)
    expect((await call('/admin/modules/..%2Fx.js', { headers })).status).toBe(404)
  })
})
