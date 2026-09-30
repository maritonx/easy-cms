import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type CollectionConfig,
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  resolveConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { redirectsPlugin, resolveRedirect } from '@easy-cms/plugin-redirects'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findByPath,
  getTree,
  type NestedDocsPluginOptions,
  nestedDocsPlugin,
  normalizePath,
  rebuildNestedDocs,
} from '../src/index.js'

const dirs: string[] = []
const open: { destroy(): Promise<void> }[] = []
afterEach(async () => {
  for (const cms of open.splice(0)) await cms.destroy()
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Windows may still hold the SQLite file; the OS cleans temp.
    }
  }
})

const pages = (extra: Partial<CollectionConfig> = {}): CollectionConfig => ({
  slug: 'pages',
  useAsTitle: 'title',
  access: { read: () => true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'slug', type: 'slug', from: 'title' },
  ],
  ...extra,
})

const base = (
  options: Partial<NestedDocsPluginOptions> = {},
  extra: Partial<Config> = {},
  collection = pages(),
) =>
  defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
    collections: [collection],
    plugins: [nestedDocsPlugin({ collections: ['pages'], ...options })],
    ...extra,
  })

async function start(config: Config, cwd?: string) {
  const dir = cwd ?? mkdtempSync(join(tmpdir(), 'easy-cms-nested-'))
  if (!cwd) dirs.push(dir)
  const cms = await createEasyCMS(config, {
    cwd: dir,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
  open.push(cms)
  return Object.assign(cms, { cwd: dir })
}

const crumbs = (doc: Record<string, unknown>) =>
  (doc.breadcrumbs as { label: string; url: string }[]).map((c) => `${c.label}=${c.url}`)

describe('normalizePath', () => {
  it('gives one leading slash and no trailing one', () => {
    expect(normalizePath('about/team/')).toBe('/about/team')
    expect(normalizePath('/%E0%B8%97%E0%B8%B5%E0%B8%A1?x=1')).toBe('/ทีม')
    expect(normalizePath('')).toBe('/')
  })
})

describe('nestedDocsPlugin config', () => {
  it('adds the fields, the tree list, the endpoint and the command', async () => {
    const config = await resolveConfig(base())
    const collection = config.collections.find((c) => c.slug === 'pages')
    expect(collection?.fields.map((f) => f.name)).toEqual([
      'title',
      'slug',
      'parent',
      'path',
      'breadcrumbs',
    ])
    expect(collection?.fields.find((f) => f.name === 'slug')).toMatchObject({
      uniqueWithin: 'parent',
    })
    expect(collection?.admin?.list?.tree).toBe('parent')
    expect(config.endpoints.map((e) => e.path)).toEqual(['/tree/:collection'])
    expect(config.commands.map((c) => c.name)).toEqual(['nested:rebuild'])
    expect(config.admin.modules).toEqual(['@easy-cms/plugin-nested-docs/admin'])
  })

  it('checks its options', async () => {
    await expect(resolveConfig(base({ collections: ['nope'] }))).rejects.toThrow(
      /unknown collection "nope"/,
    )
    await expect(resolveConfig(base({ slugField: 'handle' }))).rejects.toThrow(
      /slug field "handle"/,
    )
    await expect(resolveConfig(base({ maxDepth: 0 }))).rejects.toThrow(/maxDepth/)
    const taken = pages({
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'slug' },
        { name: 'path', type: 'text' },
      ],
    })
    await expect(resolveConfig(base({}, {}, taken))).rejects.toThrow(/already has a field "path"/)
  })
})

