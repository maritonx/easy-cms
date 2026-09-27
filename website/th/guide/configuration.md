# การตั้งค่า {#configuration}

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
| `serverURL` | — | origin สาธารณะ เช่น `https://example.com` ทำให้ URL ของ media เป็นแบบ absolute |
| `cors` | `[]` | origin ที่โค้ดฝั่งเบราว์เซอร์เรียก REST API ได้ หรือ `'*'` สำหรับทุก origin (คำขอแบบไม่ระบุตัวตน) origin ใน `auth.trustedOrigins` ได้รับอนุญาตเสมอ พร้อม cookie |
| `routes.api` | `/api/cms` | ตำแหน่งที่ให้บริการ REST API |
| `admin.path` | `/admin` | ตำแหน่งที่ให้บริการหน้า admin |
| `admin.locale` | `en` | ภาษาเริ่มต้นของหน้า admin: `en` หรือ `th` |
| `auth` | | ดู [ผู้ใช้และการยืนยันตัวตน](./auth) |
| `upload` | | ดู [การอัปโหลดและ media](./uploads) |
| `collections` | `[]` | ดูด้านล่าง |
| `globals` | `[]` | ดูด้านล่าง |
| `plugins` | `[]` | ฟังก์ชัน `(config) => config` ทำงานตามลำดับก่อนการตรวจสอบ |

## Collections {#collections}

collection คือประเภทของเนื้อหาที่มีเอกสารได้หลายรายการ เช่น โพสต์ สินค้า หน้าเว็บ

| ตัวเลือก | |
|---|---|
| `slug` | ชื่อ URL และชื่อตาราง: อักษรตัวพิมพ์เล็ก ตัวเลข `-` `_` |
| `fields` | [field](./fields) ทั้งหมด |
| `labels` | `{ singular, plural }` แต่ละค่าเป็น string หรือ `{ en, th }` |
| `useAsTitle` | field ระดับบนสุดที่แสดงเป็นชื่อเอกสารในหน้า admin |
| `drafts` | เพิ่ม `status` (`draft` \| `published`) ดู [ฉบับร่าง (draft)](./drafts) |
| `versions` | `true` หรือ `{ max }`: เก็บเวอร์ชันของการบันทึกทุกครั้ง พร้อมประวัติและการกู้คืน ถ้ามี `drafts` ด้วย ฉบับร่างของเอกสารที่เผยแพร่แล้วจะถูกเก็บแยก ดู [เวอร์ชัน](./drafts#versions) |
| `preview` | `({ doc }) => url`: หน้าที่แสดงเอกสาร สำหรับ [ตัวอย่างสด](./live-preview) |
| `access` | `{ read, create, update, delete }` ดู [การควบคุมสิทธิ์](./access-control) |
| `hooks` | ดู [Hooks](./hooks) |

เอกสารทุกรายการมี `id` (integer), `createdAt` และ `updatedAt` ด้วย

มี collection ในตัวสองรายการ: [`users`](./auth) และ [`media`](./uploads) ประกาศ collection
ที่ใช้ slug เดียวกันเพื่อเพิ่ม field กฎสิทธิ์ หรือ hook ให้กับ collection เหล่านี้

slug ที่สงวนไว้: `admin`, `globals`, `sessions`, `login-attempts`, `migrations`, `access`

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

global รองรับ `fields`, `label`, `drafts`, `versions`, `preview`, `access` (`read`, `update`) และ `hooks`
(`beforeChange`, `afterChange`, `afterRead`)

## Plugins {#plugins}

plugin รับ config เข้ามาและคืนค่า config ใหม่:

```ts
const seo = (): Plugin => (config) => ({
  ...config,
  collections: config.collections?.map((c) => ({
    ...c,
    fields: [...c.fields, { name: 'metaDescription', type: 'textarea', maxLength: 160 }],
  })),
})

export default defineConfig({ /* … */ plugins: [seo()] })
```
