# SEO {#seo}

::: info หน้านี้สอนอะไร
เพิ่ม field SEO พร้อมตัวอย่างผลการค้นหาในหน้า admin เติม metadata ของหน้าเว็บจาก field เหล่านั้น
และเผยแพร่ sitemap, robots.txt และข้อมูลแบบมีโครงสร้าง

**ควรอ่านก่อน:** [Plugins](./plugins)
:::

<Screenshot name="seo" alt="field SEO พร้อมตัวนับความยาวและตัวอย่างผลการค้นหา" />

`@easy-cms/plugin-seo` เพิ่ม group `meta` (ชื่อ คำอธิบาย และรูปสำหรับแชร์) ให้ collection และ global ที่เลือก
ผู้แก้เนื้อหาจะเห็นความยาวของข้อความแต่ละช่อง ตัวอย่างผลการค้นหา และปุ่มสร้างให้ ส่วนหน้าเว็บของคุณได้ metadata จากฟังก์ชันเดียว

```bash [pm]
npm install @easy-cms/plugin-seo
```

```ts
import { seoPlugin } from '@easy-cms/plugin-seo'

export default defineConfig({
  // …
  plugins: [
    seoPlugin({
      collections: ['posts'],
      globals: ['site'],
      generateTitle: ({ doc }) => `${doc.title} | My Blog`,
      generateDescription: ({ doc }) => doc.excerpt,
      generateImage: ({ doc }) => doc.cover,
      generateURL: ({ doc }) => `https://example.com/posts/${doc.slug}`,
    }),
  ],
})
```

group นี้เพิ่มคอลัมน์ในตารางของ collection ให้รัน `easy-cms migrate:create seo`
(ดู [Migration](./deployment)) ถ้าอัปเกรดจาก 0.16 หรือก่อนหน้า ช่อง "ซ่อนจากเครื่องมือค้นหา" ก็เป็นคอลัมน์ใหม่
ให้สร้าง migration หลังอัปเดต

## ในหน้า admin {#in-the-admin}

- **ชื่อสำหรับค้นหา** และ **คำอธิบายสำหรับค้นหา** พร้อมตัวนับว่าสั้นไป พอดี หรือยาวไป
  (ค่าเริ่มต้น 50–60 และ 100–150 ตัวอักษร นับสระและวรรณยุกต์ไทยรวมกับตัวอักษรที่มันอยู่เป็นหนึ่งตัว)
- **รูปสำหรับแชร์** จากคลังสื่อ
- **ซ่อนจากเครื่องมือค้นหา** ใส่ `noindex` ในหน้าและไม่ใส่หน้านั้นใน sitemap เหมาะกับหน้าขอบคุณ
  หรือหน้า landing page สำหรับโฆษณา
- **ปุ่มสร้างให้** ของแต่ละ generator ที่ตั้งไว้ ปุ่มจะส่งค่าในฟอร์มขณะนั้น (ยังไม่บันทึก) ไปให้ generator
  ของคุณที่ server แล้วเติมค่าให้ช่องนั้น
- **ตัวอย่างผลการค้นหา** ใต้ group: ชื่อสำหรับค้นหา (หรือชื่อเอกสาร) ที่อยู่จาก `generateURL` และคำอธิบาย

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `collections` | `[]` | collection ที่จะมี field SEO |
| `globals` | `[]` | global ที่จะมี field SEO |
| `position` | `'main'` | `'sidebar'` ย้าย group ไปแถบข้างของหน้าแก้ไข |
| `generateTitle` | — | เสนอชื่อสำหรับค้นหา |
| `generateDescription` | — | เสนอคำอธิบายสำหรับค้นหา |
| `generateImage` | — | เสนอรูปสำหรับแชร์: id ของเอกสาร media |
| `generateURL` | — | ที่อยู่ของหน้า สำหรับตัวอย่างผลการค้นหาและ [sitemap](#sitemap) |
| `autoGenerate` | `false` | เติมช่อง meta ที่ว่างด้วย generator ตอนบันทึกเอกสาร |
| `fields` | — | `(defaults) => fields`: ปรับ field ใน group เช่น เพิ่มช่อง keywords |
| `titleLength` | `{ min: 50, max: 60 }` | ความยาวที่ถือว่าพอดี |
| `descriptionLength` | `{ min: 100, max: 150 }` | ความยาวที่ถือว่าพอดี |
| `localized` | ตาม `localization` | เก็บค่าแยกตาม[ภาษาของเนื้อหา](./localization) |
| `label` | `'SEO'` | ชื่อของ group |
| `robots` | `{}` | ตัวเลือกของ [`robots.txt`](#robots-txt) สำหรับ standalone server หรือ `false` ถ้าไม่ต้องการ |
| `llms` | `{}` | [`llms.txt`](./ai-search#llms-txt) สำหรับผู้ช่วย AI: ชื่อ คำสรุป จำนวน และลิงก์ Markdown `false` ปิด route ของ standalone server |
| `markdown` | — | `{ [slug]: (doc) => markdown }`: [หน้าแบบ Markdown](./ai-search#markdown-versions-of-pages) ที่เขียนเองของ collection |
| `indexNow` | — | `{ key }`: แจ้งเครื่องมือค้นหาเมื่อหน้าเปลี่ยนด้วย [IndexNow](./ai-search#indexnow) |

generator ได้รับ `{ doc, id, locale, collection | global, cms, user }` และเป็น async ได้ คืน `null`
เมื่อไม่มีอะไรจะเสนอ

::: tip generateURL คือที่อยู่จริงของหน้า
sitemap ตัวอย่างผลการค้นหา และลิงก์ hreflang มาจาก `generateURL` ทั้งหมด จึงควรคืนที่อยู่จริงของแต่ละหน้า
และแยกตามภาษาถ้าเว็บมีหลายภาษา คืน `null` สำหรับเอกสารที่ยังไม่มีหน้า เช่น ยังไม่มี slug

```ts
generateURL: ({ doc, collection, locale }) =>
  collection === 'posts'
    ? doc.slug ? `/${locale}/posts/${doc.slug}` : null
    : `/${locale}`,