describe('paths and breadcrumbs', () => {
  it('builds them from the parents and keeps them up to date', async () => {
    const cms = await start(base())
    const about = await cms.create('pages', { title: 'About' })
    const team = await cms.create('pages', { title: 'Team', parent: about.id })
    const alice = await cms.create('pages', { title: 'Alice', parent: team.id })

    const stored = await cms.findById('pages', alice.id, { depth: 0 })
    expect(stored?.path).toBe('/about/team/alice')
    expect(crumbs(stored as Record<string, unknown>)).toEqual([
      'About=/about',
      'Team=/about/team',
      'Alice=/about/team/alice',
    ])
    // Its own step has its id once it is saved.
    expect((stored?.breadcrumbs as { doc: number }[] | undefined)?.map((c) => c.doc)).toEqual([
      about.id,
      team.id,
      alice.id,
    ])

    // Renaming a page above changes every path below it.
    await cms.update('pages', about.id, { title: 'About us', slug: 'about-us' })
    const after = await cms.findById('pages', alice.id, { depth: 0 })
    expect(after?.path).toBe('/about-us/team/alice')
    expect(crumbs(after as Record<string, unknown>)[0]).toBe('About us=/about-us')

    // Moving a page moves its subtree.
    const careers = await cms.create('pages', { title: 'Careers' })
    await cms.update('pages', team.id, { parent: careers.id })
    expect((await cms.findById('pages', alice.id))?.path).toBe('/careers/team/alice')
    await cms.update('pages', team.id, { parent: null })
    expect((await cms.findById('pages', alice.id))?.path).toBe('/team/alice')

    // Pages under different parents can share a slug.
    const other = await cms.create('pages', { title: 'Alice', parent: careers.id })
    expect(other.slug).toBe('alice')
    expect(other.path).toBe('/careers/alice')
  })

  it('refuses loops, too many levels and a taken path', async () => {
    const cms = await start(base({ maxDepth: 3 }))
    const a = await cms.create('pages', { title: 'A' })
    const b = await cms.create('pages', { title: 'B', parent: a.id })
    const c = await cms.create('pages', { title: 'C', parent: b.id })
    await expect(cms.update('pages', a.id, { parent: c.id })).rejects.toThrow(/parent/)
    await expect(cms.update('pages', a.id, { parent: a.id })).rejects.toThrow(/parent/)
    await expect(cms.create('pages', { title: 'D', parent: c.id })).rejects.toThrow(
      /at most 3 levels/,
    )
    // A text slug is not made unique by core: the path check catches it.
    const text = await start(
      base(
        {},
        {},
        pages({
          fields: [
            { name: 'title', type: 'text' },
            { name: 'slug', type: 'text' },
          ],
        }),
      ),
    )
    await text.create('pages', { title: 'One', slug: 'same' })
    await expect(text.create('pages', { title: 'Two', slug: 'same' })).rejects.toThrow(
      /already has the path \/same/,
    )
  })

  it('offers only pages that are not below the page as its parent', async () => {
    const cms = await start(base())
    const a = await cms.create('pages', { title: 'A' })
    const b = await cms.create('pages', { title: 'B', parent: a.id })
    const other = await cms.create('pages', { title: 'Other' })
    const handle = createRestHandler(cms)
    const response = await handle(
      new Request(
        `http://cms.test/api/cms/pages?limit=100&filterFor=pages.parent&filterId=${a.id}`,
      ),
    )
    const ids = ((await response.json()).docs as { id: number }[]).map((d) => d.id)
    expect(ids).toEqual([other.id])
    expect(ids).not.toContain(b.id)
  })

  it('refuses to delete a page with pages under it, or moves them up', async () => {
    const cms = await start(base())
    const a = await cms.create('pages', { title: 'A' })
    const b = await cms.create('pages', { title: 'B', parent: a.id })
    await expect(cms.delete('pages', a.id)).rejects.toThrow(/1 page under it/)
    await cms.delete('pages', b.id)
    await cms.delete('pages', a.id)

    const orphan = await start(base({ onDeleteParent: 'orphan' }))
    const p = await orphan.create('pages', { title: 'P' })
    const q = await orphan.create('pages', { title: 'Q', parent: p.id })
    await orphan.delete('pages', p.id)
    expect(await orphan.findById('pages', q.id, { depth: 0 })).toMatchObject({
      parent: null,
      path: '/q',
    })
  })
})

