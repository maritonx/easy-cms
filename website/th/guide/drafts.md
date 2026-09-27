# ฉบับร่าง {#drafts}

```ts
{ slug: 'posts', drafts: true, fields: [/* … */] }
```

collection (หรือ global) ที่มี `drafts: true` จะได้ `status` เป็น `draft` หรือ `published` เอกสาร
ใหม่เริ่มต้นเป็นฉบับร่าง (draft)

- **ฉบับร่างไม่จำเป็นต้องครบถ้วน:** จะไม่บังคับ `required` ขณะที่ `status` เป็น `draft` แต่ยังคง
  ตรวจสอบ type
- **การเผยแพร่จะตรวจสอบทุกอย่าง**
- **การอ่านจะคืนเฉพาะเอกสารที่เผยแพร่แล้ว** เว้นแต่จะส่ง `draft: true`: ได้แก่ `find`, `findById`,
  `count`, relationship ที่ถูก populate และ REST API ผ่าน REST นั้น `?draft=true` ใช้ได้เฉพาะ
  ผู้ใช้ที่เข้าสู่ระบบแล้ว

```ts
await cms.find('posts') // published only
await cms.find('posts', { draft: true }) // everything
await cms.update('posts', id, { status: 'published' }) // publish
await cms.update('posts', id, { status: 'draft' }) // unpublish
```

ในหน้า admin ฉบับร่างจะมีปุ่ม **Save draft** และ **Publish** ส่วนเอกสารที่เผยแพร่แล้วจะมี **Save** (ยังคง
เผยแพร่อยู่) และ **Unpublish**

::: warning ยังไม่มีสำเนาฉบับร่างแยกใน v0.1
เอกสารหนึ่งรายการมีเพียงเวอร์ชันเดียว การบันทึกเอกสารที่เผยแพร่แล้วเป็นฉบับร่างจะยกเลิกการเผยแพร่เอกสารนั้น การเก็บการแก้ไข
เป็นฉบับร่างแยกไว้หลังเวอร์ชันที่เผยแพร่ต้องใช้ประวัติเวอร์ชัน ซึ่งวางแผนไว้สำหรับ v2
:::
