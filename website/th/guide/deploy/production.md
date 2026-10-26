# สถาปัตยกรรมสำหรับ production {#reference-architecture}

::: info หน้านี้สอนอะไร
setup ที่ Easy CMS ทดสอบและรองรับเมื่อ server เดียวไม่พอ: หลาย instance บน Postgres และ storage แบบ S3
แต่ละส่วนต้องการอะไร instance ใช้อะไรร่วมกัน และอะไรที่ไม่รองรับ

**ควรอ่านก่อน:** [เลือก host](./), [Migration และการ deploy](../deployment)
:::

server เดียวที่ใช้ SQLite และเก็บไฟล์บนดิสก์ของตัวเองพอสำหรับเว็บส่วนใหญ่ และยังรองรับเต็มที่ ถ้าต้องการมากกว่าหนึ่ง
instance ไม่ว่าเพราะ traffic เพราะอยาก deploy โดยไม่มี downtime หรือเพราะแพลตฟอร์มรันหลายตัวให้เอง ให้ใช้ setup นี้
CI รันแบบนี้ทุกครั้งที่มีการเปลี่ยนแปลง

```txt
                 visitors, editors
                        │
              CDN (public pages, media)
                        │
                  load balancer            no sticky sessions
            ┌───────────┼───────────┐
        instance    instance    instance   stateless: Next.js, Nuxt or easy-cms serve
            └───────────┼───────────┘
            ┌───────────┴───────────┐
   PgBouncer (optional)       S3-compatible storage
            │                  (S3, R2, MinIO, RustFS)
        Postgres
```

## ส่วนประกอบ {#the-parts}

