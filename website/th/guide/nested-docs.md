# หน้าย่อย (nested pages)

::: info สิ่งที่จะได้เรียนรู้
ทำหน้าซ้อนในหน้า (เกี่ยวกับเรา → ทีมงาน → สมชาย) ให้แต่ละหน้ามีที่อยู่เต็ม (`/about/team`) และ
breadcrumbs ของตัวเอง และให้ค่าเหล่านี้ถูกต้องเสมอเมื่อหน้าที่อยู่ด้านบนย้ายที่หรือเปลี่ยน slug

**อ่านก่อนหน้านี้:** [Plugin](./plugins)
:::

<Screenshot name="nested-docs" alt="หน้าต่าง ๆ แสดงเป็นต้นไม้ใน admin โดยเปิดหน้าย่อยของ เกี่ยวกับเรา ไว้" />

เว็บส่วนใหญ่แบ่งเป็นหมวด เช่น หน้าเกี่ยวกับเราที่มีหน้าทีมงานและประวัติอยู่ข้างใต้ หรือเอกสารที่มีบทและหัวข้อย่อย
`@easy-cms/plugin-nested-docs` ให้แต่ละเอกสารมี **หน้าแม่** ใน collection เดียวกัน และดูแลค่าสองค่าให้เป็นปัจจุบันเสมอ

- **เส้นทาง (path)**: ที่อยู่เต็มของหน้า ประกอบจาก slug ของหน้าด้านบน เช่น `/about/team`
- **Breadcrumbs**: เส้นทางจากหน้าระดับบนสุดลงมาถึงหน้านั้น แต่ละขั้นมีชื่อและ path เช่น
  เกี่ยวกับเรา (`/about`) › ทีมงาน (`/about/team`)

```bash [pm]
npm install @easy-cms/plugin-nested-docs
```

```ts
import { nestedDocsPlugin } from '@easy-cms/plugin-nested-docs'

export default defineConfig({
  // …
  collections: [
    {
      slug: 'pages',
      useAsTitle: 'title',
      drafts: true,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
  plugins: [nestedDocsPlugin({ collections: ['pages'] })],
})
```

Plugin เพิ่มสาม field ให้แต่ละ collection คือ `parent`, `path` และ `breadcrumbs` จากนั้นสร้าง migration
(`easy-cms migrate:create nested-pages` ดู [Migration](./deployment))

## ใน admin {#in-the-admin}

<Screenshot name="nested-docs-page" alt="แผงด้านข้างของหน้า: หน้าแม่ path และตำแหน่งของหน้า" />

- **รายการเป็นต้นไม้** หน้าระดับบนสุดขึ้นก่อน กดลูกศรข้างหน้าเพื่อดูหน้าย่อย เมื่อค้นหาหรือกรอง
  รายการจะแสดงแบบธรรมดา
- **หน้าแม่** อยู่ในแผงด้านข้าง และเลือกได้เฉพาะหน้าที่เลือกได้จริง ไม่มีหน้าตัวเองหรือหน้าที่อยู่ใต้ตัวเอง
  ซึ่งจะทำให้วนลูป
- แผงด้านข้างแสดง **path** และ **ตำแหน่งของหน้านี้** รวมถึงจำนวนหน้าย่อยพร้อมลิงก์ไปดู

slug ห้ามซ้ำกันเฉพาะหน้าที่มีหน้าแม่เดียวกัน `/about/team` กับ `/careers/team` จึงใช้ slug `team`
ได้ทั้งคู่

## แสดงหน้าจากที่อยู่ {#showing-a-page-by-its-address}

ที่อยู่ของหน้าบนเว็บเป็นแบบไหนก็ได้ เช่น `/about/team` หรือ `/p/about/team` เพื่อแยกจาก route อื่น
ตัด prefix ของคุณออกแล้วหาส่วนที่เหลือด้วย `findByPath`

::: code-group

```ts [Nuxt: server/api/page.get.ts]
import { findByPath } from '@easy-cms/plugin-nested-docs'

export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  const page = await findByPath(cms, 'pages', String(getQuery(event).path))
  if (!page) throw createError({ statusCode: 404 })
  return page
})
```