```
:::

## ในหน้าเว็บของคุณ {#on-your-pages}

`seoMeta(doc, options)` อ่าน field meta ถ้าว่างจะใช้ค่าจากเอกสาร (`title` แล้วตามด้วย `excerpt` หรือ
`description`) และคืน metadata สำหรับ Nuxt และ Next.js ได้แก่ ชื่อ คำอธิบาย แท็ก Open Graph และ Twitter,
`noindex`, ลิงก์ canonical และ hreflang และ [JSON-LD](#structured-data-json-ld) ให้ดึงเอกสารด้วย
`depth` ตั้งแต่ 1 ขึ้นไปเพื่อให้รูปสำหรับแชร์มี URL

::: code-group

```vue [หน้า Nuxt]
<script setup lang="ts">
import { seoMeta } from '@easy-cms/plugin-seo'

const route = useRoute()
const locale = route.params.locale as string
const { data: post } = await useFetch(`/api/posts/${route.params.slug}`, { query: { locale } })
const seo = seoMeta(post.value ?? {}, {
  siteUrl: useRequestURL().origin,
  locale,
  locales: ['th', 'en'],
  url: (p, l) => `/${l}/posts/${p.slug}`,
  type: 'article',
})
useSeoMeta(seo.nuxt) // ชื่อ คำอธิบาย Open Graph robots
useHead(seo.head) // ลิงก์ canonical และ hreflang, JSON-LD
</script>
```

```tsx [หน้า Next.js]
import { jsonLdScript, seoMeta } from '@easy-cms/plugin-seo'

async function load(slug: string, locale: string) {
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', { where: { slug: { equals: slug } }, locale, limit: 1 })
  if (!docs[0]) return null
  const seo = seoMeta(docs[0], {
    config, // admin.siteUrl และภาษาทั้งหมด
    locale,
    url: (p, l) => `/${l}/posts/${p.slug}`,
    type: 'article',
  })
  return { post: docs[0], seo }
}

export async function generateMetadata({ params }) {
  const { slug, locale } = await params
  return (await load(slug, locale))?.seo.next ?? {}
}

