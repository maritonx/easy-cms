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
//   npx tsx --env-file=.env scripts/import-wordpress.ts https://old-site.com [--limit 10]
import { createEasyCMS } from '@easy-cms/core'
import { normalizePath } from '@easy-cms/plugin-redirects'
import Image from '@tiptap/extension-image'
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import config from '../easy-cms.config'

const site = process.argv[2]?.replace(/\/+$/, '')
if (!site) throw new Error('Usage: import-wordpress.ts https://old-site.com [--limit 10]')
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity

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

/** Creates or updates the document with this WordPress id. */
async function save(collection: 'categories' | 'posts' | 'pages', wpId: number, data: Record<string, unknown>) {
  const { docs } = await cms.find(collection, { where: { wpId: { equals: wpId } }, limit: 1, draft: true })
  return docs[0]
    ? cms.update(collection, docs[0].id, { ...data, wpId } as never)
    : cms.create(collection, { ...data, wpId } as never)
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

// Categories first, so posts can point to them.
const categoryIds = new Map<number, number | string>()
for (const c of await wp<{ id: number; name: string; slug: string }>('categories')) {
  const doc = await save('categories', c.id, { name: plain(c.name), slug: decodeURIComponent(c.slug) })
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
    await save(kind, item.id, data)
    await redirect(item.link, newPath[kind](slug))
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
existing redirects are kept. Run it once more on launch day to bring in the last posts.

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
