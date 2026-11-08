# Actions (ปุ่มที่รันโค้ด)

::: info สิ่งที่จะได้เรียนรู้
เพิ่มปุ่มที่รันโค้ดของคุณกับเอกสาร เช่น ยืนยันการจอง ส่งใบเสนอราคา หรือคืนเงิน ได้ทั้งในหน้าแก้ไข แถวในรายการ
และรายการที่เลือกไว้ พร้อมกำหนดว่าใครกดได้ ฟอร์มที่ต้องกรอก และบอกผลลัพธ์

**ก่อนหน้านี้:** [การตั้งค่า](./configuration), [สิทธิ์การเข้าถึง](./access-control)
:::

action คือฟังก์ชันใน collection ที่มีปุ่มในหน้า admin Easy CMS ตรวจว่าใครกดได้และใช้กับเอกสารนั้นได้ไหม ถามฟอร์มหรือขอยืนยัน
รันบนเซิร์ฟเวอร์ บันทึกลง[บันทึกการใช้งาน](./audit-log) แล้วบอกผู้ใช้ว่าทำอะไรไป action เดียวกันเรียกผ่าน REST และจากโค้ดได้ด้วย

```ts
// easy-cms.config.ts
export default defineConfig({
  collections: [
    {
      slug: 'bookings',
      fields: [
        { name: 'status', type: 'select', options: ['pending', 'confirmed', 'cancelled'] },
        // …
      ],
      actions: [
        {
          name: 'confirm',
          label: { en: 'Confirm booking', th: 'ยืนยันการจอง' },
          on: ['document', 'row', 'bulk'],
          when: ({ doc }) => doc.status === 'pending',
          fields: [{ name: 'note', type: 'textarea', label: 'ข้อความถึงลูกค้า' }],
          primary: true,
          run: async ({ doc, cms, input }) => {
            await cms.update('bookings', doc.id, { status: 'confirmed' })
            await cms.sendEmail({ to: String(doc.email), subject: 'ยืนยันแล้ว', text: String(input.note ?? '') })
            return { message: 'ยืนยันแล้ว' }
          },
        },
      ],
    },
  ],
})
```

## ปุ่มอยู่ตรงไหน {#where-the-buttons-are}

`on` บอกว่าปุ่มอยู่ตรงไหน (ค่าเริ่มต้น `['document', 'row']`):

- `document`: เมนู **การทำงาน** ข้างปุ่มบันทึกในหน้าแก้ไข `primary: true` แสดงเป็นปุ่มของตัวเอง และระหว่างเปิดหน้านี้ ⌘K
  ก็ค้นหาเจอ
