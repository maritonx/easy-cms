# Framework อื่นๆ {#other-frameworks}

::: info หน้านี้สอนอะไร
ใช้ Easy CMS ใน framework ที่ยังไม่มีแพ็กเกจของตัวเอง เช่น Astro, SvelteKit, React Router, Hono หรือ server
ใดก็ได้ที่รับ Web `Request`

**ควรอ่านก่อน:** [เริ่มต้นใช้งาน](./getting-started)
:::

Easy CMS มีแพ็กเกจสำหรับ [Nuxt](./nuxt) และ [Next.js](./next) และมี [standalone server](./standalone) ของตัวเอง
ภายในนั้น API และหน้า admin เป็น handler แบบ `(Request) => Response` ธรรมดา framework ใดที่ให้ Web `Request`
มาก็ต่อได้ แพ็กเกจของ Nuxt และ Next.js ก็สร้างจากสามชิ้นนี้:

| | จาก | ทำอะไร |
|---|---|---|
| `sharedEasyCMS(config)` | `@easy-cms/core` | instance เดียวต่อ server คงอยู่ข้าม hot reload และสร้างใหม่เมื่อ config เปลี่ยน |
| `createApiHandler(config, options?)` | `@easy-cms/core` | REST API บน instance นั้น |
| `adminHandlerFor(resolvedConfig, overrides?)` | `@easy-cms/admin` | หน้า admin ตาม path ภาษา และแบรนด์ใน config |

และ `cms.auth.userFromHeaders(headers)` ให้ผู้ใช้ที่ล็อกอินของ request (cookie session หรือ Bearer token) เช่น ใช้แสดง
ฉบับร่างให้ผู้แก้เนื้อหา

## ต่อ API และหน้า admin {#mount-the-api-and-the-admin}

ติดตั้ง core, adapter ของฐานข้อมูล และ admin:

```sh
npm install @easy-cms/core @easy-cms/db-sqlite @easy-cms/admin
```

แล้วในโมดูลเดียวที่ route ต่างๆ import:

```ts
// cms.ts
import { adminHandlerFor } from '@easy-cms/admin'
import { createApiHandler, resolveConfig, sharedEasyCMS } from '@easy-cms/core'
import config from './easy-cms.config'

/** Local API ที่มี type จาก config สำหรับหน้าเว็บ */
export const getCMS = () => sharedEasyCMS(config)

/** `/api/cms/*` ทุก method */
export const api = createApiHandler(config, {
  // อยู่หลัง proxy ที่เชื่อถือได้ (Vercel, Netlify, load balancer): ใช้ IP จริงของผู้ใช้สำหรับจำกัดการ login
  trustProxy: true,
})

/** `/admin/*` เฉพาะ GET และ HEAD */
export const admin = async (request: Request) =>
  adminHandlerFor(await resolveConfig(config), { siteUrl: '/' })(request)
```

ส่งทุก request ใต้ `routes.api` (ค่าเริ่มต้น `/api/cms`) ไปที่ `api` และใต้ `admin.path` (ค่าเริ่มต้น `/admin`) ไปที่ `admin`
เช่น ใน server ที่รับ `fetch` handler:

```ts
import { admin, api } from './cms'

export default {
  fetch(request: Request) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/cms')) return api(request)
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return admin(request)
    return new Response('Not found', { status: 404 })
  },
}
```

ใน framework ที่ใช้ route ตามไฟล์ ให้ export handler จาก route แบบ catch-all ของแต่ละ path ตาม HTTP method ที่ framework นั้นต้องให้ระบุ

## อ่านเนื้อหาในหน้าเว็บ {#read-content-in-your-pages}

```ts
import { getCMS } from './cms'

const cms = await getCMS()
const { docs } = await cms.find('posts', { where: { status: { equals: 'published' } } })
// ผู้แก้เนื้อหาเห็นฉบับร่าง:
const user = await cms.auth.userFromHeaders(request.headers)
```

## ควรรู้ {#good-to-know}

- **ฝั่ง server เท่านั้น** Easy CMS ทำงานบน Node.js 22.12 ขึ้นไป ไม่รองรับ edge runtime
- **ไฟล์ของหน้า admin** อ่านจาก `@easy-cms/admin` บนดิสก์ ถ้า framework bundle โค้ดฝั่ง server ให้ตั้ง `@easy-cms/admin`
  (และ driver ของฐานข้อมูล) เป็น external เพื่อให้ไฟล์อยู่ที่เดิม หรือส่ง `appDir` ให้ `adminHandlerFor`
- **เครื่องหมาย / ท้าย URL:** หน้า admin redirect `/admin` ไปที่ `/admin/` ถ้า framework ตัด / ท้าย URL ออก ให้ส่ง
  `trailingSlashRedirect: false` เพื่อไม่ให้วนซ้ำ
- **Hot reload** ใช้ instance เดิมตราบใดที่ config เหมือนเดิม ถ้าแก้แค่โค้ดของ hook ต้อง restart
- **Migration** เหมือนทุกที่: [การ deploy](./deployment#production-migrations)

แพ็กเกจของ Easy CMS ใช้ชิ้นส่วนเหล่านี้ แต่ที่ทดสอบครบทุกขั้นมีแค่ Nuxt, Next.js และ standalone server ถ้าคุณใช้กับ
framework อื่น เล่าให้เราฟังได้ว่าเป็นอย่างไร

## ขั้นต่อไป {#next-steps}

- [Local API](./local-api): อ่านและเขียนเนื้อหาในหน้าเว็บ
- [REST API](./rest-api): สำหรับโค้ดใน browser
