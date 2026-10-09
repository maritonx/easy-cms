import {
  type AuthUser,
  createRestHandler,
  defineConfig,
  isSystemAdmin,
  type RequestContext,
} from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** `onRequest`, `context`, globals per scope, `uniqueWithin` on any field and `scoped` users. */

const site = (context: RequestContext) => (context.site as string | undefined) ?? null

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    apiKeys: true,
    collections: [
      {
        slug: 'products',
        access: {
          // Each site sees its own products.
          read: ({ context }) => (context?.site ? { site: { equals: context.site } } : false),
          create: () => true,
        },
        hooks: {
          beforeValidate: [({ data, context }) => ({ ...data, site: data.site ?? site(context) })],
        },
        fields: [
          { name: 'site', type: 'text' },
          { name: 'sku', type: 'text', unique: true, uniqueWithin: 'site' },
        ],
      },
    ],
    globals: [
      {
        slug: 'settings',
        access: { read: () => true, update: () => true },
        scope: ({ context }) => site(context),
        fields: [{ name: 'title', type: 'text' }],
      },
    ],
    // The site from a header; a "site admin" is an admin of that site only.
    onRequest: ({ headers, user }) => ({
      context: { site: headers.get('x-site') ?? undefined },
      user: user && headers.get('x-site') ? { ...user, scoped: true } : user,
    }),
  })