- `row`: เมนู **…** ของแถวในรายการ
- `bulk`: แถบที่ขึ้นเมื่อเลือกรายการ รันกับแต่ละรายการที่เลือก และกับทุกเอกสารที่ตรงกับรายการเมื่อเลือกทั้งหมด
  ([bulk action](./admin#lists))

action รันกับสิ่งที่บันทึกแล้ว ถ้ามีการแก้ค้างอยู่ จะถามให้บันทึกก่อน (เป็นฉบับร่างถ้ามีฉบับร่าง) ถ้าบันทึกไม่ผ่านก็ไม่รัน

## เอกสาร, `when` และผลลัพธ์ {#the-document-when-and-the-result}

`run({ doc, input, user, cms, collection })` รันทีละเอกสาร `doc` คือเอกสารตามที่หน้าแก้ไขแสดง คือฉบับร่างถ้ามี
(`doc.status` บอกว่าเป็นแบบไหน) คืนค่าได้:

- `{ message }`: ข้อความที่บอกผู้ใช้
- `{ open: url }`: หน้าที่จะเปิด เช่น PDF ใบเสนอราคา หรือหน้าของผู้ให้บริการ โดยมีปุ่ม **เปิด** ข้างข้อความ
- ไม่คืนอะไร: ผู้ใช้เห็นว่า "เสร็จแล้ว"

หลังรันเสร็จ หน้าแก้ไขและรายการจะโหลดเอกสารใหม่ สิ่งที่ `run` เปลี่ยนจึงแสดงทันที

`when({ doc, user })` บอกว่าจะแสดงปุ่มกับเอกสารนี้ไหม เช่น เฉพาะการจองที่ยังรออยู่ เซิร์ฟเวอร์ตรวจซ้ำตอนรัน และใน bulk
เอกสารที่ไม่เข้าเงื่อนไขจะถูกข้ามและนับแยกไว้

```ts
import { ActionError } from '@easy-cms/core'

run: async ({ doc }) => {
  if (Date.parse(String(doc.date)) < Date.now()) throw new ActionError('เลยเวลายกเลิกแล้ว')
  // …
}
```

`throw new ActionError(message)` บอกผู้ใช้ด้วยคำของคุณว่าทำไมทำไม่ได้ error อื่นจะถูกบันทึกในเซิร์ฟเวอร์ และผู้ใช้เห็นว่า
action ไม่สำเร็จ

## ฟอร์ม และการถามก่อน {#a-form-and-asking-first}

`fields` คือฟอร์มเล็กที่ถามก่อนรัน ค่าที่กรอกคือ `input` ตรวจแบบเดียวกับ field ของเอกสาร ใช้ field ชนิด `text`,
`textarea`, `number`, `select`, `boolean`, `date`, `email` และ `relationship` ได้ ฟอร์มถือเป็นการถามอยู่แล้ว

ถ้าไม่มีฟอร์ม `confirm: true` จะถามก่อนรัน และ `confirm: { text, danger: true }` บอกว่าจะทำอะไรและทำให้ปุ่มเป็นสีแดง
ส่วน bulk ถามทุกครั้งพร้อมบอกจำนวนรายการ

## ใครกดได้ {#who-may-press-it}

- **ค่าเริ่มต้น:** ผู้ที่แก้ไขเอกสารนั้นได้ (สิทธิ์ `update` ของ collection)
- `access({ doc, user })` กำหนดเองได้ เช่น เฉพาะพนักงานที่ดูแลการจองนั้น
- **เมื่อใช้บทบาทจากหน้า admin** (`auth.rbac`) `default` บอกว่าสิทธิ์มาจากไหน:
  - `'admins'` (ค่าเริ่มต้น): เป็นสิทธิ์แยกใต้ collection ใน **Settings → บทบาท** เฉพาะผู้ดูแลระบบที่กดได้จนกว่าจะให้สิทธิ์กับบทบาท
    เพราะสิ่งที่เกี่ยวกับเงินไม่ควรมาพร้อมสิทธิ์แก้ไข
  - `'editors'`: ทุกบทบาทที่แก้ไข collection นั้นได้

เซิร์ฟเวอร์ตรวจทั้งหมดนี้และ `when` ทุกครั้งที่รัน การซ่อนปุ่มไม่ใช่การป้องกันอย่างเดียว

## ผ่าน REST และจากโค้ด {#over-rest-and-from-code}

```http
POST /api/cms/bookings/12/actions/confirm
{ "input": { "note": "พบกัน 9 โมง" } }
→ { "message": "ยืนยันแล้ว" }

POST /api/cms/bookings/actions/confirm
{ "ids": [12, 13], "input": { … } }        → { "done": 2, "skipped": [], "failed": [] }
{ "where": { … }, "input": { … } }         → 202 งานเบื้องหลัง (แบบเดียวกับ bulk action)
```

```ts
await cms.runAction('bookings', 'confirm', { id: 12 }, { user, input: { note: 'พบกัน 9 โมง' } })
```

ตรวจแบบเดียวกันทุกทาง หน้าเว็บของคุณเอง เช่นปุ่ม **ยกเลิกการจอง** ของลูกค้า จึงเรียก action เดียวกันด้วย session ของลูกค้าได้

## ควรรู้ {#good-to-know}

- action รันใน request เดียวกัน งานที่ใช้เวลานาน (เกินราว 10 วินาที) ควรใส่ใน[งานเบื้องหลัง](./jobs) ให้ `run` เข้าคิวแล้วตอบทันที
- หน้า admin กันการกดซ้ำระหว่างรัน แต่เซิร์ฟเวอร์ไม่ได้กัน action ที่ห้ามรันซ้ำ (เช่น คืนเงิน) ควรจองเอกสารก่อน:
  `cms.update('orders', doc.id, { status: 'refunding' }, { where: { status: { equals: 'paid' } } })` บันทึกเฉพาะเมื่อยังเป็น
  `paid` อยู่ และคืน `null` ให้การกดครั้งที่สอง
- แต่ละครั้งที่รันอยู่ในบันทึกการใช้งานเป็น `action.<name>` พร้อมค่าที่กรอกและผลลัพธ์
- action มีเฉพาะใน collection ส่วน global ยังไม่มี

## ขั้นต่อไป {#next-steps}

- [สิทธิ์การเข้าถึง](./access-control): ใครแก้อะไรได้
- [บทบาทจากหน้า admin](./roles): ให้สิทธิ์ action กับบทบาท
- [งานเบื้องหลัง](./jobs): งานที่ใช้เวลานาน
