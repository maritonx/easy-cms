# Nuxt {#nuxt}

`@easy-cms/nuxt` คือ module สำหรับ Nuxt 4

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@easy-cms/nuxt'],
  easyCms: {
    // configPath: 'easy-cms.config.ts',
    // trustProxy: false,
  },
})
```

เมื่อมี `easy-cms.config.ts` อยู่ที่ root ของโปรเจกต์ module นี้จะ:

- ให้บริการ REST API ที่ `routes.api` (ค่าเริ่มต้น `/api/cms`) และหน้า admin ที่ `admin.path` (`/admin`)
- auto-import server utility สองตัวที่มี type ตาม config ของคุณ:

```ts
// server/api/posts/[slug].get.ts
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  const user = await useEasyCMSUser(event) // the logged-in Easy CMS user, or null
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: getRouterParam(event, 'slug') } },
    // Let access rules decide, and show drafts to logged-in editors.
    overrideAccess: false,
    user,
    draft: user !== null,
    limit: 1,
  })
  return docs[0] ?? null
})
```

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `configPath` | `easy-cms.config.ts` | path ไปยัง config ของ Easy CMS |
| `trustProxy` | `false` | ใช้ `X-Forwarded-For` เป็น IP ของ client สำหรับจำกัดอัตราการเข้าสู่ระบบ ใช้เฉพาะเมื่ออยู่หลัง proxy ที่คุณควบคุมเท่านั้น |

## หมายเหตุ {#notes}

- module จะเชื่อมต่อตอน server เริ่มทำงาน: ปัญหาของ schema (migration ที่ค้างอยู่) จะแสดงใน log
  ทันที
- ไฟล์ static ของหน้า admin เป็น public asset ของ Nitro ดังนั้นบนแพลตฟอร์มที่มี CDN ไฟล์เหล่านี้จะถูกเสิร์ฟ
  จาก CDN
- **production server ของ Nuxt ไม่อ่าน `.env`** ให้ตั้งค่า `EASY_CMS_SECRET` บนโฮสต์ หรือเริ่ม server
  ด้วย `node --env-file=.env .output/server/index.mjs` ดู
  [Environment variables](./deployment#environment-variables)
- build สำหรับ production จะรวมไฟล์ native ของไดรเวอร์ฐานข้อมูล (libSQL) ไปด้วย ให้ build บน OS
  และสถาปัตยกรรมเดียวกับที่ deploy และเริ่ม server จาก root ของโปรเจกต์

ดู[ตัวอย่าง Nuxt](https://github.com/maritonx/easy-crm/tree/main/examples/nuxt-blog)
