import {
  type AdminNavNode,
  type AdminSchema,
  createRestHandler,
  defineConfig,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** The admin's menu, edit layouts and conditions, numbers and search (0.47). */
const config = defineConfig({
  secret: SECRET,
  db: db(),
  admin: {
    nav: [
      {
        id: 'shop',
        label: 'Shop',
        icon: 'store',
        children: [{ id: 'catalog', label: 'Catalog' }],
      },
      // The site renames a built-in group.
      { id: 'content', label: 'Writing' },
    ],
    pages: [
      { path: 'report', label: 'Report', component: 'ecms-report', group: 'shop' },
      { path: 'hidden', label: 'Hidden', component: 'ecms-hidden', group: false },
    ],
    commands: [{ label: 'Paid orders', href: '/collections/orders?f_status=paid' }],
  },
  collections: [
    { slug: 'posts', useAsTitle: 'title', fields: [{ name: 'title', type: 'text' }] },
    {
      slug: 'pages',
      useAsTitle: 'title',
      // Before posts in their group.
      admin: { order: 1 },
      fields: [{ name: 'title', type: 'text' }],
    },
    {
      slug: 'products',
      useAsTitle: 'name',
      admin: {
        group: 'shop.catalog',
        layout: [
          { tab: 'Product', fields: ['name', { row: ['price', 'sku'] }] },
          {
            tab: 'Shipping',
            fields: [{ collapsible: 'Size', collapsed: true, fields: ['weight'] }],
          },
        ],
      },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'price', type: 'number', admin: { width: '2/3' } },
        { name: 'sku', type: 'text', admin: { description: 'Stock keeping unit' } },
        { name: 'weight', type: 'number' },
        { name: 'digital', type: 'boolean' },
        {
          name: 'download',
          type: 'text',
          required: true,
          admin: { condition: { field: 'digital', equals: true } },
        },
        // Not placed: follows in the first tab.
        { name: 'notes', type: 'textarea' },
        // Hidden from editors: not in their layout.
        { name: 'cost', type: 'number', access: { read: ({ user }) => user?.role === 'admin' } },
      ],
    },
    {
      slug: 'orders',
      useAsTitle: 'number',
      admin: {
        group: 'shop',
        badge: { where: { status: { equals: 'paid' } }, label: 'to send' },
        empty: { description: 'No orders yet.' },
      },
      fields: [
        { name: 'number', type: 'text' },
        { name: 'status', type: 'select', options: ['pending', 'paid'] },
      ],
    },
    // A label still makes a group of its own.
    {
      slug: 'notes',
      admin: { group: 'Notebook', count: false },
      fields: [{ name: 'text', type: 'text' }],
    },
  ],
  globals: [
    { slug: 'site', fields: [{ name: 'name', type: 'text' }] },
    { slug: 'promo', admin: { group: 'shop' }, fields: [{ name: 'text', type: 'text' }] },
  ],
})

const BASE = 'http://cms.test/api/cms'
type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
let handle: RestHandler
const token: Record<string, string> = {}

async function get<T>(path: string, who = 'admin'): Promise<T> {
  const response = await handle(
    new Request(`${BASE}${path}`, { headers: { authorization: `Bearer ${token[who]}` } }),
  )
  return (await response.json()) as T
}

/** The menu as nested ids and item keys, for comparing. */
function shape(nodes: readonly AdminNavNode[]): unknown[] {
  return nodes.map((n) => {
    if (n.kind === 'group') return { [n.id]: shape(n.items) }
    if (n.kind === 'collection' || n.kind === 'global') return `${n.kind}:${n.slug}`
    if (n.kind === 'page') return `page:${n.path}`
    return `view:${n.view}`
  })
}

beforeAll(async () => {
  cms = await open(config)
  handle = createRestHandler(cms)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['editor@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    token[role] = (await cms.auth.login({ email, password: 'password123' })).token
  }
  await cms.create('orders', { number: 'A1', status: 'paid' })
  await cms.create('orders', { number: 'A2', status: 'paid' })
  await cms.create('orders', { number: 'A3', status: 'pending' })
  await cms.create('products', { name: 'Blue mug', download: 'x' })
  await cms.create('products', { name: 'Red mug', download: 'x' })
})
afterAll(() => cms.destroy())

