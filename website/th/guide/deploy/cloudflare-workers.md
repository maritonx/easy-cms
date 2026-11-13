# Deploy บน Cloudflare Workers {#deploy-on-cloudflare-workers}

::: info หน้านี้จะได้อะไร
standalone server (หน้า admin และ REST API) เป็น Cloudflare Worker: เนื้อหาอยู่ใน Turso ไฟล์อัปโหลดอยู่ใน R2
ไฟล์ของหน้า admin มาจาก Workers Assets และ Cron Triggers รันงานตามเวลา

**ควรอ่านก่อน:** [เลือกที่ deploy](./), [Standalone server](../standalone)
:::

Worker ไม่มี disk และไม่มี process ที่รันค้างไว้ ฐานข้อมูลจึงต่อผ่าน HTTP (Turso) ไฟล์อัปโหลดไปอยู่ใน bucket (R2) และ
Cloudflare เรียก Worker ทุกนาทีเพื่อรันงานตามเวลา `easy-cms build --target workers` เขียน Worker ให้ แล้ว Wrangler
deploy

หน้านี้ใช้กับ [standalone server](../standalone) เท่านั้น Easy CMS ที่อยู่ในแอป Next.js หรือ Nuxt ยังต้องใช้ Node.js

## สิ่งที่ต้องมี {#what-you-need}

- โปรเจกต์ standalone: `npm create easy-cms my-cms` ในโฟลเดอร์ใหม่
- **Workers Paid** การตรวจรหัสผ่านตอนเข้าสู่ระบบใช้ CPU ราว 100 ms เกิน 10 ms ต่อ request ของ plan ฟรี
- ฐานข้อมูล [Turso](https://turso.tech) และ bucket ของ R2 พร้อม API token (R2 → Manage API tokens →
  *Object Read & Write* สำหรับ bucket นั้น)

## 1. ฐานข้อมูล: Turso {#1-the-database-turso}

ใน `easy-cms.config.ts` เพิ่ม token:

```ts
db: sqlite({
  url: process.env.DATABASE_URL ?? 'file:./cms.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
}),
```

`DATABASE_URL` คือ URL `libsql://` ของฐานข้อมูล บนเครื่องของคุณ ถ้าไม่ตั้งไว้ก็ใช้ไฟล์ SQLite เหมือนเดิม

## 2. ไฟล์อัปโหลด: R2 {#2-uploads-r2}

```bash [pm]
npm install @easy-cms/storage-s3
```

```ts
import { s3Storage } from '@easy-cms/storage-s3'

upload: {
  storage: s3Storage({
    bucket: 'my-site-media',
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }),
},
```

