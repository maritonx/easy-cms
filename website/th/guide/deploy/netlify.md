# Deploy บน Netlify {#deploy-on-netlify}

::: info หน้านี้สอนอะไร
เว็บ Next.js หรือ Nuxt พร้อม Easy CMS บน Netlify: เนื้อหาอยู่ใน Postgres ไฟล์อัปโหลดอยู่ใน Netlify Blobs
รัน migration ทุกครั้งที่ deploy และมี scheduled function สำหรับการเผยแพร่ตามเวลา

**ควรอ่านก่อน:** [เลือกที่ deploy](./), [Next.js](../next) หรือ [Nuxt](../nuxt)
:::

Netlify build ทั้ง Next.js (ผ่าน adapter OpenNext ของ Netlify) และ Nuxt ได้โดยไม่ต้องตั้งค่าเพิ่ม และรันโค้ดฝั่ง server
เป็น function ไม่มี disk ที่เก็บได้ถาวรและไม่มี process ที่รันค้างไว้ ถ้าอยากเริ่มจากเว็บสำเร็จรูป ใช้
[Deploy ด้วยคลิกเดียว](../one-click-deploy)

## 1. ฐานข้อมูล {#1-a-database}

- **Netlify Database** (Postgres): ติดตั้ง `@netlify/database` แล้ว Netlify จะสร้างฐานข้อมูลตอน deploy ครั้งแรก
  และตั้ง `NETLIFY_DB_URL` ให้ ต้องใช้แพ็กเกจ Netlify แบบ credit-based
- **Postgres แบบ hosted อื่นๆ** (Neon, Supabase…): ตั้ง `DATABASE_URL`

```bash [pm]
npm install @easy-cms/db-postgres @electric-sql/pglite
```

```ts
import { postgres } from '@easy-cms/db-postgres'

const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL

// บน Netlify ใช้ฐานข้อมูลแบบ hosted บนเครื่องคุณใช้ PGlite ในโฟลเดอร์
db: url ? postgres({ url, max: 2 }) : postgres({ pglite: '.pglite' }),
```

ใช้ Turso ก็ได้ผ่าน `@easy-cms/db-sqlite` ดู [Vercel](./vercel)

## 2. ไฟล์อัปโหลดใน Netlify Blobs {#2-uploads-in-netlify-blobs}

Netlify Blobs ไม่ต้องตั้งค่าอะไร store จะถูกสร้างตอนใช้ครั้งแรก

```bash [pm]
npm install @easy-cms/storage-netlify-blobs
```

```ts
import { netlifyBlobsStorage } from '@easy-cms/storage-netlify-blobs'

// บน Netlify ใช้ Blobs บนเครื่องคุณใช้โฟลเดอร์ uploads
upload: process.env.NETLIFY ? { storage: netlifyBlobsStorage() } : {},
```

ไฟล์ถูกเสิร์ฟผ่าน API ของ CMS Netlify จำกัดขนาด request ของ function ไว้ที่ 6 MB (ประมาณ 4.5 MB สำหรับไฟล์ binary)
ไฟล์ที่ใหญ่กว่านั้นต้องใช้ [S3 storage](../uploads#s3-cloudflare-r2-and-minio) ซึ่งรับไฟล์ตรงจากเบราว์เซอร์

## 3. Migration ทุกครั้งที่ deploy {#3-migrations-on-every-deploy}

สร้าง migration บนเครื่องกับฐานข้อมูลใหม่ (PGlite หรือไม่ตั้ง `DATABASE_URL`) แล้ว commit

```bash [pm]
npx easy-cms migrate:create init
git add easy-cms/migrations
```

จากนั้นให้ migrate ในคำสั่ง build

```toml [netlify.toml]
[build]
  command = "npx easy-cms migrate && npm run build"
```

## 4. Environment variable {#4-environment-variables}

ใน **Site configuration → Environment variables**:

| ชื่อ | ค่า |
|---|---|
| `EASY_CMS_SECRET` | `openssl rand -hex 32` |
| `EASY_CMS_SETUP_CODE` | ข้อความที่คุณเลือก ตั้งไว้จนกว่าจะมี admin คนแรก |
| `DATABASE_URL` | URL ของ Postgres (ไม่ต้องตั้งถ้าใช้ Netlify Database) |
| `CRON_SECRET` | ค่าสุ่มอีกตัว สำหรับ scheduled function ด้านล่าง |

แก้ตัวแปรแล้วต้องสั่ง deploy ใหม่ deploy ที่รันอยู่ยังใช้ค่าเดิม

## 5. งานตามเวลา {#5-scheduled-jobs}

scheduled function เรียก endpoint ของงานทุกห้านาที scheduled function ใช้ได้ทุกแพ็กเกจ รันได้นานสุด 30 วินาที
และรันเฉพาะ deploy ที่ publish แล้ว (ไม่รันใน preview)

```bash [pm]
npm install -D @netlify/functions
```

```ts [netlify/functions/easy-cms-jobs.mts]
import type { Config } from '@netlify/functions'

// รันงานของ Easy CMS ที่ถึงเวลา: เผยแพร่ตามเวลา ส่ง webhook ซ้ำ ส่งอีเมลที่รอคิว และสำรองข้อมูล
export default async () => {
  const res = await fetch(`${process.env.URL}/api/cms/jobs/run`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  if (!res.ok) console.error(`Easy CMS jobs: ${res.status} ${await res.text()}`)
}

export const config: Config = { schedule: '*/5 * * * *' }
```

`URL` คือที่อยู่หลักของเว็บ ซึ่ง Netlify ตั้งให้ function

## 6. IP ของผู้เข้าชม {#6-visitors-ip-addresses}

Netlify ตั้ง `X-Forwarded-For` ให้ ให้เชื่อ header นี้เพื่อให้การจำกัดการ login แยกตามผู้เข้าชม:

::: code-group

```ts [Next.js: app/api/cms/[[...path]]/route.ts]
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config, {
  trustProxy: true,
})
```

```ts [Nuxt: nuxt.config.ts]
easyCms: { trustProxy: true },
```

:::

## ตรวจสอบ {#check-it}

Deploy แล้วเปิด `/admin` สร้าง admin คนแรกด้วยรหัส setup อัปโหลดรูป แล้วเผยแพร่บทความ จากนั้นตั้ง `serverURL`
เป็นที่อยู่ของเว็บ

## ถ้ามีบางอย่างไม่ทำงาน {#if-something-doesnt-work}

- **เว็บล้มพร้อม "No database"**: ไม่ได้ตั้งทั้ง `DATABASE_URL` และ `NETLIFY_DB_URL` Netlify Database ต้องติดตั้ง
  `@netlify/database` และใช้แพ็กเกจแบบ credit-based ถ้าไม่ใช้ ให้ตั้ง `DATABASE_URL`
- **"CSRF check failed: untrusted origin" ตอนสร้าง admin คนแรก**: อัปเดต Easy CMS เป็น 0.37.2 ขึ้นไป
  ซึ่งยอมรับ host สาธารณะที่ proxy ของ Netlify ส่งต่อมา
- **บทความที่ตั้งเวลาไว้ไม่ถูกเผยแพร่**: ดู log ของ function ที่ **Logs → Functions** และเช็คว่า `CRON_SECRET`
  ใน environment ของ function ตรงกัน

## ขั้นต่อไป {#next-steps}

- [Deploy ด้วยคลิกเดียว](../one-click-deploy): การตั้งค่าแบบเดียวกันที่ทำให้อัตโนมัติ
- [สำรองข้อมูล](../backups): คัดลอกฐานข้อมูลไปไว้ที่อื่นเป็นประจำ
