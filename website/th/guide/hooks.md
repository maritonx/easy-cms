# Hooks {#hooks}

::: info หน้านี้สอนอะไร
การรันโค้ดของคุณเมื่อเอกสารถูกสร้าง แก้ อ่าน หรือลบ พร้อมตัวอย่างสำหรับกรณีที่พบบ่อย

**ควรอ่านก่อน:** [การตั้งค่า](./configuration)
:::

Hook รันโค้ดของคุณในจังหวะต่างๆ ของเอกสาร และทำงานกับทุกช่องทาง: Local API, REST API และหน้า admin
แต่ละ hook เป็น list ของฟังก์ชัน plugin จึงเพิ่มของตัวเองต่อจากของคุณได้

```ts
{
  slug: 'posts',
  hooks: {
    beforeChange: [({ data }) => ({ ...data, readingTime: minutes(data.body) })],
    afterChange: [({ doc }) => notifyTeam(`บันทึกแล้ว: ${doc.title}`)],
  },
  fields: [/* … */],
}
```

## Hook ของ collection {#collection-hooks}

| Hook | ทำงานเมื่อ | อาร์กิวเมนต์ | ค่าที่คืน |
|---|---|---|---|
| `beforeValidate` | ก่อนตรวจ field | `data`, `operation`, `previousDoc?` | data ใหม่ หรือไม่คืน |
| `beforeChange` | หลังตรวจ ก่อนบันทึก | `data`, `operation`, `previousDoc?` | data ใหม่ หรือไม่คืน |
| `afterChange` | หลังบันทึก | `doc`, `operation`, `previousDoc?` | — |
| `beforeDelete` | ก่อนลบ | `id` | — |
| `afterDelete` | หลังลบ | `id`, `doc` | — |
| `afterRead` | ทุกเอกสารที่ส่งกลับ | `doc` | doc ใหม่ หรือไม่คืน |

ทุก hook ได้รับเพิ่ม:

- `user`: ผู้ที่ทำ หรือ `null` (ไม่ได้ login หรือเรียก Local API จากโค้ดที่เชื่อถือได้)
- `cms`: [Local API](./local-api) สำหรับอ่านหรือเขียน collection อื่น
- `slug`: slug ของ collection (หรือ global) ใช้สะดวกเมื่อฟังก์ชันเดียวใช้กับหลายที่

`operation` เป็น `'create'` หรือ `'update'` ตอน update `previousDoc` คือเอกสารก่อนแก้ และ `data`
มีเฉพาะส่วนที่กำลังเปลี่ยน

global รองรับ `beforeValidate`, `beforeChange`, `afterChange` และ `afterRead`

## ลำดับและ error {#order-and-errors}

`beforeValidate` → ตรวจสอบ → `beforeChange` → บันทึก → `afterChange`

- hook แบบ **before** ที่ throw จะยกเลิกการทำงาน และ error ส่งถึงผู้เรียก ให้ throw `ValidationError`
  หรือ `ForbiddenError` จาก `@easy-cms/core` เพื่อให้หน้า admin แสดงข้อความชัดเจน
- hook แบบ **after** ที่ throw จะถูกบันทึก log และการเปลี่ยนแปลงยังถูกบันทึกอยู่
- `afterRead` ทำงานกับทุกเอกสารที่ส่งกลับ รวมถึง relationship ที่ populate ก่อนที่ field ที่ซ่อนและ
  field ที่ไม่มีสิทธิ์อ่านจะถูกตัดออก