```tsx [Next.js: app/p/[...path]/page.tsx]
import { getEasyCMS } from '@easy-cms/next'
import { findByPath } from '@easy-cms/plugin-nested-docs'
import { notFound } from 'next/navigation'
import config from '@/easy-cms.config'

export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const cms = await getEasyCMS(config)
  const page = await findByPath(cms, 'pages', `/${(await params).path.join('/')}`)
  if (!page) notFound()
  return <h1>{String(page.title)}</h1>
}
```

```ts [REST]
// frontend ใดก็ได้: path เป็น field ธรรมดา
const { docs } = await fetch(
  `/api/cms/pages?where[path][equals]=${encodeURIComponent('/about/team')}&limit=1`,
).then((r) => r.json())
```

:::

`findByPath` รับ option เดียวกับ `find` (`locale`, `draft`, `depth`, `user` และ `overrideAccess`)
และ decode ที่อยู่ให้ `/%E0%B8%97%E0%B8%B5%E0%B8%A1` จึงหาเจอหน้า `/ทีม`

### Breadcrumbs {#breadcrumbs}

แต่ละหน้ามีเส้นทางของตัวเองใน `breadcrumbs` เรียงจากระดับบนสุดและจบที่หน้านั้น

```vue
<nav aria-label="Breadcrumb">
  <ol>
    <li v-for="(crumb, i) in page.breadcrumbs" :key="crumb.id">
      <NuxtLink v-if="i < page.breadcrumbs.length - 1" :to="`/p${crumb.url}`">{{ crumb.label }}</NuxtLink>
      <span v-else aria-current="page">{{ crumb.label }}</span>
    </li>
  </ol>
</nav>
```

แต่ละขั้นคือ `{ doc, label, url }`: id ของหน้า ชื่อ (`useAsTitle`) และ path

## เมนู {#menus}

`getTree` ให้หน้าที่เผยแพร่แล้วเป็นต้นไม้ สำหรับทำเมนูหรือ sidebar ของเอกสาร

```ts
import { getTree } from '@easy-cms/plugin-nested-docs'

const menu = await getTree(cms, 'pages', { depth: 2, locale: 'en' })
// [{ id, title, slug, path, children: [{ id, title, slug, path, children: [] }] }, …]
```

หน้าเรียงตามลำดับของรายการ: `admin.list.sort` ถ้าตั้งไว้ (เช่น `order` ซึ่งเป็น field ตัวเลขที่คุณเพิ่มเอง)
ไม่อย่างนั้นเรียงตามชื่อ หน้าที่อยู่ใต้หน้าที่ยังไม่เผยแพร่จะไม่แสดงไปด้วย

frontend ที่อยู่คนละเซิร์ฟเวอร์ได้ข้อมูลเดียวกันจาก `GET /api/cms/tree/pages?depth=2&locale=en`
ตามสิทธิ์อ่านของ collection

## เมื่อหน้าย้ายที่ {#when-pages-move}

เมื่อหน้าได้ slug หรือหน้าแม่ใหม่ plugin จะบันทึกหน้าที่อยู่ข้างใต้ด้วย path และ breadcrumbs ใหม่ทีละระดับ

- **Draft** ไม่ทำให้อะไรย้าย: path เปลี่ยนเมื่อหน้า **เผยแพร่** หน้าย่อยที่มี draft ค้างอยู่ยังเก็บ
  draft ไว้เหมือนเดิม ส่วนเวอร์ชันที่เผยแพร่อยู่จะได้ path ใหม่
- **การลบ** หน้าที่ยังมีหน้าย่อยจะไม่ได้รับอนุญาต ต้องย้ายหรือลบหน้าย่อยก่อน ถ้าตั้ง
  `onDeleteParent: 'orphan'` หน้าย่อยจะขึ้นไปเป็นระดับบนสุดแทน (และที่อยู่จะเปลี่ยน)
- **ที่อยู่เดิม**: เมื่อใช้คู่กับ [plugin redirects](./redirects) และฟังก์ชันที่อยู่เดียวกัน ทุกหน้าที่ย้าย
  รวมถึงหน้าที่อยู่ใต้หน้าที่ย้าย จะได้ redirect จากที่อยู่เดิมโดยอัตโนมัติ

```ts
const pageURL = (doc) => (doc.path ? `/p${doc.path}` : null)

plugins: [
  nestedDocsPlugin({ collections: ['pages'] }),
  redirectsPlugin({ collections: ['pages'], url: ({ doc }) => pageURL(doc) }),
  seoPlugin({ collections: ['pages'], generateURL: ({ doc }) => pageURL(doc) }),
]
```

