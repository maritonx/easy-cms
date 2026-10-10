# การควบคุมสิทธิ์ {#access-control}

::: info หน้านี้สอนอะไร
กำหนดว่าใครอ่าน สร้าง แก้ และลบได้ ทั้งระดับ collection ระดับเอกสาร และระดับ field

**ควรอ่านก่อน:** [การตั้งค่า](./configuration), [ผู้ใช้และการยืนยันตัวตน](./auth)
:::

กฎสิทธิ์คือฟังก์ชันใน config ซึ่งตัดสินว่า REST API (และหน้า admin ด้วย)
อนุญาตให้ผู้ใช้แต่ละคนทำอะไรได้บ้าง Local API เชื่อถือผู้เรียกและข้ามกฎเหล่านี้ เว้นแต่คุณจะร้องขอ

```ts
import { anyone, isAdmin, isStaff } from '@easy-cms/core'

{
  slug: 'posts',
  access: {
    read: anyone,
    create: isStaff,
    update: ({ user }) => user?.role === 'admin' || { author: { equals: user?.id } },
    delete: isAdmin,
  },
  fields: [/* … */],
}
```

## กฎ {#rules}

collection มี `read`, `create`, `update`, `delete` ส่วน global มี `read` และ `update`
แต่ละกฎรับ `{ user, id?, data? }` (`user` เป็น `null` เมื่อยังไม่ได้เข้าสู่ระบบ) และคืนค่า:

- `true` / `false` หรือ
- **where query**: อนุญาตการดำเนินการเฉพาะเอกสารที่ตรงเงื่อนไขเท่านั้น สำหรับ `read` จะใช้กรอง
  ผลลัพธ์ สำหรับ `update`/`delete` เอกสารต้องตรงเงื่อนไข ส่วน `create` ต้องคืนค่า boolean

การแก้ไขหรือลบเอกสารที่ผู้ใช้ไม่มีสิทธิ์แม้แต่อ่านจะตอบ `404` เหมือน id ที่ไม่มีอยู่ id จึงไม่บอกว่ามีเอกสารอะไรบ้าง
ส่วนเอกสารที่อ่านได้แต่แก้ไม่ได้จะตอบ `403`

**หากไม่ได้กำหนดกฎ จะอนุญาตเฉพาะผู้ใช้ที่เข้าสู่ระบบแล้วเท่านั้น** เนื้อหาสาธารณะต้องตั้งให้เป็นสาธารณะ
อย่างตั้งใจ เช่น `read: () => true`

ตัวช่วย: `anyone`, `isStaff`, `isAdmin` และ `isSignedIn` โดย `isStaff` หมายถึงผู้ใช้ระบบจัดการ
[สมาชิกของเว็บ](./members) เช่น ลูกค้า ไม่นับ ส่วน `isSignedIn` นับด้วย `isAdmin` หมายถึง admin ของทั้งเว็บ
เมื่อใช้ [plugin multi-tenant](./multi-tenant) admin ของ tenant ไม่นับ

### รูปแบบที่ใช้บ่อย {#common-patterns}

```ts
// Visitors see published posts; editors see everything.
read: ({ user }) => (user ? true : { status: { equals: 'published' } }),

// Authors edit their own posts.
update: ({ user }) => (user?.role === 'admin' ? true : user ? { author: { equals: user.id } } : false),
```

## สิทธิ์ระดับ field {#field-access}

```ts
{ name: 'internalNotes', type: 'text', access: { read: ({ user }) => user !== null } }
{ name: 'featured', type: 'boolean', access: { update: ({ user }) => user?.role === 'admin' } }
```

field ที่อ่านไม่ได้จะถูกตัดออกจาก response (และจากหน้า admin) และใช้กรองหรือเรียงไม่ได้ (`403`) ส่วน field
ที่อัปเดตไม่ได้จะถูกละเว้นใน input (และแสดงเป็นแบบอ่านอย่างเดียวในหน้า admin)

`create` กำหนดว่าใครตั้งค่า field ได้ตอนสร้างเอกสาร ถ้าไม่ใส่ `update` จะใช้กับทั้งสองกรณี ตัวอย่างนี้ให้ทุกคนกรอกได้ครั้งแรก
แต่หลังจากนั้นเฉพาะ admin ที่แก้ได้:

```ts
{
  name: 'referrer',
  type: 'text',
  access: { create: () => true, update: ({ user }) => user?.role === 'admin' },
}
```

## เอกสารที่ถูก populate {#populated-documents}

เมื่อ response มีเอกสารที่เกี่ยวข้อง กฎ `read` ของ collection ที่เกี่ยวข้องจะมีผลด้วย:
เอกสารที่ผู้ใช้อ่านไม่ได้จะไม่ถูก populate

## ใน Local API {#in-the-local-api}

```ts
const user = await useEasyCMSUser(event) // or getEasyCMSUser(config) in Next.js
await cms.find('posts', { overrideAccess: false, user })
```

หากไม่ระบุ `overrideAccess: false` Local API จะทำได้ทุกอย่าง จึงมีไว้สำหรับโค้ดฝั่ง server ที่เชื่อถือได้

## Collection users ในตัว {#built-in-users-collection}

ผู้ใช้ที่เข้าสู่ระบบแล้วอ่านข้อมูล users ได้ admin สร้างและลบผู้ใช้ได้ ผู้ใช้อัปเดตข้อมูลของตัวเองได้แต่แก้
`role` หรือ `active` ของตัวเองไม่ได้ admin ที่ active คนสุดท้ายไม่สามารถถูกลดสิทธิ์ ปิดการใช้งาน หรือลบได้

## ขั้นต่อไป {#next-steps}

- [บทบาทและสิทธิ์จากหน้า admin](./roles): ให้ admin ติ๊กเลือกสิทธิ์ของแต่ละบทบาทได้โดยไม่ต้องเขียนโค้ด
- [Hooks](./hooks): รันโค้ดเมื่อเนื้อหาเปลี่ยน
- [ความปลอดภัย](./security): สิ่งที่ระบบป้องกันให้เพิ่มเติม