export default async function Page({ params }) {
  const { slug, locale } = await params
  const page = await load(slug, locale)
  if (!page) notFound()
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(page.seo.jsonLd) }}
      />
      <PostView post={page.post} />
    </>
  )
}
```

:::

| ตัวเลือก | |
|---|---|
| `siteUrl` | ที่อยู่ของเว็บ ใช้ทำให้ URL ของ canonical และรูปเป็น URL เต็ม ค่าเริ่มต้นคือ `config.admin.siteUrl` แล้วตามด้วย `config.serverURL` |
| `config` | config ของ Easy CMS สำหรับอ่านค่าข้างบนและ `localization` |
| `url` | ที่อยู่ของหน้า หรือ `(doc, locale) => url` ถ้าเป็นฟังก์ชันจะสร้างลิงก์ hreflang ของทุกภาษาและ `x-default` ให้ด้วย |
| `locale` | ภาษาของเนื้อหาในหน้านี้ ใช้กับ `og:locale` และที่อยู่ canonical |
| `locales`, `defaultLocale` | สำหรับ hreflang ค่าเริ่มต้นมาจาก `config.localization` |
| `type` | `'article'` สำหรับบทความ: `og:type` เวลาเผยแพร่และแก้ไข และ JSON-LD แบบ BlogPosting ค่าเริ่มต้น `'website'` |
| `publishedTime` | `(doc) => date` ค่าเริ่มต้นคือ `publishedAt` แล้วตามด้วย `createdAt` |
| `author` | ชื่อผู้เขียน หรือ `(doc) => name` |
| `articleType` | `'BlogPosting'` (ค่าเริ่มต้น), `'Article'` หรือ `'NewsArticle'` |
| `breadcrumbs` | `[{ name, url }]` เรียงจากระดับบนสุด: เพิ่ม BreadcrumbList JSON-LD (`breadcrumbList`) ดู [หน้าย่อย](./nested-docs#when-pages-move) |
| `title`, `description` | `(doc) => text`: ค่าที่ใช้แทนเมื่อ field meta ว่าง |
| `siteName` | `og:site_name` |

ผลลัพธ์มี `title`, `description`, `canonical`, `image`, `noindex`, `alternates` และ `jsonLd` รวมทั้ง
`nuxt` (สำหรับ `useSeoMeta`), `head` (สำหรับ `useHead`) และ `next` (สำหรับ `generateMetadata`)

## Sitemap {#sitemap}

`sitemap(cms)` รวบรวมทุกหน้าที่ผู้เข้าชมเห็นได้ คือเอกสารใน collection และ global ที่ตั้ง plugin ไว้ อ่านแบบ
**ไม่ login** (ฉบับร่างและเอกสารที่ read access ซ่อนไว้จึงไม่ถูกใส่) มีที่อยู่จาก `generateURL` และไม่ได้ติ๊ก
"ซ่อนจากเครื่องมือค้นหา" แต่ละรายการมี `lastModified` (จาก `updatedAt`) และถ้าเว็บมีหลายภาษาจะมีที่อยู่ของหน้านั้นทุกภาษา
`sitemapXml(cms)` แปลงเป็น XML ถ้าเกิน 50,000 รายการจะกลายเป็น index ของ `/sitemap.xml?page=1`, `?page=2`…

::: code-group

```ts [Nuxt: server/routes/sitemap.xml.ts]
import { sitemapXml } from '@easy-cms/plugin-seo'

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return sitemapXml(await useEasyCMS(), { page: getQuery(event).page as string | undefined })
})
```

```ts [Next.js: app/sitemap.ts]
import { getEasyCMS } from '@easy-cms/next'
import { sitemap } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

// รายการมีรูปแบบเดียวกับ MetadataRoute.Sitemap
export default async function Sitemap() {
  return sitemap(await getEasyCMS(config))
}
```

```ts [Next.js เกิน 50,000 หน้า: app/sitemap.xml/route.ts]
import { getEasyCMS } from '@easy-cms/next'
import { sitemapXml } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const page = new URL(request.url).searchParams.get('page')
  const xml = await sitemapXml(await getEasyCMS(config), { page })
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}
```

:::

ที่อยู่ต้องเป็น URL เต็ม ให้ตั้ง `admin.siteUrl` ใน config (หรือส่ง `{ siteUrl }`) หรือให้ `generateURL` คืน URL เต็ม
plugin ยังเสิร์ฟ sitemap ที่ `<routes.api>/seo/sitemap.xml` และ[standalone server](./standalone)เสิร์ฟที่ `/sitemap.xml`

## robots.txt {#robots-txt}

`robotsTxt({ config })` กันไม่ให้ crawler เข้าหน้า admin และ API (ยกเว้นไฟล์อัปโหลด รูปสำหรับแชร์จึงยังโหลดได้)
และบอกที่อยู่ของ sitemap:

```txt
User-agent: *
Allow: /api/cms/media/file/
Disallow: /admin/
Disallow: /api/cms/

