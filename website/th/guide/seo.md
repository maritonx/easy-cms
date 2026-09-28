# SEO {#seo}

::: info หน้านี้สอนอะไร
เพิ่ม field SEO พร้อมตัวอย่างผลการค้นหาในหน้า admin และเติม metadata ของหน้าเว็บจาก field เหล่านั้น

**ควรอ่านก่อน:** [Plugins](./plugins)
:::

<Screenshot name="seo" alt="field SEO พร้อมตัวนับความยาวและตัวอย่างผลการค้นหา" />

`@easy-cms/plugin-seo` เพิ่ม group `meta` (ชื่อ คำอธิบาย และรูปสำหรับแชร์) ให้ collection และ global ที่เลือก
ผู้แก้เนื้อหาจะเห็นความยาวของข้อความแต่ละช่อง ตัวอย่างผลการค้นหา และปุ่มสร้างให้ ส่วนหน้าเว็บของคุณได้ metadata จากฟังก์ชันเดียว

```bash
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
(ดู [Migration](./deployment))

## ในหน้า admin {#in-the-admin}

- **ชื่อสำหรับค้นหา** และ **คำอธิบายสำหรับค้นหา** พร้อมตัวนับว่าสั้นไป พอดี หรือยาวไป
  (ค่าเริ่มต้น 50–60 และ 100–150 ตัวอักษร นับสระและวรรณยุกต์ไทยรวมกับตัวอักษรที่มันอยู่เป็นหนึ่งตัว)
- **รูปสำหรับแชร์** จากคลังสื่อ
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
| `generateURL` | — | ที่อยู่ของหน้า สำหรับตัวอย่างผลการค้นหา |
| `autoGenerate` | `false` | เติมช่อง meta ที่ว่างด้วย generator ตอนบันทึกเอกสาร |
| `fields` | — | `(defaults) => fields`: ปรับ field ใน group เช่น เพิ่มช่องติ๊ก `noindex` |
| `titleLength` | `{ min: 50, max: 60 }` | ความยาวที่ถือว่าพอดี |
| `descriptionLength` | `{ min: 100, max: 150 }` | ความยาวที่ถือว่าพอดี |
| `localized` | ตาม `localization` | เก็บค่าแยกตาม[ภาษาของเนื้อหา](./localization) |
| `label` | `'SEO'` | ชื่อของ group |

generator ได้รับ `{ doc, id, locale, collection | global, cms, user }` และเป็น async ได้ คืน `null`
เมื่อไม่มีอะไรจะเสนอ

## ในหน้าเว็บของคุณ {#on-your-pages}

`seoMeta(doc, options)` อ่าน field meta ถ้าว่างจะใช้ค่าจากเอกสาร (`title` แล้วตามด้วย `excerpt` หรือ
`description`) และคืน metadata สำหรับ Nuxt และ Next.js ให้ดึงเอกสารด้วย `depth` ตั้งแต่ 1 ขึ้นไป
เพื่อให้รูปสำหรับแชร์มี URL

::: code-group

```vue [หน้า Nuxt]
<script setup lang="ts">
import { seoMeta } from '@easy-cms/plugin-seo'

const route = useRoute()
const { data: post } = await useFetch(`/api/posts/${route.params.slug}`)
const seo = seoMeta(post.value ?? {}, { siteUrl: useRequestURL().origin, url: route.path })
useSeoMeta(seo.nuxt)
useHead({ link: seo.canonical ? [{ rel: 'canonical', href: seo.canonical }] : [] })
</script>
```

```ts [หน้า Next.js]
import { seoMeta } from '@easy-cms/plugin-seo'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const post = (await cms.find('posts', { where: { slug: { equals: slug } }, limit: 1 })).docs[0]
  return post ? seoMeta(post, { config, url: `/posts/${slug}` }).next : {}
}
```

:::

| ตัวเลือก | |
|---|---|
| `siteUrl` | ที่อยู่ของเว็บ ใช้ทำให้ URL ของ canonical และรูปเป็น URL เต็ม ค่าเริ่มต้นคือ `config.admin.siteUrl` แล้วตามด้วย `config.serverURL` |
| `config` | config ของ Easy CMS สำหรับอ่านค่าข้างบน |
| `url` | ที่อยู่ของหน้า (หรือ `(doc) => url`) สำหรับลิงก์ canonical และ `og:url` |
| `title`, `description` | `(doc) => text`: ค่าที่ใช้แทนเมื่อ field meta ว่าง |
| `siteName` | `og:site_name` |

ผลลัพธ์มี `title`, `description`, `canonical` และ `image` รวมทั้ง `nuxt` (สำหรับ `useSeoMeta`) และ
`next` (สำหรับ `generateMetadata`) ที่มีแท็ก Open Graph และ Twitter card

## ขั้นต่อไป {#next-steps}

- [หลายภาษา (localization)](./localization): field SEO แยกภาษา
- [Migration และการ deploy](./deployment): migration สำหรับคอลัมน์ใหม่
