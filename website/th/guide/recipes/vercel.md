# Deploy บน Vercel ด้วย Postgres และ R2 {#deploy-on-vercel-with-postgres-and-r2}

::: info สิ่งที่จะได้
เว็บ Next.js ที่มี Easy CMS บน Vercel: เนื้อหาอยู่ใน Postgres ที่ host ไว้ ไฟล์อัปโหลดอยู่ใน Cloudflare R2 และมี cron
สำหรับการเผยแพร่ตามเวลา **ใช้:** [Next.js](../next), [ฐานข้อมูล](../databases), [อัปโหลด](../uploads),
[migration](../deployment)
:::

function แบบ serverless ไม่มีดิสก์ที่อยู่ถาวร SQLite และไฟล์อัปโหลดในเครื่องจึงใช้ไม่ได้ ให้ใช้ Postgres และที่เก็บไฟล์แบบ S3 แทน

## 1. Postgres {#1-postgres}

สร้างฐานข้อมูลบน Postgres แบบ host ไว้ที่ไหนก็ได้ (Neon, Supabase, marketplace ของ Vercel…) แล้วคัดลอก connection string

```bash
npm install @easy-cms/db-postgres
```

```ts [easy-cms.config.ts]
import { postgres } from '@easy-cms/db-postgres'

export default defineConfig({
  // …
  // Vercel: ฐานข้อมูลที่ host ไว้ ส่วนเครื่องคุณ: PGlite (Postgres ในโฟลเดอร์) การพัฒนาและ migration
  // จึงใช้ SQL แบบเดียวกับ production
  db: process.env.DATABASE_URL
    ? postgres({ url: process.env.DATABASE_URL, max: 2 }) // pool เล็กๆ ต่อ function instance
    : postgres({ pglite: '.pglite' }),
})
```

สำหรับ PGlite ตอนพัฒนา: `npm install @electric-sql/pglite` (`create-easy-cms --db postgres` ติดตั้งให้แล้ว)

::: tip Connection pooler
ใช้ connection string แบบต่อตรงของฐานข้อมูล pooler แบบ transaction mode อาจไม่รองรับ prepared statement ที่ driver ใช้
ถ้าจะเปลี่ยนไปใช้ ให้ทดสอบก่อน
:::

## 2. Cloudflare R2 สำหรับไฟล์อัปโหลด {#2-cloudflare-r2-for-uploads}

สร้าง bucket และ API token (Object Read & Write) ใน Cloudflare แล้ว:

```bash
npm install @easy-cms/storage-s3
```

```ts
import { s3Storage } from '@easy-cms/storage-s3'

upload: {
  storage: s3Storage({
    bucket: process.env.R2_BUCKET as string,
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }),
},
```

ไฟล์จะถูกส่งผ่าน CMS API เว้นแต่คุณตั้ง URL สาธารณะของ bucket (`publicUrl`) ดู
[S3, Cloudflare R2 และ MinIO](../uploads#s3-cloudflare-r2-and-minio)

## 3. Migration ทุกครั้งที่ deploy {#3-migrations-on-every-deploy}

สร้าง migration ในเครื่อง (ใช้ PGlite ไม่ต้องมี `DATABASE_URL`) แล้ว commit:

```bash
npx easy-cms migrate:create init
git add easy-cms/migrations
```

แล้วรันก่อน build ทุกครั้งใน `package.json`:

```json
{ "scripts": { "build": "easy-cms migrate && next build" } }
```

Vercel รัน `npm run build` ทุกครั้งที่ deploy ฐานข้อมูลจึงถูก migrate ก่อนที่เวอร์ชันใหม่จะรับ request

## 4. Environment variable {#4-environment-variables}

ใน **Project Settings → Environment Variables**:

| ชื่อ | ค่า |
|---|---|
| `EASY_CMS_SECRET` | ค่าสุ่มใหม่: `openssl rand -hex 32` |
| `DATABASE_URL` | connection string ของ Postgres |
| `R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | จาก Cloudflare |
| `CRON_SECRET` | ค่าสุ่มอีกค่า สำหรับ cron ด้านล่าง |

## 5. Cron สำหรับบทความที่ตั้งเวลาและ webhook ที่ต้องส่งซ้ำ {#5-a-cron-for-scheduled-posts-and-webhook-retries}

บน Vercel ไม่มี process ที่ทำงานค้างไว้ ให้ Vercel Cron เรียก endpoint ของงานแทน Vercel ส่ง
`Authorization: Bearer $CRON_SECRET` ซึ่ง Easy CMS ตรวจให้

```json [vercel.json]
{
  "crons": [{ "path": "/api/cms/jobs/run", "schedule": "*/5 * * * *" }]
}
```

บทความที่ตั้งเวลาไว้จะขึ้นเว็บภายในห้านาทีหลังเวลาที่ตั้ง ตรวจดูว่าแพ็กเกจ Vercel ของคุณให้ cron รันถี่แค่ไหน

## 6. IP ของผู้ใช้สำหรับการจำกัด login {#6-client-ips-for-login-limits}

Vercel ตั้ง `X-Forwarded-For` ให้ ให้เชื่อค่านี้ใน route ของ API:

```ts [app/api/cms/[[...path]]/route.ts]
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config, {
  trustProxy: true,
})
```

## ตรวจสอบ {#check-it}

deploy แล้วเปิด `https://your-site.vercel.app/admin` สร้าง admin คนแรก อัปโหลดรูป (ไฟล์จะไปอยู่ใน bucket)
และเผยแพร่บทความ
