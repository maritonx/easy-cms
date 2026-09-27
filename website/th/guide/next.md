# Next.js {#next-js}

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
- `createRouteHandlers(config, { trustProxy: true })` ใช้ `X-Forwarded-For` สำหรับจำกัดอัตรา
  การเข้าสู่ระบบ ให้เปิดใช้เมื่ออยู่หลัง proxy ที่เชื่อถือได้ เช่น Vercel
- Next.js ตัดเครื่องหมาย slash ท้าย URL ออก หน้า admin จึงอยู่ที่ `/admin` (ไม่ใช่ `/admin/`)

ดู[ตัวอย่าง Next.js](https://github.com/maritonx/easy-crm/tree/main/examples/next-blog)
