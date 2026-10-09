# การตั้งค่า {#configuration}

::: info หน้านี้สอนอะไร
ตัวเลือกทั้งหมดของ `easy-cms.config.ts`: ค่าระดับบนสุด collection, global, แบรนด์ และ plugin

**ควรอ่านก่อน:** [เริ่มใช้งาน](./getting-started)
:::

ทุกอย่างเกี่ยวกับเนื้อหาของคุณอยู่ใน `easy-cms.config.ts` ที่ root ของโปรเจกต์:

```ts
import { defineConfig, isAdmin } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  admin: { locale: 'th' },
  collections: [
    {
      slug: 'posts',
      drafts: true,
      useAsTitle: 'title',
      access: { read: () => true, update: isAdmin },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'siteName', type: 'text' }] }],
})
```

`defineConfig` คืนค่า config เดิมโดยไม่เปลี่ยนแปลง และคง literal type ไว้เพื่อให้กำหนด type ของเอกสาร
จาก config ได้ config จะถูกตรวจสอบตอนเริ่มทำงาน ปัญหาทั้งหมดจะถูกรายงานพร้อมกันในครั้งเดียว
พร้อมบอกตำแหน่งและวิธีแก้ไข

## ตัวเลือกระดับบนสุด {#top-level-options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `secret` | — | **จำเป็น** อย่างน้อย 32 ตัวอักษร ใช้ลงนาม session ควรอ่านค่าจาก env var |
| `db` | — | **จำเป็น** database adapter: `sqlite()` หรือ `postgres()` ดู [ฐานข้อมูล](./databases) |
| `serverURL` | — | origin สาธารณะ เช่น `https://example.com` ทำให้ URL ของ media เป็นแบบ absolute และเป็นที่ที่ลิงก์ตั้งรหัสผ่านชี้ไป (production ต้องตั้งถ้าจะใช้ลิงก์นี้) |
| `webhooks` | `[]` | endpoint ที่จะได้รับแจ้งเมื่อเนื้อหาเปลี่ยนแปลง ดู [Webhooks](./webhooks) |
| `cronSecret` | `CRON_SECRET` | ให้ cron รัน[งานที่ตั้งเวลาไว้](./drafts#scheduled-publishing)ที่ `<api>/jobs/run` ได้ |
| `localization` | — | `{ locales, defaultLocale?, fallback? }`: เนื้อหาหลายภาษา (ถ้ามีภาษาเดียว ไม่ต้องใส่ หรือตั้งเป็น `false`) ดู [หลายภาษา](./localization) |
| `cors` | `[]` | origin ที่โค้ดฝั่งเบราว์เซอร์เรียก REST API ได้ หรือ `'*'` สำหรับทุก origin (คำขอแบบไม่ระบุตัวตน) origin ใน `auth.trustedOrigins` ได้รับอนุญาตเสมอ พร้อม cookie |
| `routes.api` | `/api/cms` | ตำแหน่งที่ให้บริการ REST API |
| `admin.path` | `/admin` | ตำแหน่งที่ให้บริการหน้า admin |
| `admin.locale` | `en` | ภาษาเริ่มต้นของหน้า admin: `en` หรือ `th` |
| `admin.siteURL` | `/` (Nuxt, Next.js) | เว็บไซต์สาธารณะ สำหรับปุ่ม "ดูเว็บไซต์" ในหน้า admin: path หรือ URL แบบ `https://` |
| `admin.brand` | — | `{ name, logo, color }`: แบรนด์ของคุณหรือลูกค้าในหน้า admin ดู[ใส่แบรนด์ให้หน้า admin](#branding-the-admin) |
| `admin.modules` | `[]` | ไฟล์ JavaScript ที่มี Web Components สำหรับหน้า admin ระบุเป็น export ของแพ็กเกจหรือ path ส่วนใหญ่ [plugin](./plugins#admin-components) เป็นคนเพิ่มให้ |
| `auth` | | ดู [ผู้ใช้และการยืนยันตัวตน](./auth) |
| `upload` | | ดู [การอัปโหลดและ media](./uploads) |
| `collections` | `[]` | ดูด้านล่าง |
| `globals` | `[]` | ดูด้านล่าง |
| `endpoints` | `[]` | REST endpoint ของคุณเอง: `{ path, method, handler }` ดู [Plugins](./plugins#endpoints) |
| `plugins` | `[]` | ฟังก์ชัน `(config) => config` ทำงานตามลำดับก่อนการตรวจสอบ ดู [Plugins](./plugins) |

## Collections {#collections}

collection คือประเภทของเนื้อหาที่มีเอกสารได้หลายรายการ เช่น โพสต์ สินค้า หน้าเว็บ

| ตัวเลือก | |
|---|---|
| `slug` | ชื่อ URL และชื่อตาราง: อักษรตัวพิมพ์เล็ก ตัวเลข `-` `_` |
| `fields` | [field](./fields) ทั้งหมด |
| `labels` | `{ singular, plural }` แต่ละค่าเป็น string หรือ `{ en, th }` |
| `useAsTitle` | field ระดับบนสุดที่แสดงเป็นชื่อเอกสารในหน้า admin |
| `admin.icon` | ไอคอนในเมนูของหน้า admin (ค่าเริ่มต้น `file-text`) เลือกจากรายชื่อใน[ใส่แบรนด์ให้หน้า admin](#branding-the-admin) |
| `admin.order` | ตำแหน่งในกลุ่มของเมนู เช่น `1` ค่าน้อยมาก่อน collection ที่ไม่ได้ตั้งจะตามมาตามลำดับใน config คลังสื่ออยู่ท้ายสุด ส่วนผู้ใช้อยู่ในหมวดตั้งค่า |
| `admin.group` | `'settings'` แสดง collection ใต้ตั้งค่าในเมนู (คู่กับ Users และ API keys) แทนที่จะอยู่กับเนื้อหา ส่วน `false` เอาออกจากเมนู (ยังเข้าถึงได้ผ่านลิงก์) ดู[เมนู](./admin#the-menu) |
| `admin.editIn` | `'drawer'`: สร้างและแก้ไขในแผงเลื่อนทับหน้ารายการ เหมาะกับ collection เล็กอย่างหมวดหมู่ และช่อง relationship ที่ชี้มาจะมีปุ่ม "สร้าง" ที่เปิดแผงเดียวกัน ส่วน collection ที่มี drafts, versions หรือ preview จะใช้หน้าเต็มเสมอ |
| `admin.list` | `{ tree: 'parent', sort: 'title' }` แสดงรายการเป็นต้นไม้ตาม relationship ไปหา collection เดียวกัน พร้อมกำหนดลำดับเริ่มต้น |
| `drafts` | เพิ่ม `status` (`draft` \| `published`) ดู [ฉบับร่าง (draft)](./drafts) |
| `versions` | `true` หรือ `{ keep }`: เก็บเวอร์ชันของการบันทึกทุกครั้ง พร้อมประวัติและการกู้คืน ถ้ามี `drafts` ด้วย ฉบับร่างของเอกสารที่เผยแพร่แล้วจะถูกเก็บแยก ดู [เวอร์ชัน](./drafts#versions) |
| `preview` | `({ doc }) => url`: หน้าที่แสดงเอกสาร สำหรับ [ตัวอย่างสด](./live-preview) |
| `admin.sidebar` | กล่องจาก [admin components](./plugins#admin-components) ในแถบข้างของหน้าแก้ไข |
| `schedule` | เผยแพร่และยกเลิกการเผยแพร่ตามเวลาที่ตั้งไว้ (ต้องมี `drafts`) ดู [การตั้งเวลาเผยแพร่](./drafts#scheduled-publishing) |
| `access` | `{ read, create, update, delete }` ดู [การควบคุมสิทธิ์](./access-control) |
| `hooks` | ดู [Hooks](./hooks) |

เอกสารทุกรายการมี `id` (integer), `createdAt` และ `updatedAt` ด้วย

มี collection ในตัวสองรายการ: [`users`](./auth) และ [`media`](./uploads) ประกาศ collection
ที่ใช้ slug เดียวกันเพื่อเพิ่ม field กฎสิทธิ์ หรือ hook ให้กับ collection เหล่านี้

slug ที่สงวนไว้: `admin`, `globals`, `jobs`, `sessions`, `login-attempts`, `document-versions`,
`scheduled-jobs`, `migrations`, `access`

## Globals {#globals}

global มีเอกสารเพียงรายการเดียวเท่านั้น เช่น การตั้งค่าเว็บไซต์ เมนูนำทาง footer

```ts
globals: [
  {
    slug: 'site',
    label: { en: 'Site settings', th: 'ตั้งค่าเว็บไซต์' },
    access: { read: () => true },
    fields: [
      { name: 'siteName', type: 'text', defaultValue: 'My site' },
      { name: 'menu', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'url', type: 'text' }] },
    ],
  },
],
```

global รองรับ `fields`, `label`, `drafts`, `versions`, `preview`, `admin` (`icon`, `order`, `group`, `sidebar`, `layout`),
`access` (`read`, `update`) และ `hooks` (`beforeValidate`, `beforeChange`, `afterChange`, `afterRead`)

## ใส่แบรนด์ให้หน้า admin {#branding-the-admin}

agency แสดงแบรนด์ของลูกค้าแทน Easy CMS ได้:

```ts
admin: {
  brand: {
    name: 'Acme Coffee',     // เมนู หน้าเข้าสู่ระบบ และแท็บของเบราว์เซอร์
    logo: '/acme-logo.svg',  // path บนเว็บของคุณ หรือ URL แบบ https://
    color: '#b45309',        // สีหลัก เฉดสว่างและเข้มจะคำนวณให้เอง
  },
},
collections: [
  { slug: 'posts', admin: { icon: 'newspaper' }, fields: [/* … */] },
  { slug: 'menu', admin: { icon: 'utensils' }, fields: [/* … */] },
],
globals: [{ slug: 'site', admin: { icon: 'house' }, fields: [/* … */] }],
```

ตัวอักษรบนสีแบรนด์จะเปลี่ยนเป็นสีเข้มเมื่อสีขาวอ่านยาก ผู้ใช้แต่ละคนเลือกธีมสว่าง มืด หรือตามระบบได้จากเมนู

ไอคอน ([Lucide](https://lucide.dev)): `file-text`, `newspaper`, `book-open`, `notebook`, `folder`, `tag`, `tags`, `image`, `images`, `video`, `music`, `file`, `users`, `user`, `building`, `store`, `shopping-bag`, `shopping-cart`, `package`, `box`, `calendar`, `calendar-days`, `map-pin`, `globe`, `house`, `layout-grid`, `layers`, `star`, `heart`, `message-square`, `mail`, `phone`, `briefcase`, `graduation-cap`, `utensils`, `car`, `settings`, `sliders-horizontal`, `palette`, `megaphone`, `bell`, `link`, `quote`, `circle-help`, `award`, `ticket`, `camera`, `key`, `chart-column`, `chart-line`

## Plugins {#plugins}

plugin รับ config เข้ามาและคืนค่า config ใหม่ จึงเพิ่ม field, collection,
[endpoint](./plugins#endpoints) และ [admin components](./plugins#admin-components) ได้:

```ts
import { seoPlugin } from '@easy-cms/plugin-seo'

export default defineConfig({ /* … */ plugins: [seoPlugin({ collections: ['posts'] })] })
```

ดู plugin ทางการและวิธีเขียน plugin เองได้ที่ [Plugins](./plugins)

## ขั้นต่อไป {#next-steps}

- [Fields](./fields): field ของ collection
- [การควบคุมสิทธิ์](./access-control): ใครอ่านและแก้อะไรได้บ้าง
