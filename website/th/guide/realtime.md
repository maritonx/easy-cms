# Realtime {#realtime}

::: info หน้านี้สอนอะไร
ทำให้รายการหรือเอกสารบนเว็บอัปเดตตามที่ผู้แก้บันทึก โดยไม่ต้องโหลดหน้าใหม่: subscribe
การเปลี่ยนแปลงของ collection ผ่าน Server-Sent Events

**ควรอ่านก่อน:** [การควบคุมสิทธิ์](./access-control), [ฉบับร่าง เวอร์ชัน และการตั้งเวลา](./drafts)
:::

เปิดทีละ collection:

```ts
{
  slug: 'posts',
  realtime: true,
  fields: [/* … */],
}
```

จากนั้นทุกการบันทึกบทความจะเขียนแถวในตาราง `realtime-events` ด้วย ใน transaction เดียวกัน
สร้าง migration ให้ตารางนี้ (`easy-cms migrate:create realtime`) ตารางมีเฉพาะเมื่อมีอย่างน้อยหนึ่ง
collection ที่ตั้ง `realtime: true`

ผู้ subscribe ได้การเปลี่ยนแปลงห้าแบบ: `create`, `update`, `delete`, `publish` และ `unpublish`
แต่ละอันมีเอกสาร**ตามที่ผู้ subscribe คนนั้นอ่านได้ผ่าน REST**: สิทธิ์อ่านของ collection (รวม `where`
ระดับแถว), สิทธิ์อ่านระดับ field, สิทธิ์ของ API key และฉบับร่าง ใช้กับแต่ละคนแยกกัน

## ในเบราว์เซอร์ {#in-the-browser}

`createClient()` จาก `@easy-cms/core/client` มี `live()`: รายการที่โหลดด้วย `find` แล้วอัปเดตตาม
event ต่อไป ถ้าใส่ `id` จะเป็นเอกสารเดียว

### Next.js {#next-js}

`useLive` จาก `@easy-cms/next/live` ใน Client Component:

```tsx
'use client'
import { createClient } from '@easy-cms/core/client'
import { useLive } from '@easy-cms/next/live'
import type config from '@/easy-cms.config'

const cms = createClient<typeof config>({ url: '/api/cms' })

export function LivePosts() {
  const { docs, ready, error } = useLive(cms, 'posts', { sort: '-createdAt', limit: 20 })
  if (!ready) return <p>กำลังโหลด…</p>
  return (
    <ul>
      {docs.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

ส่งสิ่งที่ Server Component โหลดมาเป็นอาร์กิวเมนต์ที่สี่ (`initial`) เพื่อแสดงก่อนโหลดครั้งแรกเสร็จ
ตัวอย่าง Next.js มีหน้านี้ที่ `/live`

### Nuxt {#nuxt}

`useLive` ถูก auto-import คืนค่าเป็น ref และถ้า query เป็น reactive จะ subscribe ใหม่เมื่อเปลี่ยน:

```vue
<script setup lang="ts">
import { createClient } from '@easy-cms/core/client'
import type config from '~/easy-cms.config'

const cms = createClient<typeof config>({ url: '/api/cms' })
const { docs: posts, ready } = useLive(cms, 'posts', { sort: '-createdAt', limit: 20 })
</script>
```

### รายการทำอะไร {#what-the-list-does}

- `create`, `update`, `publish` และ `unpublish` ใส่เอกสารเข้าไป (หรือแทนอันเดิม) ตามลำดับของ `sort`
  (ค่าเริ่มต้น `-createdAt`) ถ้ามี `limit` จะเก็บไม่เกินจำนวนนั้น
- `delete` และ `leave` เอาออก `leave` แปลว่าผู้ subscribe คนนี้มองไม่เห็นเอกสารนั้นแล้ว เช่น
  บทความที่ผู้เยี่ยมชมเห็นถูก unpublish หรือไม่ตรง `where` หรือสิทธิ์ของผู้ใช้แล้ว ทั้งสองมาเฉพาะเอกสารที่เคยเห็น
- หลัง `reset` จะโหลดรายการใหม่

## Subscribe เอง {#subscribing-yourself}

`subscribe()` รับหลาย subscription ในการเชื่อมต่อเดียว: ทั้ง collection, เอกสารที่ตรง `where` หรือ
เอกสารเดียว

```ts
const cms = createClient<typeof config>({ url: 'https://cms.example.com/api/cms' })