describe('request context', () => {
  it('reaches access rules and hooks, through REST and the Local API', async () => {
    const cms = await open(config())
    const handle = createRestHandler(cms)
    const post = (sku: string, s: string) =>
      handle(
        new Request('http://cms.test/api/cms/products', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-site': s },
          body: JSON.stringify({ sku }),
        }),
      )
    expect((await post('A-1', 'a')).status).toBe(201)
    // Unique within the site only.
    expect((await post('A-1', 'b')).status).toBe(201)
    const again = await post('A-1', 'a')
    expect(again.status).toBe(400)
    expect(((await again.json()) as { errors: { field: string }[] }).errors[0]?.field).toBe('sku')

    const list = (s: string) =>
      cms.find('products', { overrideAccess: false, user: null, context: { site: s } })
    expect((await list('a')).docs.map((d) => d.site)).toEqual(['a'])
    const fromRequest = await cms.forRequest(new Headers({ 'x-site': 'b' }))
    expect(fromRequest.context).toEqual({ site: 'b' })
    await cms.destroy()
  })

  it('keeps a value of a global per scope, and none without one', async () => {
    const cms = await open(config())
    await cms.updateGlobal('settings', { title: 'Shop A' }, { context: { site: 'a' } })
    await cms.updateGlobal('settings', { title: 'Shop B' }, { context: { site: 'b' } })
    expect((await cms.findGlobal('settings', { context: { site: 'a' } })).title).toBe('Shop A')
    expect((await cms.findGlobal('settings', { context: { site: 'b' } })).title).toBe('Shop B')
    expect((await cms.findGlobal('settings')).title).toBeNull()
    await expect(cms.updateGlobal('settings', { title: '?' })).rejects.toThrow(/per scope/)
    await cms.destroy()
  })

  it('makes scoped admins admins of their part only', async () => {
    const cms = await open(config())
    const admin = await cms.create('users', {
      email: 'a@x.co',
      password: 'password123',
      role: 'admin',
    })
    const { token } = await cms.auth.login({ email: 'a@x.co', password: 'password123' })
    expect(isSystemAdmin({ ...admin, role: 'admin' })).toBe(true)
    expect(isSystemAdmin({ ...admin, role: 'admin', scoped: true })).toBe(false)
    const handle = createRestHandler(cms)
    const backups = (headers: Record<string, string>) =>
      handle(
        new Request('http://cms.test/api/cms/admin/backups', {
          headers: { authorization: `Bearer ${token}`, ...headers },
        }),
      )
    expect((await backups({})).status).toBe(200)
    expect((await backups({ 'x-site': 'a' })).status).toBe(403)
    await cms.destroy()
  })

  it('stays with an API key created in it', async () => {
    const cms = await open(config())
    const user = await cms.create('users', {
      email: 'k@x.co',
      password: 'password123',
      role: 'editor',
    })
    const { doc } = await cms.createApiKey(
      { name: 'site a', permissions: { collections: { products: ['read'] } } },
      { overrideAccess: false, user: { ...user, role: 'editor' }, context: { site: 'a' } },
    )
    expect(doc.permissions).toMatchObject({ context: { site: 'a' } })
    // Changing its permissions keeps it; input can't set it.
    const changed = await cms.update(
      'api-keys',
      doc.id as number,
      {
        permissions: { collections: { products: ['read'] }, context: { site: 'b' } },
      } as never,
    )
    expect(changed.permissions).toMatchObject({ context: { site: 'a' } })
    await cms.destroy()
  })

  it('narrows uploads with filterOptions, and keeps values unique within several fields', async () => {
    const cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        collections: [
          {
            slug: 'items',
            fields: [
              { name: 'shop', type: 'text' },
              { name: 'lang', type: 'text' },
              { name: 'code', type: 'text', unique: true, uniqueWithin: ['shop', 'lang'] },
              {
                name: 'photo',
                type: 'upload',
                filterOptions: () => ({ alt: { equals: 'approved' } }),
              },
            ],
          },
        ],
      }),
    )
    const pdf = (alt: string) =>
      cms.upload({ data: new TextEncoder().encode('%PDF-1.4\n%\n'), name: 'a.pdf' }, { alt })
    const ok = await pdf('approved')
    const no = await pdf('draft')
    await expect(cms.create('items', { code: 'x', photo: no.id } as never)).rejects.toThrow(
      /photo: is not one of the allowed choices/,
    )
    await cms.create('items', { code: 'x', shop: 'a', lang: 'th', photo: ok.id } as never)
    await cms.create('items', { code: 'x', shop: 'a', lang: 'en' } as never)
    await cms.create('items', { code: 'x', shop: 'b', lang: 'th' } as never)
    await expect(
      cms.create('items', { code: 'x', shop: 'a', lang: 'th' } as never),
    ).rejects.toThrow(/code: must be unique/)
    await cms.destroy()
  })

  it('keeps audit entries of a scope apart', async () => {
    const cms = await open(
      defineConfig({
        ...config(),
        audit: { scope: ({ context }) => (context.site as string | undefined) ?? null },
      }),
    )
    await cms.create('products', { sku: 'S-1' } as never, { context: { site: 'a' } })
    await cms.create('products', { sku: 'S-2' } as never, { context: { site: 'b' } })
    const inA = await cms.audit.list({ scope: 'a' })
    expect(inA.docs.map((e) => e.action)).toEqual(['create'])
    expect((await cms.audit.list({})).totalDocs).toBe(2)
    // Scoped entries are signed with their scope.
    expect((await cms.audit.verify()).invalid).toEqual([])
    await cms.destroy()
  })
  it('runs a list of onRequest hooks in order, each seeing the user of the one before', async () => {
    const cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        onRequest: [
          ({ headers }) => ({
            context: { site: headers.get('x-site') ?? undefined, step: 1 },
            user: { id: 1, email: 'a@example.com', role: 'admin' } as AuthUser,
          }),
          ({ user }) => ({ user: user && { ...user, role: 'editor' }, context: { step: 2 } }),
          ({ user }) => ({ context: { role: user?.role ?? null } }),
        ],
      }),
    )
    const { user, context } = await cms.forRequest(new Headers({ 'x-site': 'a' }))
    expect(user?.role).toBe('editor')
    expect(context).toMatchObject({ site: 'a', step: 2, role: 'editor' })
    await cms.destroy()
  })
})
