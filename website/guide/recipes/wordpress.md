# Move from WordPress

::: info What you'll build
Your WordPress posts, pages, categories and images in Easy CMS, with a redirect from every old
address, from a script you can run again until launch day. **Uses:** the
[Local API](../local-api), [uploads from a link](../uploads#from-a-link),
[rich text](../rich-text) and [redirects](../redirects).
:::

The script reads your old site through the WordPress REST API, which every WordPress site has at
`/wp-json/wp/v2/` (unless a plugin turned it off), so you need no plugin and no database access.
It reads what visitors can see: published posts and pages. For drafts, see
[Drafts and private posts](#drafts-and-private-posts).

## 1. Collections for the content

Add collections like these, or map the script's fields onto the ones you have. `wpId` remembers
which WordPress item each document came from, so running the script again updates documents
instead of adding them twice; `wpUrl` on media does the same for images.

```ts [easy-cms.config.ts]
import { redirectsPlugin } from '@easy-cms/plugin-redirects'

export default defineConfig({
  // …
  collections: [
    // The built-in media collection, plus where each imported image came from.
    { slug: 'media', fields: [{ name: 'wpUrl', type: 'text', unique: true }] },
    {
      slug: 'categories',
      useAsTitle: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'name' },
        { name: 'wpId', type: 'number', unique: true, admin: { position: 'sidebar' } },
      ],
    },
    {
      slug: 'posts',
      drafts: true,
      useAsTitle: 'title',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'excerpt', type: 'textarea' },
        { name: 'publishedAt', type: 'date' },
        { name: 'cover', type: 'upload' },
        { name: 'categories', type: 'relationship', to: 'categories', hasMany: true },
        { name: 'body', type: 'richText' },
        { name: 'wpId', type: 'number', unique: true, admin: { position: 'sidebar' } },
      ],
    },
    {
      slug: 'pages',
      drafts: true,
      useAsTitle: 'title',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'body', type: 'richText' },
        { name: 'wpId', type: 'number', unique: true, admin: { position: 'sidebar' } },
      ],
    },
  ],
  plugins: [redirectsPlugin()],
})
```

Then install what the script uses, and create a migration:

```bash [pm]
npm install @easy-cms/plugin-redirects @tiptap/html @tiptap/starter-kit @tiptap/extension-image
```

```bash [pm]
npx easy-cms migrate:create wordpress
```

The three `@tiptap` packages turn WordPress HTML into the JSON a `richText` field stores, with
the same editor the admin uses. Only the import script needs them.

## 2. The script

```ts [scripts/import-wordpress.ts]
// Import a WordPress site's published posts, pages, categories and images into Easy CMS.
// Run it again any time: documents are matched by their WordPress id and updated.
//
//   npx tsx --env-file=.env scripts/import-wordpress.ts https://old-site.com [--limit 10] [--old-slugs old-slugs.tsv]
import { readFileSync } from 'node:fs'
import { createEasyCMS } from '@easy-cms/core'
import { normalizePath } from '@easy-cms/plugin-redirects'
import Image from '@tiptap/extension-image'
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import config from '../easy-cms.config'

const site = process.argv[2]?.replace(/\/+$/, '')
if (!site) throw new Error('Usage: import-wordpress.ts https://old-site.com [--limit 10] [--old-slugs file]')
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity

// Slugs posts had before (WordPress's `_wp_old_slug`), from WP-CLI: a WordPress id and a slug a line.
const oldSlugs = new Map<number, string[]>()
const oldSlugsArg = process.argv.indexOf('--old-slugs')
if (oldSlugsArg > 0) {
  for (const line of readFileSync(process.argv[oldSlugsArg + 1], 'utf8').split('\n')) {
    const [id, old] = line.trim().split('\t')
    if (id && old) oldSlugs.set(Number(id), [...(oldSlugs.get(Number(id)) ?? []), old])
  }
}

// Where each kind of document lives on the new site; old addresses redirect there.
const newPath = { posts: (slug: string) => `/blog/${slug}`, pages: (slug: string) => `/${slug}` }

const cms = await createEasyCMS(config)
const extensions = [StarterKit, Image]

type Node = { type: string; text?: string; attrs?: Record<string, unknown>; content?: Node[] }
type WPItem = {
  id: number
  slug: string
  link: string
  date_gmt: string
  title: { rendered: string }
  content: { rendered: string }
  excerpt?: { rendered: string }
  categories?: number[]
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string; alt_text?: string }[] }
}

/** Every item of a WordPress REST collection, 100 a page, up to `max`. */
async function wp<T>(path: string, query = '', max = Infinity): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; items.length < max; page++) {
    const res = await fetch(`${site}/wp-json/wp/v2/${path}?per_page=100&page=${page}${query}`)
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
    items.push(...((await res.json()) as T[]))
    if (page >= Number(res.headers.get('x-wp-totalpages') ?? 1)) break
  }
  return items.slice(0, max)
}

/** Text without tags or entities: "Hello &#8211; world" → "Hello – world". */
function plain(html: string) {
  const walk = (node: Node): string => node.text ?? (node.content ?? []).map(walk).join(' ')
  return walk(generateJSON(html, extensions) as Node).replace(/\s+/g, ' ').trim()
}

/** Each image downloaded once into the media library, also across runs (by `wpUrl`). */
const media = new Map<string, { id: number | string; url: string } | null>()
async function upload(url: string, alt = '') {
  if (!media.has(url)) {
    const { docs } = await cms.find('media', { where: { wpUrl: { equals: url } }, limit: 1 })
    try {
      media.set(url, (docs[0] ?? (await cms.uploadFromURL(url, { alt, wpUrl: url }))) as never)
    } catch (error) {
      console.warn(`  image kept as a link: ${url} (${(error as Error).message})`)
      media.set(url, null)
    }
  }
  return media.get(url) ?? null
}

/** WordPress HTML as rich text, its images in the media library. */
async function richText(html: string) {
  const doc = generateJSON(html, extensions) as Node
  const visit = async (node: Node) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      const file = await upload(node.attrs.src, String(node.attrs.alt ?? ''))
      if (file) node.attrs.src = file.url
    }
    for (const child of node.content ?? []) await visit(child)
  }
  await visit(doc)
  return doc
}

/** Creates or updates the document with this WordPress id; `before` is what the last run stored. */
async function save(collection: 'categories' | 'posts' | 'pages', wpId: number, data: Record<string, unknown>) {
  const { docs } = await cms.find(collection, { where: { wpId: { equals: wpId } }, limit: 1, draft: true })
  const before = docs[0] as { id: number | string; slug?: string } | undefined
  const doc = before
    ? await cms.update(collection, before.id, { ...data, wpId } as never)
    : await cms.create(collection, { ...data, wpId } as never)
  return { doc, before }
}

/** A 301 from the old address, when it differs from the new one. */
async function redirect(oldLink: string, to: string) {
  // The path as the plugin stores it: no trailing slash, and Thai text, `%e0%b8%aa…` and
  // `%E0%B8%AA…` all as `%E0%B8%AA…`, so the next run finds it.
  const from = normalizePath(new URL(oldLink).pathname)
  if (!from || from === normalizePath(to)) return
  const { totalDocs } = await cms.find('redirects', { where: { from: { equals: from } }, limit: 0 })
  if (!totalDocs) await cms.create('redirects', { from, to, type: '301' })
}

/** A slug changed in WordPress since the last run: redirects to the old address go to the new one. */
async function retarget(oldTo: string, to: string) {
  const { docs } = await cms.find('redirects', { where: { to: { equals: oldTo } }, limit: 0 })
  for (const r of docs) await cms.update('redirects', r.id, { to } as never)
}

/** The permalink with an older slug in place of the current one, or null if the slug isn't last. */
function withSlug(link: string, slug: string, old: string) {
  const url = new URL(link)
  const path = url.pathname.replace(/\/$/, '')
  if (!path.endsWith(`/${slug}`)) return null
  url.pathname = `${path.slice(0, -slug.length)}${old}/`
  return url.href
}

// Categories first, so posts can point to them.
const categoryIds = new Map<number, number | string>()
for (const c of await wp<{ id: number; name: string; slug: string }>('categories')) {
  const { doc } = await save('categories', c.id, { name: plain(c.name), slug: decodeURIComponent(c.slug) })
  categoryIds.set(c.id, doc.id)
}
console.log(`categories: ${categoryIds.size}`)

for (const kind of ['posts', 'pages'] as const) {
  const items = await wp<WPItem>(kind, '&_embed=wp:featuredmedia', limit)
  for (const item of items) {
    const slug = decodeURIComponent(item.slug)
    const featured = item._embedded?.['wp:featuredmedia']?.[0]
    const data: Record<string, unknown> = {
      title: plain(item.title.rendered) || slug,
      slug,
      body: await richText(item.content.rendered),
      status: 'published',
    }
    if (kind === 'posts') {
      data.excerpt = item.excerpt ? plain(item.excerpt.rendered) : null
      data.publishedAt = `${item.date_gmt}Z`
      data.categories = (item.categories ?? []).map((id) => categoryIds.get(id)).filter(Boolean)
      data.cover = featured?.source_url ? ((await upload(featured.source_url, featured.alt_text))?.id ?? null) : null
    }
    const { before } = await save(kind, item.id, data)
    if (before?.slug && before.slug !== slug) await retarget(newPath[kind](before.slug), newPath[kind](slug))
    await redirect(item.link, newPath[kind](slug))
    for (const old of oldSlugs.get(item.id) ?? []) {
      const oldLink = withSlug(item.link, item.slug, old)
      if (oldLink) await redirect(oldLink, newPath[kind](slug))
    }
    console.log(`${kind}: ${slug}`)
  }
}
console.log(`images: ${[...media.values()].filter(Boolean).length} in the media library`)
await cms.destroy()
```

`newPath` says where posts and pages live on your new site: change it to match your routes.

## 3. Run it

Try it on your local database first, with a few items:

```bash
npx tsx --env-file=.env scripts/import-wordpress.ts https://old-site.com --limit 10
```

Open `/admin` and look through the posts: text, headings, lists, links, images, the cover and
categories. Then run it without `--limit`. Each run prints what it imported:

```
categories: 22
posts: hello-world
pages: about
images: 48 in the media library
```

Running it again is safe: documents and images already imported are updated, not copied, and
existing redirects are kept. When a post was renamed in WordPress since the last run, redirects that
went to its old address now go to the new one, so they don't end at a 404. Run it once more on launch day to bring in the last posts.

For the production database, run it from your machine with the production settings, after
`easy-cms migrate`, and with `NODE_ENV=production` so the schema isn't pushed into it:

```bash
NODE_ENV=production DATABASE_URL=… npx tsx --env-file=.env scripts/import-wordpress.ts https://old-site.com
```

Images go to the storage your config sets: on serverless hosts make sure it is S3, R2 or Vercel
Blob there too, not the local `uploads/` folder.

## 4. Redirects

The script adds a `301` from each old address to the new one, such as
`/2024/05/hello-world/` → `/blog/hello-world`, so links and search rankings carry over. Thai
addresses work too: they are stored percent-encoded (`/%E0%B8%82…`) and match however a request
spells them, as WordPress's lowercase `%e0%b8%82…` or as Thai text. Make your site
follow them as [Serve them](../redirects#serve-them) shows: a server middleware in Nuxt, the proxy
in Next.js. Old category, tag and date archive pages aren't redirected; add the ones
that matter in **Settings → Redirects**.

### Slugs changed before the move

When the slug of a published post changes, WordPress keeps the old one in `_wp_old_slug` and
redirects it, so links to the old address still work on the old site. The REST API doesn't return
that field. If you can run [WP-CLI](https://wp-cli.org) on the old site, export the old slugs and
pass the file to the script:

```bash
wp db query "SELECT post_id, meta_value FROM $(wp db prefix)postmeta WHERE meta_key = '_wp_old_slug'" --skip-column-names > old-slugs.tsv
```

```bash
npx tsx --env-file=.env scripts/import-wordpress.ts https://old-site.com --old-slugs old-slugs.tsv
```

Each old slug gets a `301` to the post's new address too. WordPress keeps old slugs for posts, not
for pages.

## 5. Check every old address

Before you switch DNS, ask the new site, on a staging address, for every address in the old site's
sitemap. Any 404 is a page with no redirect:

```ts [scripts/check-redirects.ts]
// Asks the new site for every address in the old site's sitemap; a 404 is a missing redirect.
//
//   npx tsx scripts/check-redirects.ts https://old-site.com/wp-sitemap.xml https://staging.example.com
const [sitemap, newSite] = process.argv.slice(2)
if (!sitemap || !newSite) throw new Error('Usage: check-redirects.ts <old sitemap URL> <new site URL>')

/** Every page address in a sitemap; an index lists other sitemaps, which are read too. */
async function urls(url: string): Promise<string[]> {
  const xml = await (await fetch(url)).text()
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!.replaceAll('&amp;', '&'))
  return xml.includes('<sitemapindex') ? (await Promise.all(locs.map(urls))).flat() : locs
}

let missing = 0
const all = await urls(sitemap)
for (const url of all) {
  const { pathname, search } = new URL(url)
  // Redirects are followed: a redirect to a page that doesn't exist is a 404 too.
  const res = await fetch(`${newSite.replace(/\/+$/, '')}${pathname}${search}`)
  if (res.status === 404) {
    missing++
    console.log(`404 ${pathname}`)
  }
}
console.log(`${all.length} old addresses, ${missing} missing`)
```

```bash
npx tsx scripts/check-redirects.ts https://old-site.com/wp-sitemap.xml https://staging.example.com
```

WordPress has `/wp-sitemap.xml` since 5.5; with Yoast SEO, use `/sitemap_index.xml`. The sitemap
lists current addresses only, so this doesn't test old slugs: check a few from `old-slugs.tsv` by
hand.

## What comes across, and what doesn't

| Comes across | Doesn't |
|---|---|
| Titles, slugs, excerpts, dates | Tags and authors (add them like categories) |
| Paragraphs, headings, lists, quotes, code, links, bold and italic | Embeds (YouTube, tweets) and other `<iframe>`s: add them back, or allow them with a Tiptap extension |
| Images in posts, featured images | Page builder layouts: their text comes across, their columns don't |
| Categories | Custom fields (ACF), menus, comments |
| Shortcodes, as the HTML WordPress renders for them | Unpublished content, unless you sign in (below) |

Custom post types come across the same way when they are in the REST API (`show_in_rest`): add
a collection and their REST name to the loop.

## Drafts and private posts

To read unpublished content, sign in with an
[application password](https://wordpress.org/documentation/article/application-passwords/)
(**Users → Profile → Application Passwords** in WordPress). Keep it in `.env`, not in the script:

```ts
const auth = `Basic ${Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64')}`
// in wp(): fetch(url, { headers: { Authorization: auth } })
// and ask for every status: wp<WPItem>(kind, '&_embed=wp:featuredmedia&status=publish,draft,private', limit)
```

Map WordPress's `status` to `'published'` or `'draft'` in `data.status`. Delete the application
password when the move is done.

## Next steps

- [Redirects](../redirects): make your site follow the imported redirects.
- [SEO](../seo): titles, descriptions and share images for the imported posts.
- [Backups](../backups): back up before the final import on launch day.
