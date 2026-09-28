# Webhooks {#webhooks}

::: info หน้านี้สอนอะไร
แจ้งบริการอื่นเมื่อเนื้อหาเปลี่ยน พร้อมลายเซ็นและการส่งซ้ำที่ไม่หายแม้ server รีสตาร์ต

**ควรอ่านก่อน:** [Hooks](./hooks)
:::

แจ้งบริการอื่นเมื่อเนื้อหาเปลี่ยนแปลง เช่น build static site ใหม่ ล้าง cache ของ CDN หรือแจ้งเตือนไปยัง
ช่องแชต

```ts
export default defineConfig({
  webhooks: [
    // Every event of every collection and global, signed.
    { url: 'https://example.com/cms-hook', secret: process.env.WEBHOOK_SECRET },
    // Only publishing of posts, e.g. a Vercel or Netlify build hook.
    { url: process.env.BUILD_HOOK_URL!, events: ['publish', 'unpublish'], collections: ['posts'], globals: [] },
  ],
})
```

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `url` | จำเป็น | ปลายทางที่ event จะถูก POST ไป |
| `events` | ทั้งหมด | `create`, `update`, `delete`, `publish`, `unpublish`, `draft` |
| `collections` | ทั้งหมด | slug ของ collection ใช้ `[]` เพื่อไม่เลือกเลย |
| `globals` | ทั้งหมด | slug ของ global ใช้ `[]` เพื่อไม่เลือกเลย |
| `secret` | — | ลงลายเซ็นทุก request (ดูด้านล่าง) |
| `headers` | — | header เพิ่มเติม เช่น token ที่ฝั่งรับใช้ตรวจสอบ |

## Events {#events}

| Event | เมื่อใด |
|---|---|
| `create` | มีการสร้างเอกสาร |
| `update` | เอกสารที่จัดเก็บไว้หรือ global มีการเปลี่ยนแปลง |
| `delete` | มีการลบเอกสาร |
| `publish` | status เปลี่ยนเป็น `published` (ส่งพร้อมกับ `create` หรือ `update`) |
| `unpublish` | status ไม่เป็น `published` อีกต่อไป |
| `draft` | บันทึกเฉพาะฉบับร่าง เนื้อหาที่แสดงบนเว็บไม่เปลี่ยน ([เวอร์ชัน](./drafts#versions)) |

การเผยแพร่ตาม[เวลาที่ตั้งไว้](./drafts#scheduled-publishing)จะส่ง event เดียวกัน

## Requests {#requests}

```http
POST /cms-hook
content-type: application/json
x-easy-cms-event: publish
x-easy-cms-delivery: 2f1c…            (the same on retries)
x-easy-cms-signature: sha256=9a0b…    (with `secret`)

{ "event": "publish", "collection": "posts", "id": 12, "doc": { … }, "timestamp": "…" }
```

`doc` คือเอกสารที่จัดเก็บไว้ ครบทุกภาษา โดยไม่มี field ที่ซ่อนอยู่ ตรวจสอบลายเซ็นด้วย
HMAC-SHA256 ของ body ดิบ:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
const valid =
  expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
```

## Delivery {#delivery}

webhook จะถูกส่งหลังจากบันทึกการเปลี่ยนแปลงแล้ว และจะไม่ทำให้การบันทึกช้าลงหรือล้มเหลว กรณี timeout
(10 วินาที), ข้อผิดพลาดของเครือข่าย, คำตอบ `429` และ `5xx` จะลองส่งใหม่ ส่วนคำตอบ `4xx` อื่นๆ
จะถูกบันทึก log และไม่ลองใหม่

- ลองใหม่เร็วๆ สองครั้งใน process ที่ทำการเปลี่ยนแปลง (หลัง 1 วินาทีและ 5 วินาที)
- การส่งแต่ละครั้งจะถูกบันทึกลงฐานข้อมูล (ตารางภายใน `webhook-deliveries`) ก่อนส่งครั้งแรก และลบออกเมื่อสำเร็จ
  จึงไม่หายแม้ restart หรือฟังก์ชัน serverless หยุดทำงานกลางคันระหว่างส่ง ถ้า process หยุดระหว่างส่ง
  การรันรอบถัดไปจะส่งต่อให้หลังผ่านไป 5 นาที
- หลังจากนั้นจะลองใหม่พร้อมกับ[งานที่ตั้งเวลาไว้](./drafts#scheduled-publishing): หลัง 1 นาที, 5 นาที,
  30 นาที, 2, 6 และ 12 ชั่วโมง server จะรันทุกนาทีเอง ส่วน serverless ให้ cron เรียก `<api>/jobs/run`
- หลังครั้งสุดท้าย (ประมาณหนึ่งวัน) การส่งจะถูกเก็บไว้เป็น `state: 'failed'` พร้อม error ล่าสุด
  และไม่ลองใหม่อีก

ทุกครั้งที่ลองใหม่จะส่ง body, ลายเซ็น และ `x-easy-cms-delivery` เหมือนเดิม ปลายทางจึงข้ามการส่งที่เคยจัดการแล้วได้
การเพิ่ม `webhooks` ใน config จะเพิ่มตาราง `webhook-deliveries` ให้สร้าง migration เหมือนการเปลี่ยน config ทั่วไป

บนแพลตฟอร์ม serverless ฟังก์ชันอาจหยุดทำงานก่อนที่ webhook จะถูกส่ง: ให้เรียก
`await cms.flushWebhooks()` ก่อน return เมื่อเขียนข้อมูลผ่าน Local API บนแพลตฟอร์มเหล่านั้น
ส่วน `await cms.retryWebhooks()` จะลองส่งรายการที่บันทึกไว้ซึ่งถึงเวลาแล้ว (`runJobs()` ทำทั้งส่วนนี้และการเผยแพร่ตามเวลา)

## ขั้นต่อไป {#next-steps}

- [ฉบับร่าง เวอร์ชัน และการตั้งเวลา](./drafts): การเผยแพร่ทำให้เกิดอะไร
- [CLI](./cli): ส่งซ้ำจาก cron