describe('the menu', () => {
  it('groups collections, globals, pages and settings, in order', async () => {
    const schema = await get<AdminSchema>('/admin/schema')
    expect(shape(schema.nav)).toEqual([
      { content: ['collection:pages', 'collection:posts'] },
      'collection:media',
      {
        shop: [
          'collection:orders',
          'global:promo',
          'page:report',
          { 'shop.catalog': ['collection:products'] },
        ],
      },
      { 'label:"Notebook"': ['collection:notes'] },
      {
        settings: [
          { 'settings.site': ['global:site'] },
          { 'settings.people': ['collection:users'] },
          { 'settings.system': ['view:backups', 'view:email'] },
        ],
      },
    ])
    const content = schema.nav[0]
    expect(content?.kind === 'group' && content.label).toBe('Writing')
    expect(schema.commands).toEqual([
      { label: 'Paid orders', href: '/collections/orders?f_status=paid' },
    ])
  })

  it('leaves out what a user may not open, and empty groups', async () => {
    const schema = await get<AdminSchema>('/admin/schema', 'editor')
    const settings = schema.nav.find((n) => n.kind === 'group' && n.id === 'settings')
    // Editors have no Settings pages; they still see the site global.
    expect(settings && shape([settings])).toEqual([
      {
        settings: [
          { 'settings.site': ['global:site'] },
          { 'settings.people': ['collection:users'] },
        ],
      },
    ])
  })
})

describe('edit layouts and conditions', () => {
  it('sends the layout, with fields not placed in the first tab and unreadable ones left out', async () => {
    const schema = await get<AdminSchema>('/admin/schema', 'editor')
    const products = schema.collections.find((c) => c.slug === 'products')
    expect(products?.layout).toEqual([
      {
        type: 'tab',
        label: 'Product',
        nodes: [
          { type: 'field', name: 'name' },
          { type: 'row', fields: ['price', 'sku'] },
          { type: 'field', name: 'digital' },
          { type: 'field', name: 'download' },
          { type: 'field', name: 'notes' },
        ],
      },
      {
        type: 'tab',
        label: 'Shipping',
        nodes: [
          {
            type: 'collapsible',
            label: 'Size',
            collapsed: true,
            nodes: [{ type: 'field', name: 'weight' }],
          },
        ],
      },
    ])
    const field = (name: string) => products?.fields.find((f) => f.name === name)
    expect(field('price')?.width).toBe('2/3')
    expect(field('sku')?.description).toBe('Stock keeping unit')
    expect(field('download')?.condition).toEqual({ field: 'digital', equals: true })
  })

  it("doesn't require a field its condition hides", async () => {
    await expect(cms.create('products', { name: 'Poster' })).resolves.toBeTruthy()
    await expect(cms.create('products', { name: 'E-book', digital: true })).rejects.toThrow(
      /download/,
    )
  })

  it('checks layouts, groups and conditions in the config', async () => {
    const bad = (collection: Record<string, unknown>) =>
      open(defineConfig({ secret: SECRET, db: db(), collections: [collection as never] }))
    await expect(
      bad({ slug: 'a', admin: { layout: ['nope'] }, fields: [{ name: 'x', type: 'text' }] }),
    ).rejects.toThrow(/no top-level field "nope"/)
    await expect(
      bad({
        slug: 'a',
        admin: { layout: [{ tab: 'A', fields: ['x'] }, 'y'] },
        fields: [
          { name: 'x', type: 'text' },
          { name: 'y', type: 'text' },
        ],
      }),
    ).rejects.toThrow(/every entry at the top is a tab/)
    await expect(
      bad({ slug: 'a', admin: { group: 'shop.nope' }, fields: [{ name: 'x', type: 'text' }] }),
    ).rejects.toThrow(/no menu group "shop.nope"/)
    await expect(
      bad({
        slug: 'a',
        fields: [
          { name: 'x', type: 'text', admin: { condition: { field: 'ghost', exists: true } } },
        ],
      }),
    ).rejects.toThrow(/"ghost" is not a field beside it/)
  })
})

describe('numbers and search', () => {
  it('counts documents and badges for the menu', async () => {
    const result = await get<{ counts: Record<string, number>; badges: Record<string, number> }>(
      '/admin/counts',
    )
    expect(result.counts).toMatchObject({ orders: 3, posts: 0 })
    expect(result.counts.notes).toBeUndefined()
    expect(result.badges).toEqual({ orders: 2 })
  })

  it('finds documents by title, and by id', async () => {
    const found = await get<{ docs: { collection: string; title: string }[] }>(
      '/admin/search?q=mug',
    )
    expect(found.docs.map((d) => d.title).sort()).toEqual(['Blue mug', 'Red mug'])
    const byId = await get<{ docs: { collection: string; id: number }[] }>('/admin/search?q=1')
    expect(byId.docs.some((d) => d.collection === 'orders' && d.id === 1)).toBe(true)
  })

  it('needs a user', async () => {
    const response = await handle(new Request(`${BASE}/admin/search?q=mug`))
    expect(response.status).toBe(401)
  })
})