const stream = cms.subscribe(
  [
    { collection: 'posts', where: { category: { equals: 'news' } } },
    { collection: 'comments', id: 42 },
  ],
  {
    onEvent: (change) => {
      if (change.collection === 'posts' && 'doc' in change) console.log(change.doc.title)
    },
    onReady: () => console.log('เชื่อมต่อแล้ว'),
    onReset: () => reloadEverything(),
    onError: (error) => console.warn(error),
  },
)
// ภายหลัง:
stream.close()
```

อ่าน stream ด้วย `fetch` จึงใช้ session cookie ของเบราว์เซอร์และ `token` ของ client
(`Authorization: Bearer`) ได้ เชื่อมต่อใหม่เองแบบเว้นระยะเพิ่มขึ้น และต่อจากที่ค้างไว้ หยุดเมื่อ API
ปฏิเสธ subscription (`400`, `401`, `403` หรือ `404`)

## Stream {#the-stream}

`GET <api>/realtime?s=<subscription>[&s=…]` ตอบเป็น `text/event-stream` แต่ละ `s` คือ path ใต้ API
พร้อม query แบบเดียวกับการอ่านผ่าน REST เข้ารหัส URL เป็นพารามิเตอร์เดียว:

| `s` | ติดตาม |
|---|---|
| `posts` | ทุกบทความที่ผู้ subscribe อ่านได้ |
| `posts/12` | บทความ 12 |
| `posts?where[category][equals]=news` | บทความที่ตรง `where` (แบบวงเล็บหรือ JSON `where=` เหมือน[รายการ](./rest-api)) |
| `posts?draft=true&depth=0&locale=th` | รวมฉบับร่าง (เฉพาะทีมงาน เหมือน REST), depth และ locale |

ได้ไม่เกิน 20 ต่อ stream ถ้าจะเปลี่ยนให้เปิด stream ใหม่

```
id: 812
event: update
data: {"collection":"posts","id":12,"doc":{"id":12,"title":"Hello","status":"published"}}

