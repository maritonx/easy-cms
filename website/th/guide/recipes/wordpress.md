# ย้ายจาก WordPress {#move-from-wordpress}

::: info สิ่งที่จะได้
บทความ หน้า หมวดหมู่ และรูปภาพจาก WordPress เข้ามาอยู่ใน Easy CMS พร้อม redirect จากทุกที่อยู่เดิม
ด้วยสคริปต์ที่รันซ้ำได้จนถึงวันเปิดตัว **ใช้:** [Local API](../local-api),
[อัปโหลดจากลิงก์](../uploads#from-a-link), [rich text](../rich-text) และ [redirect](../redirects)
:::

สคริปต์อ่านเว็บเดิมผ่าน WordPress REST API ซึ่งทุกเว็บ WordPress มีอยู่แล้วที่ `/wp-json/wp/v2/` (เว้นแต่มี plugin
ปิดไว้) จึงไม่ต้องติดตั้ง plugin และไม่ต้องเข้าฐานข้อมูล สคริปต์อ่านเฉพาะสิ่งที่ผู้เข้าชมเห็นได้ คือบทความและหน้าที่เผยแพร่แล้ว
ถ้าต้องการ draft ด้วย ดู[draft และบทความส่วนตัว](#drafts-and-private-posts)

## 1. collection สำหรับเนื้อหา {#_1-collections-for-the-content}

เพิ่ม collection ประมาณนี้ หรือปรับ field ในสคริปต์ให้ตรงกับที่มีอยู่แล้ว `wpId` จำไว้ว่าเอกสารแต่ละชิ้นมาจาก
WordPress ชิ้นไหน การรันซ้ำจึงอัปเดตเอกสารเดิมแทนการเพิ่มซ้ำ ส่วน `wpUrl` ใน media ทำแบบเดียวกันกับรูปภาพ

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

จากนั้นติดตั้งสิ่งที่สคริปต์ใช้ แล้วสร้าง migration:

```bash [pm]
npm install @easy-cms/plugin-redirects @tiptap/html @tiptap/starter-kit @tiptap/extension-image
```

```bash [pm]
npx easy-cms migrate:create wordpress
```

แพ็กเกจ `@tiptap` สามตัวแปลง HTML ของ WordPress เป็น JSON ที่ field `richText` เก็บ ด้วย editor ตัวเดียวกับที่หน้า
admin ใช้ มีแค่สคริปต์นำเข้าที่ต้องใช้

## 2. สคริปต์ {#_2-the-script}

```ts [scripts/import-wordpress.ts]
// Import a WordPress site's published posts, pages, categories and images into Easy CMS.
// Run it again any time: documents are matched by their WordPress id and updated.
//
//   npx tsx --env-file=.env scripts/import-wordpress.ts https://old-site.com [--limit 10]
import { createEasyCMS } from '@easy-cms/core'
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
  // Stored without the trailing slash WordPress adds.
  const from = decodeURI(new URL(oldLink).pathname).replace(/(.)\/$/, '$1')
  if (from === to) return
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

`newPath` บอกว่าบทความและหน้าอยู่ที่ไหนบนเว็บใหม่ ปรับให้ตรงกับ route ของคุณ

## 3. รัน {#_3-run-it}

ลองกับฐานข้อมูลในเครื่องก่อน ด้วยไม่กี่ชิ้น:

```bash
npx tsx --env-file=.env scripts/import-wordpress.ts https://old-site.com --limit 10
```

เปิด `/admin` แล้วไล่ดูบทความ: ข้อความ หัวข้อ รายการ ลิงก์ รูปภาพ รูปหน้าปก และหมวดหมู่ จากนั้นรันโดยไม่ใส่
`--limit` ทุกครั้งที่รันจะพิมพ์สิ่งที่นำเข้า:

```
categories: 22
posts: hello-world
pages: about
images: 48 in the media library
```

รันซ้ำได้อย่างปลอดภัย: เอกสารและรูปที่นำเข้าแล้วจะถูกอัปเดต ไม่ถูกคัดลอกซ้ำ และ redirect ที่มีอยู่แล้วจะคงไว้
ให้รันอีกครั้งในวันเปิดตัวเพื่อดึงบทความล่าสุด

สำหรับฐานข้อมูล production ให้รันจากเครื่องของคุณด้วยค่าของ production หลัง `easy-cms migrate` และตั้ง
`NODE_ENV=production` เพื่อไม่ให้ schema ถูก push เข้าไป:

```bash
NODE_ENV=production DATABASE_URL=… npx tsx --env-file=.env scripts/import-wordpress.ts https://old-site.com
```

รูปภาพจะไปอยู่ใน storage ที่ config กำหนด บน host แบบ serverless ตรวจให้แน่ใจว่าตอนรันเป็น S3, R2 หรือ Vercel Blob
ด้วย ไม่ใช่โฟลเดอร์ `uploads/` ในเครื่อง

## 4. Redirect {#_4-redirects}

สคริปต์เพิ่ม `301` จากที่อยู่เดิมไปที่อยู่ใหม่ของทุกชิ้น เช่น `/2024/05/hello-world/` → `/blog/hello-world`
ลิงก์เดิมและอันดับในการค้นหาจึงตามมาด้วย ที่อยู่ภาษาไทยก็ใช้ได้: slug แบบ `%e0%b8%aa…` ของ WordPress จะถูกเก็บเป็น
ข้อความภาษาไทย ให้เว็บของคุณทำตาม redirect เหล่านี้ตาม[เสิร์ฟ redirect](../redirects#serve-them): server middleware
ใน Nuxt หรือ proxy ใน Next.js หน้ารวมหมวดหมู่ แท็ก และหน้ารวมตามวันที่เดิมไม่ได้ถูก redirect ให้เพิ่มเฉพาะหน้าที่สำคัญเองใน
**ตั้งค่า → การเปลี่ยนเส้นทาง**

## อะไรย้ายมาได้ อะไรไม่ได้ {#what-comes-across-and-what-doesn-t}

| ย้ายมาได้ | ย้ายมาไม่ได้ |
|---|---|
| title, slug, excerpt, วันที่ | แท็กและผู้เขียน (เพิ่มได้แบบเดียวกับหมวดหมู่) |
| ย่อหน้า หัวข้อ รายการ quote โค้ด ลิงก์ ตัวหนาและตัวเอียง | embed (YouTube, ทวีต) และ `<iframe>` อื่นๆ: ใส่กลับเอง หรือเปิดให้ใช้ด้วย Tiptap extension |
| รูปในบทความ และรูปหน้าปก (featured image) | layout จาก page builder: ข้อความมาครบ แต่คอลัมน์ไม่มา |
| หมวดหมู่ | custom field (ACF), เมนู, ความคิดเห็น |
| shortcode ในรูป HTML ที่ WordPress render ให้ | เนื้อหาที่ยังไม่เผยแพร่ เว้นแต่จะเข้าสู่ระบบ (ด้านล่าง) |

custom post type ย้ายมาได้แบบเดียวกันถ้าอยู่ใน REST API (`show_in_rest`): เพิ่ม collection และชื่อใน REST ของมันลงใน loop

## Draft และบทความส่วนตัว {#drafts-and-private-posts}

การอ่านเนื้อหาที่ยังไม่เผยแพร่ต้องเข้าสู่ระบบด้วย
[application password](https://wordpress.org/documentation/article/application-passwords/)
(**Users → Profile → Application Passwords** ใน WordPress) เก็บไว้ใน `.env` ไม่ใช่ในสคริปต์:

```ts
const auth = `Basic ${Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64')}`
// in wp(): fetch(url, { headers: { Authorization: auth } })
// and ask for every status: wp<WPItem>(kind, '&_embed=wp:featuredmedia&status=publish,draft,private', limit)
```

แปลง `status` ของ WordPress เป็น `'published'` หรือ `'draft'` ใน `data.status` และลบ application password ทิ้งเมื่อย้ายเสร็จ

## ขั้นต่อไป {#next-steps}

- [Redirect](../redirects): ให้เว็บของคุณทำตาม redirect ที่นำเข้ามา
- [SEO](../seo): title, description และรูปตอนแชร์ของบทความที่นำเข้า
- [Backup](../backups): สำรองข้อมูลก่อนนำเข้ารอบสุดท้ายในวันเปิดตัว
