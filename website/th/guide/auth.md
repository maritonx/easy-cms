# ผู้ใช้และการยืนยันตัวตน {#users-auth}

collection `users` ที่มีมาในตัวเก็บข้อมูลคนที่ใช้หน้า admin ซึ่งแยกจากผู้ใช้
ของเว็บไซต์คุณ

field: `email` (ไม่ซ้ำกัน), `name`, `role`, `active` เพิ่ม field ของคุณเองได้โดยประกาศ collection
`users`:

```ts
collections: [{ slug: 'users', fields: [{ name: 'phone', type: 'text' }] }]
```

## Role {#roles}

```ts
auth: { roles: ['admin', 'editor', 'author'] } // default: ['admin', 'editor']
```

ต้องมี `admin` อยู่ในรายการ ใช้ `user.role` ใน [กฎการควบคุมสิทธิ์](./access-control)

## การสร้างผู้ใช้ {#creating-users}

- admin คนแรก: หน้า admin จะขอให้สร้างเมื่อยังไม่มีผู้ใช้ หรือรัน
  `npx easy-cms create-admin`
- หลังจากนั้น admin สร้างผู้ใช้ได้ในหน้า admin หรือในโค้ด:

```ts
await cms.create('users', { email: 'ann@example.com', password: 'at least 8 chars', role: 'editor' })
```

รหัสผ่านถูก hash ด้วย scrypt และไม่ถูกส่งกลับมาเด็ดขาด

## Session {#sessions}

- `POST /api/cms/users/login` ตั้ง session cookie แบบ HttpOnly (ค่าเริ่มต้น 7 วัน
  กำหนดด้วย `auth.tokenExpiration` เป็นวินาที) และส่ง CSRF token กลับมา
- เบราว์เซอร์ส่ง cookie ไปเอง ส่วนการเขียนข้อมูลต้องส่ง token ใน `x-csrf-token` ด้วย
  (ดู [REST API](./rest-api#authentication))
- client อื่นสามารถส่ง `Authorization: Bearer <token>` แทนได้
- การออกจากระบบ การเปลี่ยนรหัสผ่าน หรือการปิดใช้งานผู้ใช้ จะยุติ session ทั้งหมดของผู้ใช้นั้น

หากเข้าสู่ระบบล้มเหลวครบ `auth.maxLoginAttempts` ครั้ง (5) ภายใน `auth.lockWindow` วินาที (15 นาที) สำหรับ
อีเมลหนึ่ง (และ IP เมื่อ adapter รู้ค่า) การเข้าสู่ระบบจะตอบกลับ `429`

## ในหน้าเว็บของคุณ {#in-your-pages}

```ts
const user = await useEasyCMSUser(event) // Nuxt
const user = await getEasyCMSUser(config) // Next.js
```

ทั้งสองฟังก์ชันคืนค่าผู้ใช้ admin ที่เข้าสู่ระบบอยู่หรือ `null` เช่น ใช้เพื่อแสดงตัวอย่างฉบับร่าง (draft) ให้ผู้แก้ไขเนื้อหาดู
