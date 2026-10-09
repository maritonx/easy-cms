import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  consoleEmail,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { formBuilderPlugin } from '@easy-cms/plugin-form-builder'
import { findByPath, getTree, nestedDocsPlugin } from '@easy-cms/plugin-nested-docs'
import { redirectsPlugin, resolveRedirect } from '@easy-cms/plugin-redirects'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { multiTenantPlugin, tenantContext } from '../src/index.js'

/** The official plugins inside tenants: pages, redirects and forms of one tenant only. */

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  email: consoleEmail({ from: 'site@x.test', log: () => {} }),
  collections: [
    {
      slug: 'pages',
      useAsTitle: 'title',
      drafts: true,
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
      ],
    },
  ],
  plugins: [
    nestedDocsPlugin({ collections: ['pages'] }),
    redirectsPlugin({ collections: ['pages'], url: ({ doc }) => `${doc.path}` }),
    formBuilderPlugin({ minSubmitTime: 0, defaultTo: 'owner@x.test' }),
    multiTenantPlugin({ collections: ['pages', 'redirects', 'forms', 'form-submissions'] }),
  ],
})

let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
let a: number
let b: number
const as = (tenant: number) => ({ context: { tenant, allTenants: false } })

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-tenant-plugins-'))
  cms = await createEasyCMS(config, {
    cwd: dir,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
  handle = createRestHandler(cms)
  a = (await cms.create('tenants', { name: 'A', slug: 'a', domains: [{ domain: 'a.test' }] }))
    .id as number
  b = (await cms.create('tenants', { name: 'B', slug: 'b', domains: [{ domain: 'b.test' }] }))
    .id as number
})

afterAll(async () => {
  await cms.destroy()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Windows may still hold the SQLite file; the OS cleans temp.
  }
})

const page = (title: string, tenant: number, parent?: unknown) =>
  cms.create('pages', { title, status: 'published', ...(parent ? { parent } : {}) } as never, {
    ...as(tenant),
    depth: 0,
  })

describe('nested pages', () => {
  it('have the same paths in each tenant, and are found in the right one', async () => {
    const aboutA = await page('About', a)
    const aboutB = await page('About', b)
    // Both top-level pages keep their slug: paths only differ within a tenant.
    expect([aboutA.slug, aboutB.slug]).toEqual(['about', 'about'])
    await page('Team', a, aboutA.id)
    const inA = await findByPath(cms, 'pages', '/about', {
      context: await tenantContext(cms as never, { host: 'a.test' }),
    })
    const inB = await findByPath(cms, 'pages', '/about', as(b))
    expect(inA?.id).toBe(aboutA.id)
    expect(inB?.id).toBe(aboutB.id)
    const tree = await getTree(cms, 'pages', as(a))
    expect(tree.map((n) => [n.path, n.children.map((c) => c.path)])).toEqual([
      ['/about', ['/about/team']],
    ])
    // Another page in A can't take the same path.
    expect((await page('About', a)).slug).toBe('about-2')
  })
})

describe('redirects', () => {
  it('belong to the tenant of the page that moved, and resolve in it', async () => {
    const moving = await page('Old name', a)
    await cms.update('pages', moving.id, { slug: 'new-name', status: 'published' } as never, as(a))
    const [redirect] = (await cms.find('redirects', { depth: 0 })).docs
    expect(redirect?.tenant).toBe(a)
    expect(await resolveRedirect(cms, '/old-name', as(a))).toEqual({
      location: '/new-name',
      status: 301,
    })
    expect(await resolveRedirect(cms, '/old-name', as(b))).toBeNull()
    // Each tenant has its own redirects from the same path.
    await cms.create('redirects', { from: '/old-name', to: '/elsewhere' } as never, as(b))
    expect((await resolveRedirect(cms, '/old-name', as(b)))?.location).toBe('/elsewhere')
  })
})

describe('forms', () => {
  it('are found by slug in the tenant of the request, and keep its submissions', async () => {
    const fields = [{ blockType: 'text', name: 'name', label: 'Name', required: true }]
    for (const [tenant, title] of [
      [a, 'Contact A'],
      [b, 'Contact B'],
    ] as const)
      await cms.create(
        'forms',
        { title, slug: 'contact', status: 'published', fields } as never,
        as(tenant),
      )
    const load = async (host: string) =>
      (await (
        await handle(new Request(`http://${host}/api/cms/form/contact`, { headers: { host } }))
      ).json()) as { title: string; token: string }
    const form = await load('b.test')
    expect(form.title).toBe('Contact B')
    const sent = await handle(
      new Request('http://b.test/api/cms/form/contact/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://b.test', host: 'b.test' },
        body: JSON.stringify({ data: { name: 'Somchai' }, token: form.token }),
      }),
    )
    expect(sent.status).toBe(200)
    const [submission] = (await cms.find('form-submissions', { depth: 1 })).docs
    expect(submission?.tenant).toEqual(expect.objectContaining({ id: b }))
    expect(submission?.form).toEqual(expect.objectContaining({ title: 'Contact B' }))
  })
})
