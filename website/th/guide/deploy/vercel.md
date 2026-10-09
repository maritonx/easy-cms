# Deploy บน Vercel {#deploy-on-vercel}

::: info หน้านี้สอนอะไร
เว็บ Next.js หรือ Nuxt พร้อม Easy CMS บน Vercel: เนื้อหาอยู่ในฐานข้อมูลแบบ hosted ไฟล์อัปโหลดอยู่ใน Vercel Blob
รัน migration ทุกครั้งที่ deploy และมี cron สำหรับการเผยแพร่ตามเวลา

**ควรอ่านก่อน:** [เลือกที่ deploy](./), [Next.js](../next) หรือ [Nuxt](../nuxt)
:::

Vercel รันแอปเป็น serverless function ไม่มี disk ที่อยู่รอดข้าม request และไม่มี process ที่รันค้างไว้ ฐานข้อมูลและ
ไฟล์อัปโหลดจึงต้องอยู่ที่อื่น และใช้ cron รันงานตามเวลา ถ้าอยากเริ่มจากเว็บสำเร็จรูป ใช้
[Deploy ด้วยคลิกเดียว](../one-click-deploy)

## 1. ฐานข้อมูล {#1-a-database}

เลือกหนึ่งอย่าง แล้วเชื่อมใน **Storage** (หรือคัดลอก URL ไปใส่ใน environment variable):

- **Postgres** (Neon จากแท็บ Storage ของ Vercel, Supabase หรือ Postgres แบบ hosted อื่นๆ): จะตั้ง `DATABASE_URL` ให้
- **Turso** (SQLite แบบ hosted): ได้ URL แบบ `libsql://` และ token

::: code-group

```ts [Postgres]
import { postgres } from '@easy-cms/db-postgres'

// บน Vercel ใช้ฐานข้อมูลแบบ hosted บนเครื่องคุณใช้ PGlite (Postgres ในโฟลเดอร์) เพื่อให้ตอนพัฒนา
// และ migration ใช้ SQL เดียวกับ production
db: process.env.DATABASE_URL
  ? postgres({ url: process.env.DATABASE_URL, max: 2 }) // pool เล็กๆ ต่อ function instance
  : postgres({ pglite: '.pglite' }),
```

```ts [Turso]
import { sqlite } from '@easy-cms/db-sqlite'

// บน Vercel ใช้ Turso บนเครื่องคุณใช้ไฟล์ SQLite
db: sqlite({
  url: process.env.DATABASE_URL ?? 'file:./cms.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
}),
```

:::

```bash [pm]
npm install @easy-cms/db-postgres @electric-sql/pglite
```

ใช้ connection string แบบเชื่อมตรงของฐานข้อมูล pooler แบบ transaction mode อาจไม่รองรับ prepared statement
ที่ driver ของ Postgres ใช้ ถ้าใช้ Turso ให้ `npm install @easy-cms/db-sqlite`

## 2. ไฟล์อัปโหลดใน Vercel Blob {#2-uploads-in-vercel-blob}

ใน **Storage** สร้าง store แบบ **Blob** (public) แล้วเชื่อมกับโปรเจกต์ จะตั้ง `BLOB_READ_WRITE_TOKEN` ให้

```bash [pm]
npm install @easy-cms/storage-vercel-blob
```

```ts
import { vercelBlobStorage } from '@easy-cms/storage-vercel-blob'

// บน Vercel ใช้ Blob บนเครื่องคุณใช้โฟลเดอร์ uploads
upload: process.env.VERCEL ? { storage: vercelBlobStorage() } : {},
```