describe('drafts', () => {
  it('changes paths below a page when it is published, and keeps pending drafts', async () => {
    const cms = await start(base({}, {}, pages({ drafts: true, versions: true })))
    const about = await cms.create('pages', { title: 'About', status: 'published' })
    const team = await cms.create('pages', {
      title: 'Team',
      parent: about.id,
      status: 'published',
    })
    // The team page has a pending draft.
    await cms.update('pages', team.id, { title: 'Our team', status: 'draft' })

    // A draft of the parent leaves the live paths alone.
    await cms.update('pages', about.id, { slug: 'about-us', status: 'draft' })
    expect((await cms.findById('pages', team.id))?.path).toBe('/about/team')

    await cms.update('pages', about.id, { status: 'published' })
    const live = await cms.findById('pages', team.id)
    expect(live).toMatchObject({ title: 'Team', path: '/about-us/team' })
    const draft = await cms.findById('pages', team.id, { draft: true })
    expect(draft).toMatchObject({ title: 'Our team', status: 'draft' })

    // Publishing the draft works its trail out again.
    await cms.update('pages', team.id, { status: 'published' })
    const published = await cms.findById('pages', team.id)
    expect(published).toMatchObject({ title: 'Our team', path: '/about-us/team' })
    expect(crumbs(published as Record<string, unknown>)).toEqual([
      'About=/about-us',
      'Our team=/about-us/team',
    ])
  })
})

describe('localization', () => {
  it('has one path per locale when the slug is localized', async () => {
    const cms = await start(
      base(
        {},
        { localization: { locales: ['th', 'en'], defaultLocale: 'th' } },
        pages({
          fields: [
            { name: 'title', type: 'text', localized: true },
            { name: 'slug', type: 'slug', from: 'title', localized: true },
          ],
        }),
      ),
    )
    const about = await cms.create('pages', { title: 'เกี่ยวกับเรา', slug: 'เกี่ยวกับ' })
    await cms.update('pages', about.id, { title: 'About', slug: 'about' }, { locale: 'en' })
    const team = await cms.create('pages', { title: 'ทีม', slug: 'ทีม', parent: about.id })
    await cms.update('pages', team.id, { title: 'Team', slug: 'team' }, { locale: 'en' })

    expect((await cms.findById('pages', team.id))?.path).toBe('/เกี่ยวกับ/ทีม')
    const en = await cms.findById('pages', team.id, { locale: 'en' })
    expect(en?.path).toBe('/about/team')
    expect(crumbs(en as Record<string, unknown>)).toEqual(['About=/about', 'Team=/about/team'])

    expect((await findByPath(cms, 'pages', '/about/team', { locale: 'en' }))?.id).toBe(team.id)
    expect(
      (
        await findByPath(
          cms,
          'pages',
          '/%E0%B9%80%E0%B8%81%E0%B8%B5%E0%B9%88%E0%B8%A2%E0%B8%A7%E0%B8%81%E0%B8%B1%E0%B8%9A/%E0%B8%97%E0%B8%B5%E0%B8%A1',
        )
      )?.id,
    ).toBe(team.id)

    // A new English slug for the parent moves the English path only.
    await cms.update('pages', about.id, { slug: 'about-us' }, { locale: 'en' })
    expect((await cms.findById('pages', team.id, { locale: 'en' }))?.path).toBe('/about-us/team')
    expect((await cms.findById('pages', team.id))?.path).toBe('/เกี่ยวกับ/ทีม')
  })
})