Worker อ่านตัวแปรเหล่านี้ตอนเริ่มทำงาน หน้า admin ส่งไฟล์ที่ใหญ่กว่า 4 MB จากเบราว์เซอร์ตรงไปที่ bucket จึงต้องตั้ง CORS
ให้ origin ของเว็บ ดู[ไฟล์ขนาดใหญ่](../uploads#large-files)

## 3. Build Worker {#3-build-the-worker}

```bash [pm]
npm install -D wrangler
npx easy-cms build --target workers
```

จะได้:

- `.easy-cms/workers/`: entry ของ Worker และไฟล์ของหน้า admin เขียนใหม่ทุกครั้งที่ build ให้เพิ่ม `.easy-cms/` ใน
  `.gitignore`
- `wrangler.jsonc` ครั้งแรกเท่านั้น: `nodejs_compat`, binding `ASSETS` สำหรับหน้า admin, Cron Triggers ทุกนาที,
  `NODE_ENV=production` และ alias ของแพ็กเกจที่รันบน Workers ไม่ได้ (`sharp`) ตรวจ `name` ให้ถูก หลังจากนั้นไฟล์นี้เป็น
  ของคุณ การ build จะไม่เขียนทับ

build ใหม่ทุกครั้งที่แก้ `easy-cms.config.ts` หรืออัปเดต Easy CMS เพราะ Worker รวม config ไว้ในตัว

## 4. Migration {#4-migrations}

สร้าง migration กับฐานข้อมูลใหม่แล้ว commit เหมือนโฮสต์อื่น ([Migration และการ deploy](../deployment)):

```bash [pm]
npx easy-cms migrate:create init
```

แล้ว apply กับ Turso จากเครื่องของคุณหรือ CI ก่อน deploy ทุกครั้ง:

```bash
DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npx easy-cms migrate
```

Worker อ่านไฟล์ migration ไม่ได้ มันจะเริ่มทำงานเมื่อ migration ล่าสุดของฐานข้อมูลตรงกับ config ของมัน ถ้าไม่ตรงจะตอบ
500 พร้อมข้อความ "The config changed since the database's last migration"

## 5. Secret {#5-secrets}

```bash
npx wrangler secret put EASY_CMS_SECRET
```

| ชื่อ | ค่า |
|---|---|
| `EASY_CMS_SECRET` | `openssl rand -hex 32` |
| `EASY_CMS_SETUP_CODE` | วลีที่คุณตั้งเอง ใช้จนกว่าจะมี admin คนแรก |
| `DATABASE_URL` | URL `libsql://` ของ Turso |
| `DATABASE_AUTH_TOKEN` | token ของ Turso |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | จาก API token ของ R2 |

## 6. Deploy {#6-deploy}

```bash
npx wrangler deploy
```

เปิด `/admin` ที่ address ของ Worker สร้าง admin คนแรกด้วย setup code อัปโหลดรูป (ไฟล์จะไปอยู่ใน R2) และเผยแพร่โพสต์
แล้วตั้ง `serverURL` เป็น address นั้น

## งานตามเวลา {#scheduled-jobs}

Cron Trigger ใน `wrangler.jsonc` รัน[งานเบื้องหลัง](../jobs)ทุกนาที: โพสต์ที่ตั้งเวลาไว้ ส่ง webhook ซ้ำ และอีเมลที่รอส่ง
ไม่ต้องใช้ `CRON_SECRET`

## ลองบนเครื่องของคุณ {#try-it-on-your-machine}

```bash
npx wrangler dev
```

รัน Worker ใน workerd ซึ่งเป็น runtime ของ Cloudflare โดยใช้ตัวแปรจาก `.env` เพิ่ม `--test-scheduled` แล้วเปิด
`/__scheduled` เพื่อรันงานตามเวลา

## สิ่งที่ต่างไปบน Workers {#what-is-different-on-workers}

- **ไม่ย่อรูป**: `sharp` ต้องใช้ Node.js `upload.imageSizes` จึงไม่สร้างรูปย่อ แต่รูปยังได้ความกว้างและความสูง
- **อีเมล**: SMTP ต้องใช้ Node.js ให้ใช้ Resend, Postmark หรือ Brevo จาก
  [`@easy-cms/plugin-email`](../email#providers) ซึ่งส่งผ่าน HTTP
- **IP ของผู้เข้าชม** อ่านจาก `CF-Connecting-IP` เอง ไม่ต้องตั้งอะไร
- แต่ละ request อาจไปถึง Worker คนละตัว เหมือน[หลาย instance](./production) session, การจำกัดการเข้าสู่ระบบ และงาน
  เบื้องหลังเก็บอยู่ในฐานข้อมูล

## CI ตรวจอะไร {#what-ci-checks}

ทุก pull request สร้างโปรเจกต์ด้วย `npm create easy-cms` เพิ่ม `@easy-cms/storage-s3` และ Wrangler, migrate,
build Worker แล้วรันด้วย `wrangler dev` กับ `sqld` (ตัวเดียวกับที่ Turso ใช้) และ S3 server จากนั้นเข้าสู่ระบบ อัปโหลดรูป
สร้าง แก้ อ่าน ลบโพสต์ โหลดหน้า admin และรัน Cron Trigger ส่วนการ deploy ขึ้น Cloudflare จริงไม่ได้อยู่ในนี้

## ถ้ามีปัญหา {#if-something-doesnt-work}

- **build บอกว่า config ต้องมี `upload.storage`**: Worker ไม่มี disk ตั้งตามขั้นที่ 2
- **500 พร้อม "The config changed since the database's last migration"** หรือ "No migrations found": รัน
  `easy-cms migrate` กับฐานข้อมูล Turso แล้ว deploy ใหม่
- **เข้าสู่ระบบไม่ได้ ขึ้น error 1102 (Worker exceeded resource limits)**: บัญชียังใช้ plan ฟรี การเข้าสู่ระบบต้องใช้
  Workers Paid

## ขั้นต่อไป {#next-steps}

- [สถาปัตยกรรมสำหรับ production](./production): สิ่งที่ CMS หลายตัวใช้ร่วมกัน
- [ความปลอดภัย](../security): checklist ก่อนเปิดใช้งานจริง