Vercel จำกัดขนาด request ไว้ที่ 4.5 MB เมื่อใช้ Blob หน้า admin จะส่งไฟล์ที่ใหญ่กว่านั้นจากเบราว์เซอร์ตรงไปที่ store
ใช้ Cloudflare R2 หรือ S3 อื่นก็ได้: [S3, Cloudflare R2 และ MinIO](../uploads#s3-cloudflare-r2-and-minio)

## 3. Migration ทุกครั้งที่ deploy {#3-migrations-on-every-deploy}

สร้าง migration บนเครื่องแล้ว commit ฐานข้อมูลที่ใช้ตอนพัฒนาถูกสร้างด้วย development push ซึ่งรับ migration ไม่ได้
จึงต้องสร้าง migration กับฐานข้อมูลใหม่ (PGlite หรือไม่ตั้ง `DATABASE_URL`)

```bash [pm]
npx easy-cms migrate:create init
git add easy-cms/migrations
```

จากนั้นให้ migrate ก่อน build ทุกครั้ง ฐานข้อมูลจะพร้อมก่อนเวอร์ชันใหม่เริ่มรับ request

```json [vercel.json]
{ "buildCommand": "npx easy-cms migrate && npm run build" }
```

หรือใส่ไว้ใน script `build`: `"build": "easy-cms migrate && next build"`

## 4. Environment variable {#4-environment-variables}

ใน **Settings → Environment Variables** สำหรับ Production (และ Preview ถ้าใช้):

| ชื่อ | ค่า |
|---|---|
| `EASY_CMS_SECRET` | `openssl rand -hex 32` |
| `EASY_CMS_SETUP_CODE` | ข้อความที่คุณเลือก ตั้งไว้จนกว่าจะมี admin คนแรก |
| `DATABASE_URL` | integration ใน Storage ตั้งให้ หรือ URL ของฐานข้อมูล |
| `DATABASE_AUTH_TOKEN` | เฉพาะ Turso |
| `BLOB_READ_WRITE_TOKEN` | Blob store ตั้งให้ |
| `CRON_SECRET` | ค่าสุ่มอีกตัว สำหรับ cron ด้านล่าง |

ตัวแปรใหม่มีผลกับ deployment ใหม่เท่านั้น แก้แล้วต้อง redeploy

## 5. งานตามเวลา {#5-scheduled-jobs}

บน Vercel ไม่มีอะไรรันค้างไว้ จึงให้ cron เรียก endpoint ของงาน Vercel ส่ง `Authorization: Bearer $CRON_SECRET`
ซึ่ง Easy CMS ตรวจให้

```json [vercel.json]
{
  "crons": [{ "path": "/api/cms/jobs/run", "schedule": "*/5 * * * *" }]
}
```

::: warning แพ็กเกจ Hobby: วันละครั้ง
บนแพ็กเกจ Hobby cron รันได้มากที่สุดวันละครั้ง และ schedule ที่ถี่กว่านั้นจะทำให้ deploy ไม่ผ่าน แพ็กเกจ Pro รันได้ทุกนาที
บน Hobby ให้ใช้ `"0 3 * * *"` แล้วเรียก endpoint ให้ถี่ขึ้นจากที่อื่น เช่น GitHub Actions แบบ schedule:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-site.com/api/cms/jobs/run
```

:::

ถ้าไม่มี cron บทความที่ตั้งเวลาไว้จะไม่ถูกเผยแพร่ webhook ที่ล้มเหลวจะไม่ถูกส่งซ้ำ และอีเมลจะค้างในคิว หน้า dashboard
จะเตือนเมื่อการเผยแพร่ตามเวลาล่าช้า

## 6. IP ของผู้เข้าชม {#6-visitors-ip-addresses}

Vercel ตั้ง `X-Forwarded-For` ให้ ให้เชื่อ header นี้เพื่อให้การจำกัดการ login แยกตามผู้เข้าชม:

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

## 7. วาง function ไว้ใกล้ฐานข้อมูล {#7-put-the-functions-near-the-database}

ทุกหน้าอ่านฐานข้อมูล จึงควรรัน function ใน region เดียวกับฐานข้อมูล (Settings → Functions หรือใน `vercel.json`)
เช่น Tokyo สำหรับฐานข้อมูลใน `ap-northeast-1`:

```json [vercel.json]
{ "regions": ["hnd1"] }
```

## ตรวจสอบ {#check-it}

Deploy แล้วเปิด `/admin` สร้าง admin คนแรกด้วยรหัส setup อัปโหลดรูป (จะไปอยู่ใน Blob store) แล้วเผยแพร่บทความ
จากนั้นตั้ง `serverURL` เป็นที่อยู่ของเว็บ

## ถ้ามีบางอย่างไม่ทำงาน {#if-something-doesnt-work}

- **Build หยุดที่ `easy-cms migrate` พร้อม HTTP 401** (Turso): token ผิด เป็นแบบอ่านอย่างเดียว หรือไม่ได้ตั้งไว้ใน
  environment นี้ สร้าง token แบบ full access แล้ว redeploy
- **อัปโหลดไม่ได้ และมีข้อความให้ connect Blob store**: deployment นั้นไม่มี `BLOB_READ_WRITE_TOKEN` เชื่อม store
  กับโปรเจกต์แล้ว redeploy
- **`/admin` ตอบ 500 พร้อม "Cannot find module '@easy-cms/next/package.json'"**: อัปเดต `@easy-cms/next`
  เป็น 0.22.2 ขึ้นไป
- **อัปโหลดแล้วได้ 413**: ไฟล์ใหญ่เกิน 4.5 MB และวิ่งผ่าน function ให้ใช้ Blob หรือ S3 ซึ่งรับไฟล์ใหญ่ตรงจากเบราว์เซอร์

## ขั้นต่อไป {#next-steps}

- [Deploy ด้วยคลิกเดียว](../one-click-deploy): การตั้งค่าแบบเดียวกันที่ทำให้อัตโนมัติ
- [สำรองข้อมูล](../backups): คัดลอกฐานข้อมูลไปไว้ที่อื่นเป็นประจำ
