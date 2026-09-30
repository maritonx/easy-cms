# Local API {#local-api}

::: info หน้านี้สอนอะไร
ทุกฟังก์ชันของ Local API ที่มี type: ค้นหา สร้าง แก้ ลบ ฉบับร่าง เวอร์ชัน และตัวเลือกเรื่องสิทธิ์

**ควรอ่านก่อน:** [การตั้งค่า](./configuration)
:::

Local API คือวิธีที่โค้ดฝั่ง server อ่านและเขียนเนื้อหาโดยไม่ต้องผ่าน HTTP:

```ts
const cms = await useEasyCMS() // Nuxt server routes
const cms = await getEasyCMS(config) // Next.js
```

นอก framework (สคริปต์, เทสต์):

```ts
import { createEasyCMS } from '@easy-cms/core'
import config from './easy-cms.config'

const cms = await createEasyCMS(config)
// …
await cms.destroy()
```

## เมธอด {#methods}

```ts
await cms.find('posts', { where, sort: '-createdAt', limit: 10, page: 1, depth: 1, draft: false })
await cms.findById('posts', 12, { depth: 0 })
await cms.count('posts', { where })
await cms.create('posts', { title: 'Hello' })
await cms.update('posts', 12, { title: 'Hello again' })
await cms.delete('posts', 12)
await cms.findGlobal('site')
await cms.updateGlobal('site', { siteName: 'Easy' })
await cms.upload({ data, name: 'photo.jpg' }, { alt: '' })

// Collections and globals with versions (see Drafts & versions)
await cms.findVersions('posts', 12, { limit: 20, page: 1 })
await cms.findVersion('posts', 12, versionId)
await cms.restoreVersion('posts', 12, versionId)
await cms.unpublish('posts', 12)
await cms.discardDraft('posts', 12)

// Scheduled publishing and webhooks
await cms.schedule('posts', 12, { action: 'publish', at: new Date('2026-10-01T02:00:00Z') })
await cms.runJobs() // what servers do every minute: scheduled jobs and webhook retries
await cms.runScheduled() // only scheduled publishing
await cms.retryWebhooks() // only webhook deliveries that failed earlier
await cms.upcomingJobs({ limit: 10 }) // next scheduled publishes across the site
await cms.flushWebhooks() // wait for webhook deliveries (serverless)
```

`find` คืนค่า `{ docs, totalDocs, limit, page, totalPages, hasNextPage, hasPrevPage }`
`limit: 0` คืนค่าทุกรายการที่ตรงเงื่อนไข `findById` คืนค่า `null` เมื่อไม่พบ ส่วน `update` และ `delete`
จะ throw `NotFoundError`

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `where` | — | ตัวกรอง ดูด้านล่าง |
| `sort` | `-createdAt` | path ของ field หรือรายการ ใช้ `-` สำหรับเรียงจากมากไปน้อย |
| `limit`, `page` | `10`, `1` | การแบ่งหน้า |
| `depth` | `1` | จำนวนระดับของ relationship ที่จะดึงข้อมูลมาแทน (สูงสุด 3) |
| `draft` | `false` | รวมฉบับร่าง (draft) ด้วย |
| `locale` | ภาษาเริ่มต้น | เมื่อใช้ [หลายภาษา](./localization): ภาษาที่จะอ่านหรือเขียน หรือ `'all'` |
| `fallbackLocale` | `true` | ค่าที่ localized แล้วว่างจะใช้ค่าของภาษาเริ่มต้นแทน |
| `overrideAccess` | `true` | `false` จะใช้ [กฎการควบคุมสิทธิ์](./access-control) กับ `user` |
| `user` | `null` | ผู้ใช้ที่จะตรวจสอบสิทธิ์ |
| `live` | `false` | เฉพาะ `update`: ดูแลค่าของเวอร์ชันที่เผยแพร่อยู่ สำหรับค่าที่ plugin ดูแลให้เป็นปัจจุบัน draft ที่ค้างไว้ยังค้างอยู่ และไม่เพิ่ม version ในประวัติ |

## where {#where}

```ts
{
  status: { equals: 'published' },
  views: { gte: 100 },
  title: { like: 'nuxt' }, // case-insensitive contains
  tags: { in: ['vue', 'nuxt'] }, // hasMany: any of
  'seo.title': { exists: true }, // group fields
  'links.url': { like: 'github' }, // fields inside array rows
  or: [{ featured: { equals: true } }, { views: { gt: 1000 } }],
}
```

ตัวดำเนินการ: `equals`, `not_equals`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `like`, `exists`
และ `and` / `or` โดย `not_equals` และ `not_in` จะรวมค่าว่างด้วย ยังไม่รองรับการ query ภายใน
เอกสารที่เชื่อมโยงกัน (`author.name`)

## Type {#types}

ผลลัพธ์และ input มี type ตาม config ของคุณ: `cms.find('posts')` ให้ `docs` ที่มี `title:
string`, `cms.create` บังคับให้ใส่ field ที่จำเป็น และชื่อ collection ที่ไม่รู้จักจะเป็น error ดู
[TypeScript](./typescript)

## Error {#errors}

error มี `status` คล้าย HTTP: `ValidationError` (400 พร้อม `errors: [{ field, message }]`),
`UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404),
`PayloadTooLargeError` (413), `TooManyRequestsError` (429), `QueryError` (400)

## ขั้นต่อไป {#next-steps}

- [TypeScript](./typescript): type ที่ได้กลับมา
- [REST API](./rest-api): ทำแบบเดียวกันผ่าน HTTP