| ส่วน | ต้องการ | รายละเอียด |
|---|---|---|
| **Postgres** | ฐานข้อมูลเดียวสำหรับทุก instance CI ทดสอบกับ Postgres 17 เวอร์ชันอื่นที่ Postgres ยังซัพพอร์ตน่าจะใช้ได้แต่ไม่ได้ทดสอบ | [ฐานข้อมูล](../databases#postgres) |
| **Pooler** (ไม่บังคับ) | PgBouncer แบบ transaction mode หรือ pooler ของผู้ให้บริการ PgBouncer 1.24 ขึ้นไปเก็บ prepared statement ได้ ถ้าเป็นตัวอื่นให้ตั้ง `prepare: false` | [Connection](../databases#connections) |
| **Storage** | S3 หรือบริการที่ใช้ API แบบ S3 สำหรับไฟล์ upload ที่ทุก instance ใช้ร่วมกัน บน Vercel และ Netlify ใช้ Vercel Blob และ Netlify Blobs ได้ | [ไฟล์ upload](../uploads#s3-cloudflare-r2-and-minio) |
| **Instance** | กี่ตัวก็ได้ เหมือนกันทุกตัว: config, เวอร์ชัน และ `EASY_CMS_SECRET` เดียวกัน ไม่ต้องใช้ sticky session เปิด `trustProxy` เมื่ออยู่หลัง load balancer | [Health check](../deployment#health-checks) |
| **Load balancer** | ส่ง traffic ไปเฉพาะ instance ที่ `<api>/readyz` ตอบ `200` และส่ง `X-Forwarded-For` (และ `X-Request-Id` ถ้าสร้างเอง) ต่อให้ | [Log](../deployment#logs) |
| **CDN** | cache หน้าสาธารณะและไฟล์ media ไว้หน้าเว็บ ตอนนี้ API ตอบ `no-store` จึงต้อง cache ที่ frontend แล้ว revalidate จาก [webhook](../webhooks) | [Performance](../databases#performance) |

ขนาด pool รวมกัน: จำนวน instance × `max` ควรไม่เกิน 10–20% ของ `max_connections` ของ Postgres ถ้ามีหลาย instance
หรือใช้ serverless function ให้ใส่ pooler ไว้ข้างหน้า

## สิ่งที่ instance ใช้ร่วมกัน {#what-the-instances-share}

ทุกอย่างที่สำคัญอยู่ในฐานข้อมูลหรือ storage instance ไหนก็ตอบ request ไหนก็ได้:

- session และ CSRF token, rate limit ของการ login, API key
- คิวของการเผยแพร่ตามกำหนดเวลา, job, webhook และอีเมล และ audit log
- ข้อมูลที่ส่งผ่านฟอร์มและ rate limit ของฟอร์ม (plugin form builder)
- ไฟล์ upload ใน storage

มีสองอย่างที่เก็บในหน่วยความจำของแต่ละ instance:

- **บทบาท** (ตั้งค่า → บทบาท) เก็บไว้นานสุด 30 วินาที การแก้บน instance หนึ่งจะไปถึงตัวอื่นภายในเวลานั้น
- **อีเมลทดสอบ** จาก ตั้งค่า → อีเมล จำกัดจำนวนแยกต่อ instance

## งานเบื้องหลัง {#background-work}

ทุก instance รัน scheduler ทุกนาที และ cron ที่เรียก `<api>/jobs/run` ก็รันได้ด้วย การเผยแพร่ตามกำหนดเวลา, job,
webhook และอีเมลแต่ละรายการถูกจองในฐานข้อมูลก่อน จึงรันครั้งเดียวไม่ว่าจะมีกี่ instance พยายามรัน งานของ instance ที่ตาย
จะกลับเข้าคิวเมื่อการจองหมดเวลา ควรเขียน job ของคุณให้รันซ้ำได้โดยไม่เสียหาย

migrate ครั้งเดียวต่อ release ก่อนเริ่ม instance ใหม่ เช่น ขั้น release, job ใน CI หรือ init container ที่รัน
`easy-cms migrate` บน production instance จะไม่ยอมเริ่มถ้ายังมี migration ค้าง และ `/readyz` จะกัน load balancer
ไว้จนกว่าจะ migrate เสร็จ ถ้าใช้[image อย่างเป็นทางการ](./docker#the-official-image) ให้เริ่ม instance ด้วย
`EASY_CMS_MIGRATE=false`

## ใช้ได้แค่ instance เดียว {#single-instance-only}

ของเหล่านี้เก็บข้อมูลไว้บนเครื่องเดียว จึงต้องรัน instance เดียวเท่านั้น:

- **SQLite** (ไฟล์บนเครื่อง): เขียนได้ทีละตัวบนดิสก์เดียว ฐานข้อมูล Turso ใช้ร่วมกันได้ แต่ setup นี้ทดสอบบน Postgres
- **PGlite**: สำหรับช่วงพัฒนาและเทส
- **ไฟล์ upload บนดิสก์** (`upload.dir`): instance อื่นมองไม่เห็นไฟล์

ถ้าจะย้ายเว็บจาก SQLite ไป Postgres ดู [`easy-cms copy`](../cli) ส่วนไฟล์ upload ที่อยู่บนดิสก์ให้คัดลอกโฟลเดอร์ขึ้น bucket

## ไม่รองรับ {#not-supported}

- หลาย region และ read replica
- ฐานข้อมูลอื่นนอกจาก Postgres และ SQLite
- ใช้ connection pool หรือ transaction ร่วมกับแอปของคุณ ([แยกฐานข้อมูลจากแอป](../database-isolation))
- Edge runtime (Cloudflare Workers, Vercel Edge Functions)

## สิ่งที่ CI ตรวจ {#what-ci-checks}

| ตรวจ | Job |
|---|---|
| `easy-cms serve` สอง instance บน Postgres และ bucket เดียวกัน หลัง proxy แบบ round-robin: REST, session และ CSRF, การจำกัด login, ไฟล์ upload, job รันครั้งเดียว | `multi-instance` |
| integration suite ผ่าน PgBouncer แบบ transaction mode ด้วย role ที่มี schema ของตัวเอง | `pgbouncer` |
| integration suite บน Postgres 17 | `postgres` |
| Docker image อย่างเป็นทางการ build และเริ่มได้ | `docker` |

## ขั้นต่อไป {#next-steps}

- [แยกฐานข้อมูลจากแอป](../database-isolation): schema, ฐานข้อมูล หรือ server ของ CMS เอง
- [Docker](./docker): image อย่างเป็นทางการ
- [Backup](../backups): สำรองฐานข้อมูลและ bucket
