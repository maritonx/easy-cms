# Redirects {#redirects}

::: info หน้านี้สอนอะไร
ส่งผู้เข้าชม (และเครื่องมือค้นหา) จากที่อยู่เก่าไปที่อยู่ใหม่: redirect ที่ผู้แก้เนื้อหาจัดการเองในหน้า admin และ redirect
อัตโนมัติเมื่อที่อยู่ของหน้าเปลี่ยน

**ควรอ่านก่อน:** [Plugins](./plugins)
:::

<Screenshot name="redirects" alt="รายการ redirect ใต้ตั้งค่า เปิดแก้หนึ่งรายการในแผงด้านข้าง" />

เมื่อหน้าย้ายที่ ที่อยู่เก่าควรตอบ **301** ไปยังที่อยู่ใหม่ ผู้เข้าชมและลิงก์เก่ายังใช้ได้ และเครื่องมือค้นหาจะย้ายอันดับของหน้าไปที่อยู่ใหม่
แทนที่จะตัดหน้าทิ้ง `@easy-cms/plugin-redirects` เพิ่มรายการ **Redirects** ใต้ **ตั้งค่า** ในหน้า admin และสร้าง redirect
ให้เองเมื่อ slug ของบทความที่เผยแพร่แล้วเปลี่ยน

```bash
npm install @easy-cms/plugin-redirects
```

```ts
import { redirectsPlugin } from '@easy-cms/plugin-redirects'

// ฟังก์ชันเดียวสำหรับที่อยู่ของบทความ ใช้ร่วมกับ generateURL ของ plugin SEO
const postURL = (doc) => (doc.slug ? `/posts/${doc.slug}` : null)

export default defineConfig({
  // …
  plugins: [
    redirectsPlugin({
      collections: ['posts'], // redirect ชี้ไปที่บทความได้ และตามบทความไปเมื่อย้าย
      url: ({ doc }) => postURL(doc),
    }),
  ],
})
```

plugin เพิ่ม collection `redirects` ให้สร้าง migration ด้วย (`easy-cms migrate:create redirects` ดู[Migration](./deployment))

## ในหน้า admin {#in-the-admin}

redirect แต่ละรายการมี:

- **จาก**: path เก่า เช่น `/old-page` ไม่สนใจ query string และ `/` ท้าย
- **ไปที่ (ที่อยู่)**: path ในเว็บหรือ URL เต็ม **หรือ** เอกสารจาก `collections` redirect ที่ชี้ไปเอกสารจะไปที่อยู่ปัจจุบันของเอกสารเสมอ
  แม้เอกสารจะย้ายอีก
- **ชนิด**: `301` (ย้ายถาวร ค่าเริ่มต้น), `302` หรือ `307` (ชั่วคราว), `308` (ถาวร และคง method เดิม)

redirect เปิดแก้ใน drawer เหนือรายการเหมือน collection เล็กอื่นๆ ถ้าใช้[plugin MCP](./mcp) ผู้ช่วย AI ก็จัดการได้เมื่อ API key อนุญาต

## เมื่อที่อยู่เปลี่ยน {#when-an-address-changes}

เมื่อตั้ง `collections` และ `url` แล้ว เอกสารที่เผยแพร่อยู่และที่อยู่เปลี่ยน จะได้ redirect จากที่อยู่เก่าไปยังเอกสารนั้นในทุกภาษา:

- เฉพาะหน้าที่ออนไลน์อยู่: การบันทึกฉบับร่าง หรือเปลี่ยนชื่อหน้าที่ยังไม่เคยเผยแพร่ ไม่สร้าง redirect
- ไม่ต่อกันเป็นทอด: redirect ชี้ไปที่เอกสาร เปลี่ยนชื่อครั้งที่สองแล้ว ที่อยู่เก่าทั้งสองจะไปที่อยู่ล่าสุดโดยตรง
- ไม่วนกลับ: ถ้าเปลี่ยนกลับไปใช้ที่อยู่เก่า redirect จากที่อยู่นั้นจะถูกลบ

ปิดได้ด้วย `autoRedirect: false` หรือระบุเป็นรายชื่อ collection

## เสิร์ฟ redirect {#serve-them}

`resolveRedirect(cms, url)` คืน `{ location, status }` ของ path นั้น หรือ `null` redirect ถูกอ่านครั้งเดียวแล้วเก็บในหน่วยความจำ
เรียกทุก request ได้โดยไม่เปลือง การแก้ไขมีผลทันทีบน server ที่แก้ ส่วน server อื่น (instance ของ serverless) จะตามทันภายใน `cacheTTL`
(ค่าเริ่มต้น 60 วินาที) และ query string ของผู้เข้าชมจะถูกส่งต่อไปด้วย

::: code-group

```ts [Nuxt: server/middleware/redirects.ts]
import { resolveRedirect } from '@easy-cms/plugin-redirects'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (/^\/(_nuxt|api|admin)(\/|$)/.test(url.pathname)) return
  const redirect = await resolveRedirect(await useEasyCMS(), url)
  if (redirect) return sendRedirect(event, redirect.location, redirect.status)
})
```

```ts [Next.js 16: proxy.ts]
import { getEasyCMS } from '@easy-cms/next'
import { resolveRedirect } from '@easy-cms/plugin-redirects'
import { type NextRequest, NextResponse } from 'next/server'
import cmsConfig from './easy-cms.config'

// proxy (ชื่อเดิมคือ middleware) ทำงานบน Node.js จึงใช้ Local API ได้
export async function proxy(request: NextRequest) {
  const redirect = await resolveRedirect(await getEasyCMS(cmsConfig), request.nextUrl)
  if (redirect)
    return NextResponse.redirect(new URL(redirect.location, request.url), redirect.status)
}

export const config = { matcher: ['/((?!api/|admin|_next/|favicon.ico).*)'] }
```

```ts [frontend อื่น]
// GET <routes.api>/resolve-redirect?path=/old-page
// 200 { "location": "/new-page", "status": 301 } หรือ 404
const response = await fetch(`${CMS}/api/cms/resolve-redirect?path=${encodeURIComponent(path)}`)
if (response.ok) {
  const { location, status } = await response.json()
  // ส่ง redirect ด้วย framework หรือ host ของคุณ
}
```

:::

บน Next.js 15 middleware ทำงานบน Edge runtime เป็นค่าเริ่มต้น ซึ่ง Local API ใช้ไม่ได้ ให้ตั้ง
`export const config = { runtime: 'nodejs', matcher: [...] }` (Next.js 15.5 ขึ้นไป) หรือหา path ในหน้า `not-found`
แล้วเรียก `permanentRedirect()`

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `collections` | `[]` | collection ที่ redirect ชี้ไปได้ และหน้าใน collection นั้นได้ redirect อัตโนมัติ |
| `url` | — | `({ collection, doc, locale }) => ที่อยู่`: ที่อยู่ของเอกสาร ต้องตั้งเมื่อมี `collections` |
| `autoRedirect` | `true` | สร้าง redirect เมื่อที่อยู่ของหน้าที่เผยแพร่อยู่เปลี่ยน `false` หรือระบุรายชื่อ collection |
| `slug` | `'redirects'` | slug ของ collection redirect |
| `cacheTTL` | `60000` | เวลาที่ server อื่นเก็บ redirect ไว้ในหน่วยความจำ (ms) |

## ขั้นต่อไป {#next-steps}

- [SEO](./seo): sitemap ใช้ที่อยู่ใหม่ของหน้า
- [การตั้งค่า](./configuration): ย้าย collection ของคุณเองไปไว้ใต้ตั้งค่าด้วย `admin: { group: 'settings' }`