describe('helpers', () => {
  it('finds pages by path and lists the published tree', async () => {
    const cms = await start(base({}, {}, pages({ drafts: true })))
    const about = await cms.create('pages', { title: 'About', status: 'published' })
    await cms.create('pages', { title: 'Team', parent: about.id, status: 'published' })
    await cms.create('pages', { title: 'History', parent: about.id, status: 'published' })
    const hidden = await cms.create('pages', { title: 'Hidden', status: 'draft' })
    await cms.create('pages', { title: 'Secret', parent: hidden.id, status: 'published' })
    await cms.create('pages', { title: 'Contact', status: 'published' })

    expect((await findByPath(cms, 'pages', '/about/team/'))?.title).toBe('Team')
    expect(await findByPath(cms, 'pages', '/hidden')).toBeNull()
    expect((await findByPath(cms, 'pages', '/hidden', { draft: true }))?.title).toBe('Hidden')

    const titles = (nodes: Awaited<ReturnType<typeof getTree>>): unknown[] =>
      nodes.map((n) => (n.children.length ? [n.title, titles(n.children)] : n.title))
    expect(titles(await getTree(cms, 'pages'))).toEqual([['About', ['History', 'Team']], 'Contact'])
    expect(titles(await getTree(cms, 'pages', { depth: 1 }))).toEqual(['About', 'Contact'])

    const handle = createRestHandler(cms)
    const response = await handle(new Request('http://cms.test/api/cms/tree/pages?depth=2'))
    expect(response.status).toBe(200)
    const tree = await response.json()
    expect(tree[0]).toMatchObject({ title: 'About', path: '/about', slug: 'about' })
    expect(tree[0].children.map((n: { path: string }) => n.path)).toEqual([
      '/about/history',
      '/about/team',
    ])
    const missing = await handle(new Request('http://cms.test/api/cms/tree/posts'))
    expect(missing.status).toBe(404)
  })

  it('rebuilds pages saved before the plugin', async () => {
    const plain = defineConfig({
      secret: 'x'.repeat(32),
      db: sqlite({ url: 'file:./cms.db' }),
      collections: [
        pages({
          fields: [
            { name: 'title', type: 'text' },
            { name: 'slug', type: 'slug', from: 'title' },
            { name: 'parent', type: 'relationship', to: 'pages' },
          ],
        }),
      ],
    })
    const before = await start(plain)
    const a = await before.create('pages', { title: 'A' })
    const b = await before.create('pages', { title: 'B', parent: a.id })
    await before.destroy()
    open.splice(open.indexOf(before), 1)

    // The collection's own `parent` field is kept.
    const nested = defineConfig({
      ...plain,
      plugins: [nestedDocsPlugin({ collections: ['pages'] })],
    })
    const cms = await start(nested, before.cwd)
    expect((await cms.findById('pages', b.id))?.path ?? null).toBeNull()
    expect(await rebuildNestedDocs(cms, 'pages')).toEqual({ checked: 2, updated: 2 })
    expect((await cms.findById('pages', b.id))?.path).toBe('/a/b')
    expect(await rebuildNestedDocs(cms, 'pages')).toEqual({ checked: 2, updated: 0 })
  })
})

describe('with the redirects plugin', () => {
  it('redirects the old addresses of pages below a moved page', async () => {
    const cms = await start(
      defineConfig({
        secret: 'x'.repeat(32),
        db: sqlite({ url: 'file:./cms.db' }),
        collections: [pages()],
        plugins: [
          nestedDocsPlugin({ collections: ['pages'] }),
          redirectsPlugin({
            collections: ['pages'],
            url: ({ doc }) => (typeof doc.path === 'string' ? `/p${doc.path}` : null),
          }),
        ],
      }),
    )
    const about = await cms.create('pages', { title: 'About' })
    await cms.create('pages', { title: 'Team', parent: about.id })
    await cms.update('pages', about.id, { slug: 'about-us' })
    expect(await resolveRedirect(cms, '/p/about/team')).toMatchObject({
      location: '/p/about-us/team',
      status: 301,
    })
    expect(await resolveRedirect(cms, '/p/about')).toMatchObject({ location: '/p/about-us' })
  })
})
