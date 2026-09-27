# การควบคุมสิทธิ์ {#access-control}

กฎสิทธิ์คือฟังก์ชันใน config ซึ่งตัดสินว่า REST API (และหน้า admin ด้วย)
อนุญาตให้ผู้ใช้แต่ละคนทำอะไรได้บ้าง Local API เชื่อถือผู้เรียกและข้ามกฎเหล่านี้ เว้นแต่คุณจะร้องขอ

```ts
import { anyone, isAdmin, isLoggedIn } from '@easy-cms/core'

{
  slug: 'posts',
  access: {
    read: anyone,
    create: isLoggedIn,
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

**หากไม่ได้กำหนดกฎ จะอนุญาตเฉพาะผู้ใช้ที่เข้าสู่ระบบแล้วเท่านั้น** เนื้อหาสาธารณะต้องตั้งให้เป็นสาธารณะ
อย่างตั้งใจ เช่น `read: () => true`

ตัวช่วย: `anyone`, `isLoggedIn`, `isAdmin`

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

field ที่อ่านไม่ได้จะถูกตัดออกจาก response ส่วน field ที่อัปเดตไม่ได้จะถูกละเว้นใน
input (และแสดงเป็นแบบอ่านอย่างเดียวในหน้า admin)

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