- hook ใน list ทำงานทีละตัว แต่ละตัวเห็นผลของตัวก่อนหน้า
- hook ทำงานนอก transaction ของฐานข้อมูล: `afterChange` เห็นเอกสารที่บันทึกแล้ว และ hook ที่ช้าจะทำให้
  response ช้าตาม งานที่ใช้เวลานานให้ส่งไป queue หรือ [webhook](./webhooks)
  ถ้าเปิด [outbox](#outbox) after hook จะรันหลังส่ง response แทน และ retry ให้เมื่อล้ม

## Outbox {#outbox}

ค่าปริยาย after hook รันใน request ทันทีหลังบันทึก ถ้า hook ล้ม หรือ process หยุดกลางทาง ข้อมูลจะถูกบันทึกแล้ว
แต่ผลข้างเคียงไม่เกิด เช่น ไม่ได้ส่งอีเมล ไม่ได้ส่ง webhook ไม่ได้ล้าง cache เปิด outbox เพื่อให้ผลข้างเคียงเกิดทุกครั้งที่บันทึกสำเร็จ:

```ts
export default defineConfig({
  outbox: true,
  // ...
})
```

- การบันทึกเอกสารจะเขียนรายการ outbox ใน transaction เดียวกัน: บันทึกสำเร็จจะมีรายการเสมอ บันทึกไม่สำเร็จจะไม่มี
- worker รันรายการทันทีหลังบันทึกแบบเบื้องหลัง: hook `afterChange` และ `afterDelete` แล้ว
  [webhook](./webhooks) แล้ว index [ค้นหา](./search) แล้ว `httpCache.purge` โดย response ไม่ต้องรอ
- ส่วนที่ล้มจะ retry หลัง 1 นาที, 5 นาที, 30 นาที, 2 ชั่วโมง และ 12 ชั่วโมง ไปพร้อมกับ
  [งานตามเวลา](./jobs) (บน serverless ใช้ cron) ขั้นที่สำเร็จแล้วจะไม่รันซ้ำ หลังจากนั้นรายการจะเป็น failed
  และแสดงพร้อม error ใน **ตั้งค่า → งานเบื้องหลัง → Outbox** ซึ่ง admin กดลองใหม่ได้
- หลาย instance รัน outbox พร้อมกันได้: แต่ละรายการจะถูกหยิบโดย instance เดียว

สิ่งที่เปลี่ยนสำหรับ hook:

- **hook ต้องรันซ้ำได้โดยไม่เสียหาย** รายการรันอย่างน้อยหนึ่งครั้ง ไม่ใช่หนึ่งครั้งพอดี: retry จะรัน hook อีกรอบ
  และ worker ที่หยุดกลางทางจะปล่อยรายการให้ตัวอื่นทำต่อ ให้ตรวจก่อนทำ (ส่งอีเมลของออเดอร์นี้ไปแล้วหรือยัง)
  หรือใช้ id ที่ปลายทางรู้ว่าเคยได้รับแล้ว
- hook รันหลังส่ง response: request ที่บันทึกจะไม่เห็นผลของ hook และไม่ได้รับ error ของ hook
  และไม่รับประกันว่ารายการจะรันตามลำดับที่บันทึก
- `user` คือผู้ที่บันทึก ณ ตอนนั้น `context` เป็นค่าว่าง ส่วน `doc` และ `previousDoc` เป็นตามที่บันทึก
- บน serverless ให้เรียก `await cms.flushOutbox()` ก่อนฟังก์ชันจบ ไม่อย่างนั้นงานตามเวลาจะมาหยิบไปทำทีหลัง

outbox ต้องสร้าง migration สำหรับตารางของมัน (`easy-cms migrate:create`) และใช้กับ `@easy-cms/db-sqlite`
หรือ `@easy-cms/db-postgres` ใน 2.0 จะเปิดเป็นค่าปริยาย

## ตัวอย่าง {#recipes}

### ใส่ผู้เขียนตอนสร้าง {#set-the-author-on-create}

```ts
beforeChange: [
  ({ data, operation, user }) =>
    operation === 'create' && user ? { ...data, author: user.id } : data,
],
```

### อัปเดต field ที่คำนวณจาก field อื่น {#keep-a-derived-field-up-to-date}

```ts
import { richTextToPlainText } from '@easy-cms/richtext'

beforeChange: [
  ({ data }) =>
    data.body === undefined
      ? data // update ครั้งนี้ไม่ได้เปลี่ยน body
      : { ...data, readingTime: Math.ceil(richTextToPlainText(data.body).split(/\s+/).length / 200) },
],
```

### รีเฟรชหน้าเว็บหลังเผยแพร่ (Next.js) {#refresh-pages-after-publishing-next-js}

```ts
import { revalidatePath } from 'next/cache'

afterChange: [
  ({ doc }) => {
    revalidatePath('/')
    if (doc.slug) revalidatePath(`/posts/${doc.slug}`)
  },
],
```

ถ้าเว็บ build อยู่ที่อื่น (เว็บ static บน CDN) ให้ใช้ [webhook](./webhooks) แทน เพราะส่งซ้ำเมื่ออีกฝั่งล่ม

### ไม่ให้ลบสิ่งที่ยังถูกใช้อยู่ {#refuse-to-delete-what-is-still-in-use}

```ts
import { ForbiddenError } from '@easy-cms/core'

// ใน collection categories
beforeDelete: [
  async ({ id, cms }) => {
    const totalDocs = await cms.count('posts', { where: { category: { equals: id } } })
    if (totalDocs > 0) throw new ForbiddenError(`ยังมี ${totalDocs} บทความใช้หมวดหมู่นี้`)
  },
],
```

### เพิ่มค่าที่คำนวณให้ผลที่อ่าน {#add-a-computed-value-to-what-is-read}

```ts
afterRead: [({ doc }) => ({ ...doc, url: `/posts/${doc.slug}` })],
```

ค่าจาก `afterRead` ถูกส่งให้ client แต่ไม่ถูกเก็บและค้นหาไม่ได้ ถ้าต้องกรองหรือเรียงด้วยค่านี้ ให้เก็บด้วย `beforeChange`

## ข้อควรระวัง {#pitfalls}

- **วนซ้ำไม่จบ:** การเรียก `cms.update()` กับ collection เดียวกันใน `afterChange` ของมันเองจะทำให้ hook ทำงานอีกรอบ
  ให้แก้ `data` ใน `beforeChange` แทน
- **สิทธิ์:** การเรียก `cms` ใน hook ข้ามกฎสิทธิ์ (เป็นโค้ดฝั่ง server ที่เชื่อถือได้) ส่ง
  `{ user, overrideAccess: false }` เพื่อทำในนามผู้ใช้
- **update บางส่วน:** ตอน update `data` มีเฉพาะ field ที่กำลังเปลี่ยน ค่าอื่นให้อ่านจาก `previousDoc`

## ขั้นต่อไป {#next-steps}

- [การควบคุมสิทธิ์](./access-control): กำหนดว่าใครทำอะไรได้ แทนการตรวจใน hook
- [Webhooks](./webhooks): แจ้งบริการอื่นเมื่อเนื้อหาเปลี่ยน พร้อมการส่งซ้ำ
