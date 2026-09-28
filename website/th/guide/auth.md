# ผู้ใช้และการยืนยันตัวตน {#users-auth}

::: info หน้านี้สอนอะไร
ใคร login เข้าหน้า admin ได้ บทบาททำงานอย่างไร การสร้างผู้ใช้ และ session กับ token ยืนยันตัวตน request
จาก browser และแอปอื่นอย่างไร

**ควรอ่านก่อน:** [เริ่มใช้งาน](./getting-started)
:::

collection `users` ที่มีในตัวเก็บคนที่ใช้หน้า admin เช่น บรรณาธิการ ผู้เขียน นักพัฒนา แยกจากลูกค้า
หรือสมาชิกของเว็บคุณ ซึ่งควรเก็บใน collection หรือระบบ auth ของคุณเอง

## Collection users {#the-users-collection}

| Field | |
|---|---|
| `email` | ไม่ซ้ำกัน ใช้ login จัดเก็บเป็นตัวพิมพ์เล็ก |
| `name` | แสดงในหน้า admin (ไม่บังคับ) |
| `role` | หนึ่งใน `auth.roles` มีแต่ admin ที่เปลี่ยนได้ |
| `active` | ถ้าเอาเครื่องหมายออก จะ login ไม่ได้และทุก session ของคนนั้นจะหมดอายุ มีแต่ admin ที่เปลี่ยนได้ |
| `password` | เขียนได้อย่างเดียว: รับตอนสร้างและแก้ ไม่ถูกส่งคืน ยาวอย่างน้อย 8 ตัวอักษร |

เพิ่ม field กฎสิทธิ์ หรือ hook ของคุณเองได้โดยประกาศ collection `users` ระบบจะรวมเข้ากับของเดิม:

```ts
collections: [
  {
    slug: 'users',
    fields: [
      { name: 'phone', type: 'text' },
      { name: 'avatar', type: 'upload' },
    ],
  },
]
```

ค่าเริ่มต้น: ผู้ใช้ที่ login อ่านรายชื่อผู้ใช้ได้ admin สร้างและลบผู้ใช้ และผู้ใช้แก้ข้อมูลตัวเองได้
(แต่แก้ `role` หรือ `active` ของตัวเองไม่ได้)

## บทบาท {#roles}

```ts
auth: { roles: ['admin', 'editor', 'author'] } // ค่าเริ่มต้น: ['admin', 'editor']
```

ต้องมี `admin` เสมอ admin ทำได้ทุกอย่างรวมถึงจัดการผู้ใช้ บทบาทอื่นมีความหมายตาม
[กฎสิทธิ์](./access-control) ที่คุณเขียน เช่น:

```ts
{
  slug: 'posts',
  access: {
    read: () => true,
    // author สร้างได้, editor และ admin เผยแพร่ได้ทุกบทความ, author แก้ได้เฉพาะของตัวเอง
    create: ({ user }) => !!user,
    update: ({ user }) =>
      user?.role === 'author' ? { author: { equals: user.id } } : !!user,
    delete: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
  },
}
```

ผู้ใช้ใหม่จะได้บทบาท `editor` ถ้ามีบทบาทนี้ (ไม่อย่างนั้นได้บทบาทสุดท้าย)

Easy CMS ไม่ยอมให้เปลี่ยนแปลงที่ทำให้ไม่เหลือ admin ที่ใช้งานอยู่ (ลบ ลดบทบาท หรือปิดใช้งาน admin คนสุดท้าย)
จึงไม่มีใครถูกล็อกออกจากระบบ

## สร้างผู้ใช้ {#creating-users}

- **admin คนแรก:** ถ้ายังไม่มีผู้ใช้ หน้า admin จะแสดงฟอร์มให้สร้าง ถ้าทำจาก terminal หรือใน CI ให้รัน
  `npx easy-cms create-admin` (ดู [CLI](./cli#create-admin))
- **คนอื่นๆ:** admin เพิ่มผู้ใช้ได้ที่ **ตั้งค่า → ผู้ใช้** ในหน้า admin หรือในโค้ด:

```ts
await cms.create('users', { email: 'ann@example.com', password: 'at least 8 chars', role: 'editor' })
```

รหัสผ่าน hash ด้วย scrypt และไม่ถูกส่งคืน

## Session {#sessions}

การ login จะสร้าง session:

1. `POST /api/cms/users/login` พร้อม `{ email, password }` จะตั้ง session cookie แบบ HttpOnly (ใช้ได้ 7 วัน
   ปรับด้วย `auth.tokenExpiration` เป็นวินาที) และคืน CSRF token
2. browser ส่ง cookie ไปเอง การเขียนข้อมูลต้องส่ง CSRF token ใน header `x-csrf-token` ด้วย
   (ดู [REST API](./rest-api#authentication))
3. `POST /api/cms/users/logout` ปิด session

การ logout การเปลี่ยนรหัสผ่าน หรือการปิดใช้งานผู้ใช้ จะปิดทุก session ของคนนั้น

### Token สำหรับแอปอื่น {#tokens-for-other-apps}

สคริปต์และแอปบน origin อื่นส่ง session token แทน cookie ได้:

```bash
curl -s -X POST https://example.com/api/cms/users/login \
  -H 'content-type: application/json' \
  -d '{"email":"bot@example.com","password":"…"}' -c cookies.txt
# ใช้ค่า ecms-session จาก cookies.txt:
curl https://example.com/api/cms/posts?draft=true -H "Authorization: Bearer $TOKEN"
```

request ที่ใช้ `Authorization: Bearer` ไม่ต้องใช้ CSRF token สำหรับสคริปต์และแอป ควรใช้
[API key](./api-keys) แทน เพราะไม่หมดอายุตาม session และจำกัดสิทธิ์ให้เท่าที่แอปต้องใช้ได้

### จำกัดการ login {#login-limits}

ถ้า login ล้มเหลวครบ `auth.maxLoginAttempts` ครั้ง (5) ภายใน `auth.lockWindow` วินาที (15 นาที) ต่อ email
(และ IP ถ้า adapter รู้) การ login จะตอบ `429` และปลดล็อกเองเมื่อครบเวลา

## ผู้ใช้ในหน้าเว็บ {#the-user-in-your-pages}

```ts
const user = await useEasyCMSUser(event) // Nuxt ใน server route
const user = await getEasyCMSUser(config) // Next.js ใน server component หรือ route
```

ทั้งสองคืนผู้ใช้ของหน้า admin ที่ login อยู่ หรือ `null` ส่งให้ Local API เพื่อใช้สิทธิ์ของคนนั้น
เช่น ให้บรรณาธิการเห็นฉบับร่าง:

```ts
const { docs } = await cms.find('posts', { user, overrideAccess: false, draft: user !== null })
```

## การตั้งค่า {#settings}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `auth.roles` | `['admin', 'editor']` | บทบาทที่ผู้ใช้มีได้ ต้องมี `admin` |
| `auth.tokenExpiration` | 7 วัน | อายุของ session เป็นวินาที |
| `auth.maxLoginAttempts` | `5` | จำนวนครั้งที่ login ผิดได้ภายใน `lockWindow` |
| `auth.lockWindow` | 15 นาที | เป็นวินาที |
| `auth.trustedOrigins` | `[]` | origin อื่นที่ส่ง request ด้วย cookie ได้ |

## ขั้นต่อไป {#next-steps}

- [การควบคุมสิทธิ์](./access-control): แต่ละบทบาทอ่านและแก้อะไรได้
- [ความปลอดภัย](./security): ระบบป้องกันอะไรให้ และเช็กลิสต์ก่อนขึ้นระบบจริง