id: 813
event: delete
data: {"collection":"posts","id":9}
```

- `id:` คือ id ของ event และ event ส่งตามลำดับนี้ client ที่เชื่อมต่อใหม่ส่งค่านี้เป็น
  `Last-Event-ID` แล้วได้สิ่งที่พลาดไป (EventSource ทำให้เอง)
- `event:` คือ `create`, `update`, `delete`, `publish`, `unpublish` หรือ `leave` โดย `delete` และ
  `leave` มีแค่ `collection` กับ `id`
- `ready` มาเมื่อ stream พร้อม หลังสิ่งที่ client ที่เชื่อมต่อใหม่พลาดไป
- `reset` มาเมื่อต่อจากเดิมไม่ได้: หายไปนานกว่า `retentionHours` หรือตามหลังเกิน 1,000 event
  ให้โหลดสิ่งที่แสดงอยู่ใหม่
- บรรทัด comment ทุก `heartbeatMs` กันไม่ให้ proxy ปิด stream ที่เงียบ

การยืนยันตัวตนเหมือน REST: session cookie ในเบราว์เซอร์ หรือ API key ใน header `Authorization`
บนเซิร์ฟเวอร์ ไม่รับ token จาก URL ผู้เยี่ยมชม subscribe ได้เฉพาะสิ่งที่อ่านได้ สิทธิ์ตรวจตอนเปิด stream
(`where` บน field ที่ผู้ใช้อ่านไม่ได้ได้ `403` เหมือนรายการ) stream ที่ session หมดหรือ API key
ถูกยกเลิกจะปิดภายในหนึ่งนาที แล้ว client เชื่อมต่อใหม่ในฐานะผู้ใช้ปัจจุบัน

`leave` และ `delete` ส่งเฉพาะผู้ subscribe ที่เห็นเอกสารก่อนการเปลี่ยน: สถานะที่เก็บก่อนหน้าตรงกับ subscription
(`where`, `id`) และสิทธิ์อ่านของผู้ subscribe ตอนนี้ (`where` ระดับแถว, ฉบับร่างตามที่อ่านได้) จึงไม่มีใครรู้ id
ของเอกสารที่ไม่เคยอ่านได้ การตรวจนี้ทำในหน่วยความจำ ถ้าบอกไม่ได้ (`like`, ค่าใน array) จะไม่ส่งอะไร
client อาจค้างเอกสารนั้นไว้จนโหลดใหม่

## Local API {#local-api}

`cms.subscribe()` ให้ event เดียวกันในโค้ดฝั่งเซิร์ฟเวอร์ ไม่ว่าจะบันทึกจาก instance นี้หรือ instance อื่น
ที่ใช้ฐานข้อมูลเดียวกัน:

```ts
const changes = cms.subscribe('posts', { where: { status: { equals: 'published' } } })
await changes.ready
for await (const change of changes) {
  if (change.event === 'reset') continue
  console.log(change.event, change.id)
}
```

เหมือน Local API อื่นคือเชื่อผู้เรียก ส่ง `user` และ `overrideAccess: false` เพื่ออ่านในฐานะผู้ใช้
`after` ต่อจาก `eventId` ของ event หนึ่ง `close()` (หรือ `break`) เพื่อหยุด

## ตัวเลือก {#options}

```ts
export default defineConfig({
  realtime: {
    retentionHours: 24, // เก็บ event ไว้ให้ client ที่เชื่อมต่อใหม่
    pollMs: 1000, // แต่ละเซิร์ฟเวอร์อ่าน event ใหม่บ่อยแค่ไหน
    heartbeatMs: 25_000,
    maxPerUser: 10, // stream ต่อผู้ใช้ API key หรือ IP ของผู้เยี่ยมชม ต่อเซิร์ฟเวอร์: เกินได้ 429
    maxConnections: 1000, // stream ต่อเซิร์ฟเวอร์: เกินได้ 503
  },
  // …
})
```

## หลาย instance และ serverless {#several-instances-and-serverless-hosts}

- แต่ละเซิร์ฟเวอร์อ่าน event ใหม่จากฐานข้อมูลทุก `pollMs` (ครั้งเดียวสำหรับผู้ subscribe ทั้งหมดของมัน)
  แล้วส่งให้ stream ของตัวเอง การบันทึกบน instance หนึ่งจึงถึงผู้ subscribe ทุก instance ภายในราว
  `pollMs` ไม่ใช้ Redis หรือ LISTEN/NOTIFY: instance ใช้ร่วมกันแค่ฐานข้อมูล เหมือน job
- **Cloudflare Workers** เขียนลง stream ของ request หนึ่งจากอีก request ไม่ได้ แต่ละ stream จึงอ่าน
  ตารางเอง: หนึ่ง query ต่อ stream ทุก `pollMs` บน Workers ควรตั้ง `pollMs` สูงขึ้นหรือมี stream ไม่มาก
  ขีดจำกัดนับต่อ isolate
- **ฟังก์ชัน serverless** (Vercel, Netlify) ตัด stream เมื่อถึงเวลาสูงสุดของฟังก์ชัน client เชื่อมต่อใหม่
  ด้วย `Last-Event-ID` และไม่พลาดอะไร แต่ stream ที่เปิดนานกินเวลาฟังก์ชัน ถ้ามีผู้ subscribe มาก
  เซิร์ฟเวอร์ (`easy-cms serve`, Docker) เหมาะกว่า
- แถวที่เก่ากว่า `retentionHours` ถูกลบโดย job ที่รันทุกนาที (หรือ cron ของคุณที่เรียก
  `GET <api>/jobs/run`)

## ข้อควรรู้ {#things-to-know}

- adapter ฐานข้อมูลที่เขียน outbox ได้ (`@easy-cms/db-sqlite`, `@easy-cms/db-postgres`) เขียน event
  ใน transaction ของการบันทึก: ไม่มี event ที่ไม่มีการบันทึก และไม่มีการบันทึกที่ไม่มี event adapter
  อื่นเขียนทันทีหลังบันทึก และเซิร์ฟเวอร์แจ้งตอนเริ่ม
- แต่ละ event อ่านเอกสารหนึ่งครั้งต่อผู้ subscribe (ผู้เยี่ยมชมที่ subscribe แบบเดียวกันใช้การอ่านร่วมกัน)
  ผู้ subscribe จำนวนมากบน collection ที่แก้บ่อยจึงมีค่าอ่าน
- global, การอัปเดตสดในหน้า admin เอง และ channel ที่กำหนดเอง ยังไม่อยู่ใน realtime

## ขั้นต่อไป {#next-steps}

- [การควบคุมสิทธิ์](./access-control): ผู้ subscribe แต่ละคนอ่านอะไรได้
- [Webhooks](./webhooks): ส่งการเปลี่ยนแปลงไปบริการอื่นแทน
