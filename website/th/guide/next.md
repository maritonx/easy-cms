# Next.js {#next-js}

::: info หน้านี้สอนอะไร
route handler ของ Next.js ติดตั้งหน้า admin และ API อย่างไร และดึงเนื้อหาใน server component อย่างไร

**ควรอ่านก่อน:** [เริ่มใช้งาน](./getting-started)
:::

`@easy-cms/next` รองรับ App Router ใน Next.js 15 ขึ้นไป

## การตั้งค่า {#setup}

`npx create-easy-cms` ทำขั้นตอนเหล่านี้ให้คุณ

**1. ครอบ `next.config.ts`** เพื่อให้ server build เก็บไฟล์ของหน้า admin, migration และไดรเวอร์
ฐานข้อมูลไว้ (โดยตั้งค่า `serverExternalPackages` และ `outputFileTracingIncludes`):

```ts
import type { NextConfig } from 'next'
import { withEasyCMS } from '@easy-cms/next/config'

const nextConfig: NextConfig = {}
export default withEasyCMS(nextConfig)
```

**2. เพิ่ม route handler** path ของ handler ต้องตรงกับ `routes.api` และ `admin.path`:

```ts
// app/api/cms/[[...path]]/route.ts
import { createRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config)
```

```ts
// app/admin/[[...path]]/route.ts
import { createAdminRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'
export const { GET, HEAD } = createAdminRouteHandlers(config)
```

`createRouteHandlers(config, options)` รับตัวเลือกเหล่านี้ (`RouteHandlerOptions` ซึ่งเหมือน `ApiHandlerOptions`
ทั้งสองถูก export):

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `basePath` | `routes.api` | ตำแหน่งที่ API อยู่ |
| `getClientIp` | — | `(request) => string \| undefined`: IP ของ client สำหรับจำกัดอัตราการเข้าสู่ระบบและ audit log ใช้ก่อน `trustProxy` |
| `trustProxy` | `false` | ใช้ที่อยู่ตัวสุดท้ายใน `X-Forwarded-For` (ดูด้านล่าง) และเชื่อ `X-Forwarded-Host` ในการตรวจ origin ของ CSRF บน Vercel และ Netlify ไม่ต้องตั้ง |

## การอ่านเนื้อหา {#reading-content}

```tsx
import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: slug } },
    overrideAccess: false,
    user,
    draft: user !== null,
    limit: 1,
  })
  // …
}
```

`getEasyCMS(config)` คืน instance เดียวต่อ server ซึ่งคงอยู่แม้มีการ hot reload ใช้ได้
ใน Server Components, Route Handlers และ Server Actions

## สิ่งที่ควรรู้ {#things-to-know}

- **ทำให้หน้าที่ดึงข้อมูลจาก CMS เป็นแบบ dynamic** (`export const dynamic = 'force-dynamic'`) หรือใช้
  revalidation มิฉะนั้น `next build` จะ prerender หน้าเหล่านั้นและ query ฐานข้อมูลตอน build
- การจำกัดอัตราการเข้าสู่ระบบต้องรู้ IP ของ client บน Vercel และ Netlify หาได้เอง หลัง proxy อื่นที่เพิ่มที่อยู่ลงใน
  `X-Forwarded-For` ให้ใช้ `createRouteHandlers(config, { trustProxy: true })` ระบบจะใช้ที่อยู่ตัวสุดท้าย (ตัวที่ proxy ของคุณเพิ่ม)
- Next.js ตัดเครื่องหมาย slash ท้าย URL ออก หน้า admin จึงอยู่ที่ `/admin` (ไม่ใช่ `/admin/`)
- ระหว่าง `next dev` การแก้ field หรือตัวเลือกจะโหลด CMS ใหม่ให้เอง แต่ถ้าแก้แค่โค้ดของ hook กฎสิทธิ์ หรือฟังก์ชันอื่นใน
  config ให้รีสตาร์ต dev server

ดู[ตัวอย่าง Next.js](https://github.com/maritonx/easy-cms/tree/main/examples/next-blog)

## ขั้นต่อไป {#next-steps}

- [Local API](./local-api): อ่านและเขียนเนื้อหาในโค้ดฝั่ง server
- [ตัวอย่างสด (live preview)](./live-preview): แสดงการแก้ที่ยังไม่บันทึกบนหน้าเว็บ
