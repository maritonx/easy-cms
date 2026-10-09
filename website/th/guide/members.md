# สมาชิกของเว็บ

::: info สิ่งที่จะได้เรียนรู้
วิธีให้คนล็อกอินบนหน้าเว็บแทนระบบจัดการ เช่น ลูกค้า สมาชิกรับข่าว หรือสมาชิกชมรม การสมัครพร้อมยืนยันอีเมล หน้าของเว็บเอง
สำหรับลิงก์ในอีเมล และสิ่งที่สมาชิกเห็นได้

**อ่านก่อนหน้านี้:** [ผู้ใช้และการยืนยันตัวตน](./auth) และ [การควบคุมสิทธิ์](./access-control)
:::

ผู้ใช้ระบบจัดการและสมาชิกของเว็บใช้ collection `users` และการล็อกอินเดียวกัน แต่ทำได้ไม่เท่ากัน **สมาชิก**คือผู้ที่มี role
อยู่ใน `auth.members.roles`:

- เข้าระบบจัดการไม่ได้ ทั้งหน้าและ endpoint ของระบบจัดการปฏิเสธ
- สิทธิ์ที่ค่าเริ่มต้นเป็น "ผู้ที่ล็อกอิน" (`isStaff` ค่าเริ่มต้นของทุก collection) ไม่นับสมาชิก ให้สิทธิ์เฉพาะที่ต้องใช้ เช่น ด้วย
  `isSignedIn`
- เห็นเฉพาะบัญชีตัวเองใน `users` และเปลี่ยน role ตัวเองไม่ได้

```ts
import { isSignedIn } from '@easy-cms/core'

export default defineConfig({
  auth: {
    roles: ['admin', 'editor', 'customer'],
    members: {
      roles: ['customer'],
      signUp: { role: 'customer' },
      pages: { verifyEmail: '/account/verify', resetPassword: '/account/reset' },
    },
  },
  collections: [
    {
      slug: 'wishlists',
      access: {
        read: ({ user }) => (user ? { owner: { equals: user.id } } : false),
        create: isSignedIn,
      },
      fields: [/* … */],
    },
  ],
})
```

[ร้านค้า](./ecommerce) ตั้งค่านี้ให้ลูกค้าเอง

## การสมัคร {#signing-up}

เมื่อตั้ง `signUp` ผู้เยี่ยมชมสร้างบัญชีเองได้ด้วย `role` ที่กำหนด:

```ts
// token ของฟอร์ม ตอนแสดงฟอร์ม: ยืนยันว่าไม่ใช่บอตที่กรอกทันที
const { token } = await fetch('/api/cms/auth/signup').then((r) => r.json())

await fetch('/api/cms/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name, token, website: '' }),
})
// 202 { verify: true }: ส่งลิงก์ยืนยันอีเมลแล้ว
```

1. บัญชีใหม่ล็อกอินไม่ได้จนกว่าจะยืนยันอีเมล (`signUp.verifyEmail` ค่าเริ่มต้น `true`) คำตอบเหมือนกันไม่ว่าอีเมลนั้นมีบัญชี
   หรือไม่ จึงไม่มีใครรู้ว่าใครสมัครไว้
2. ลิงก์ในอีเมลเปิด `pages.verifyEmail` บนเว็บพร้อม `?token=` หน้านั้นส่ง token ไปที่ `POST /api/cms/auth/verify-email`
   (`{ token }`) เพื่อยืนยันอีเมลและเข้าสู่ระบบ
3. ถ้าไม่เปิด `verifyEmail` การสมัครจะเข้าสู่ระบบทันที (`201` พร้อม session)

การกันสแปมเหมือนของ[ฟอร์ม](./forms): token (ส่งเร็วเกินไปหรือเกินหนึ่งวันจะถูกปฏิเสธ) ช่องซ่อนที่บอตชอบกรอก (`website`)
จำกัดการสมัครต่อ IP และ Cloudflare Turnstile เมื่อตั้ง `signUp.turnstile: { siteKey, secretKey }` คำตอบของการขอ token
บอก `turnstile` ด้วย (site key หรือ `null`)

การสมัครต้องตั้งค่า[อีเมล](./email) และใน production ต้องมี URL ของเว็บสำหรับลิงก์: `admin.siteURL` แบบ URL เต็ม หรือ `serverURL`

## ลิงก์ในอีเมล {#email-links}

ลิงก์ "ลืมรหัสผ่าน" ของสมาชิกเปิด `pages.resetPassword` บนเว็บ ซึ่งส่ง token และรหัสผ่านใหม่ไปที่
`POST /api/cms/auth/reset-password` หน้าเหล่านี้เป็น path (บน `admin.siteURL` หรือ `serverURL`) หรือ URL เต็มก็ได้ ถ้าไม่ตั้ง
ลิงก์จะเปิดหน้าของระบบจัดการ

`emails.verifyEmail` เปลี่ยนข้อความอีเมลยืนยันได้ เหมือน `auth.emails`

## การล็อกอินบนหน้าเว็บ {#signing-in-on-the-site}

สมาชิกล็อกอินแบบเดียวกับ admin: `POST /api/cms/auth/login` ตั้ง session cookie (ส่ง `x-csrf-token` จาก
`GET /api/cms/auth/me` มากับการเขียน) หรือใช้ token กับ `Authorization: Bearer` ผู้ใช้ของ session มี `member: true` ในโค้ดฝั่ง
server ใช้ `cms.forRequest(request)` เพื่อรู้ว่าเป็นใคร

เมื่อใช้ [plugin multi-tenant](./multi-tenant) สมาชิกไม่ได้สังกัด tenant: ใช้เว็บของ request (โดเมนหรือ header) บัญชีเดียวจึงใช้ได้
กับเว็บของทุก tenant

## ขั้นต่อไป {#next-steps}

- [ร้านค้า](./ecommerce): ลูกค้า ตะกร้า และคำสั่งซื้อ
- [การควบคุมสิทธิ์](./access-control): กฎสำหรับเอกสารของสมาชิกเอง