Sitemap: https://example.com/sitemap.xml
```

::: code-group

```ts [Nuxt: server/routes/robots.txt.ts]
import { robotsTxt } from '@easy-cms/plugin-seo'

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return robotsTxt({ config: (await useEasyCMS()).config })
})
```

```ts [Next.js: app/robots.txt/route.ts]
import { robotsTxt } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export function GET() {
  return new Response(robotsTxt({ config }), { headers: { 'content-type': 'text/plain' } })
}
```

:::

| ตัวเลือก | |
|---|---|
| `config` | config ของ Easy CMS: path ของ admin และ API และ `admin.siteUrl` |
| `siteUrl` | ที่อยู่ของเว็บสำหรับบรรทัด `Sitemap:` ถ้าไม่ใช่ `admin.siteUrl` |
| `sitemap` | ที่อยู่ของ sitemap หรือ `false` ถ้าไม่ต้องการบรรทัด `Sitemap:` |
| `disallow` | path อื่นที่ไม่ให้ crawler เข้า เช่น `['/search']` |
| `disallowAll` | ไม่ให้ crawler เข้าทั้งเว็บ เช่น บน staging |
| `ai` | `{ training?, search?, user? }`: อนุญาตหรือปิด[crawler ของ AI](./ai-search#choose-which-ai-crawlers-may-read)เป็นกลุ่ม ค่าเริ่มต้นคืออนุญาตทั้งหมด |
| `rules` | `[{ userAgent, allow?, disallow? }]` สำหรับ crawler อื่น |

::: warning Staging
`disallowAll` ไม่เปิดเองตาม `NODE_ENV` เพราะ server staging ส่วนใหญ่ก็รันแบบ production ให้ตั้งจากตัวแปรของคุณเอง
เช่น `disallowAll: process.env.SITE_ENV !== 'production'`
:::

standalone server เสิร์ฟ `/robots.txt` เอง ปรับได้ด้วยตัวเลือก `robots` ของ plugin หรือปิดด้วย `robots: false`

## ข้อมูลแบบมีโครงสร้าง (JSON-LD) {#structured-data-json-ld}

เครื่องมือค้นหาอ่านข้อมูลแบบ [schema.org](https://schema.org) เพื่อแสดงผลการค้นหาที่ละเอียดขึ้น

- `seoMeta(...).jsonLd` เป็นข้อมูลของหน้า: `BlogPosting` (หรือ `articleType`) เมื่อ `type: 'article'` นอกนั้นเป็น
  `WebPage` Nuxt ได้ผ่าน `useHead(seo.head)`
- `seoMeta(...).breadcrumbList` เป็น `BreadcrumbList` จาก option `breadcrumbs` เพื่อให้ผลการค้นหาแสดง
  ตำแหน่งของหน้า `seo.head` มีให้ด้วย ส่วน Next.js ให้ render แบบเดียวกับ `jsonLd`
- `siteJsonLd({ name, url, logo?, sameAs? })` เป็น `Organization` และ `WebSite` ของเว็บ ให้ใส่ใน layout
  หน้าละครั้ง
- `jsonLdScript(data)` แปลงข้อมูลเป็นข้อความสำหรับ `<script type="application/ld+json">` โดย escape
  ไว้แล้ว เนื้อหาจึงปิดแท็กเองไม่ได้

```tsx
// Next.js app/layout.tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: jsonLdScript(siteJsonLd({ name: 'My Blog', url: 'https://example.com' })),
  }}
/>
```

ตรวจผลได้ด้วย [Rich Results Test](https://search.google.com/test/rich-results) ของ Google

## ขั้นต่อไป {#next-steps}

- [หลายภาษา (localization)](./localization): field SEO แยกภาษา
- [SEO สำหรับ AI](./ai-search): crawler ของ AI, `llms.txt`, หน้า Markdown และ IndexNow
- [เตรียมเว็บให้เครื่องมือค้นหา](./recipes/search-engines): ขั้นตอนตามลำดับ และวิธีตรวจ
- [Migration และการ deploy](./deployment): migration สำหรับคอลัมน์ใหม่