ถ้าต้องการให้ผลการค้นหาแสดงตำแหน่งของหน้า ส่ง breadcrumbs ให้ `seoMeta` ของ plugin SEO
ซึ่งจะเพิ่ม BreadcrumbList JSON-LD ให้

```ts
const seo = seoMeta(page, {
  url: (p) => pageURL(p),
  breadcrumbs: page.breadcrumbs.map((b) => ({ name: b.label, url: `/p${b.url}` })),
})
```

## หลายภาษา {#localization}

เมื่อ slug เป็น `localized` แต่ละภาษาจะมี path และ breadcrumbs ของตัวเอง: `/about/team` ในภาษาอังกฤษ
และ `/เกี่ยวกับ/ทีม` ในภาษาไทย ส่วนหน้าแม่ใช้ร่วมกันทุกภาษา เพราะเว็บควรมีหมวดเหมือนกันทุกภาษา
ส่ง `locale` ให้ `findByPath` และ `getTree`

## หน้าที่มีอยู่ก่อนติดตั้ง plugin {#pages-that-existed-before-the-plugin}

เมื่อเพิ่ม plugin ให้ collection ที่มีหน้าอยู่แล้ว path ของหน้าเหล่านั้นจะว่างจนกว่าจะบันทึก
คำนวณทั้งหมดในครั้งเดียวด้วย

```bash [pm]
npx easy-cms nested:rebuild
```

คำสั่งนี้ยังซ่อมหน้าหลังเกิดข้อผิดพลาด และย้ายหน้าที่หน้าแม่ถูกลบไปอยู่ระดับบนสุด
ในโค้ดใช้ `rebuildNestedDocs(cms, 'pages')` ได้เหมือนกัน ถ้า collection มี field `parent`
ที่เป็น relationship ไปหาตัวเองอยู่แล้ว plugin จะใช้ field นั้นต่อ

## Option {#options}

| Option | ค่าเริ่มต้น | |
|---|---|---|
| `collections` | — | collection ที่เอกสารมีหน้าแม่ใน collection เดียวกันได้ |
| `slugField` | `slug` | field ที่แต่ละหน้าต่อท้าย path ของหน้าแม่ (field แบบ `slug` หรือ `text`) |
| `titleField` | `useAsTitle` | field ที่แสดงใน breadcrumbs |
| `fieldNames` | `parent`, `breadcrumbs`, `path` | `{ parent, breadcrumbs, path }`: ชื่อ field ที่เพิ่ม |
| `maxDepth` | `10` | จำนวนระดับของหน้า รวมระดับบนสุด |
| `onDeleteParent` | `restrict` | `restrict` หรือ `orphan`: เมื่อลบหน้าที่มีหน้าย่อย |

## ความสามารถของ core ที่ใช้ {#built-on-core-features}

Plugin นี้สร้างจากความสามารถของ Easy CMS ที่ collection ของคุณใช้เองได้ด้วย

- `admin: { list: { tree: 'parent' } }`: รายการแบบต้นไม้ตาม relationship ไปหา collection เดียวกัน
  ส่วน `list.sort` กำหนดลำดับเริ่มต้นของรายการ ดู [การตั้งค่า](./configuration)
- `filterOptions` ของ relationship: เอกสารใดบ้างที่เลือกได้ ดู [Field](./fields)
- `uniqueWithin` ของ slug: ห้ามซ้ำเฉพาะเอกสารที่มีค่าของอีก field เหมือนกัน
- `update(…, { live: true })` ใน [Local API](./local-api): ดูแลค่าของเวอร์ชันที่เผยแพร่อยู่ โดยไม่แตะ draft ที่ค้างไว้และไม่เพิ่ม version
- `cliCommands` ใน config: คำสั่ง `easy-cms <name>` จาก plugin ดู [CLI](./cli)

## ในหลาย tenant {#in-several-tenants}

เมื่อใช้ [plugin multi-tenant](./multi-tenant#with-other-plugins) path ห้ามซ้ำแค่ภายใน tenant ส่ง `context` ของ request ให้
`findByPath()` และ `getTree()`

## ขั้นต่อไป {#next-steps}

- [Redirects](./redirects): ให้ที่อยู่เดิมยังใช้ได้
- [SEO](./seo): metadata และ sitemap ของหน้า
