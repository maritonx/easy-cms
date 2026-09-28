# CLI {#cli}

::: info หน้านี้สอนอะไร
เครื่องมือ command line สองตัว: `create-easy-cms` สำหรับตั้งค่าโปรเจกต์ และ `easy-cms` สำหรับ migration,
ผู้ใช้, type, การสำรองข้อมูล, งานตั้งเวลา และ standalone server
:::

## create-easy-cms {#create-easy-cms}

```bash
npx create-easy-cms [dir] [--db sqlite|postgres] [--standalone] [--yes] [--skip-install]
```

เพิ่ม Easy CMS ให้โปรเจกต์:

- **ในโปรเจกต์ Nuxt หรือ Next.js** จะติดตั้งแพ็กเกจ เขียน `easy-cms.config.ts` และ `.env` ที่มี
  `EASY_CMS_SECRET` แบบสุ่ม ต่อ module หรือ route handler ให้ และเพิ่มฐานข้อมูลกับไฟล์อัปโหลดลงใน `.gitignore`
- **ในโฟลเดอร์ใหม่หรือโฟลเดอร์ว่าง** (หรือเมื่อใช้ `--standalone`) จะตั้งค่า
  [standalone server](./standalone) สำหรับ frontend ใดก็ได้

| ตัวเลือก | |
|---|---|
| `dir` | ตำแหน่งที่จะตั้งค่า ค่าเริ่มต้นคือโฟลเดอร์ปัจจุบัน |
| `--db` | `sqlite` (ไฟล์) หรือ `postgres` (PGlite ในเครื่อง, server บน production) ถ้าไม่ระบุจะถาม และใช้ `sqlite` เมื่อมี `--yes` |
| `--standalone` | ตั้งค่า standalone server แม้อยู่ในโปรเจกต์ Nuxt หรือ Next.js |
| `--yes` | ใช้ค่าเริ่มต้นโดยไม่ถาม |
| `--skip-install` | เขียนไฟล์อย่างเดียว คุณติดตั้งแพ็กเกจเอง |

ดูขั้นต่อจากนี้ได้ที่ [เริ่มใช้งาน](./getting-started)

## easy-cms {#easy-cms}

ติดตั้งเป็น dev dependency (เป็น dependency ปกติสำหรับ standalone server) ทุกคำสั่งโหลด `.env`
จาก root ของโปรเจกต์และอ่าน `easy-cms.config.ts`

```bash
npx easy-cms <command> [--config <file>] [--cwd <dir>]
```

| คำสั่ง | |
|---|---|
| [`migrate`](#migrate) | รัน migration ที่ยังค้างอยู่ |
| [`migrate:create <name>`](#migrate-create) | เขียน migration สำหรับการเปลี่ยน config |
| [`migrate:status`](#migrate-status) | แสดงรายการ migration และสถานะว่ารันแล้วหรือยัง |
| [`create-admin`](#create-admin) | สร้างผู้ใช้ |
| [`generate:types`](#generate-types) | เขียน type ของ TypeScript สำหรับแอปอื่น |
| [`backup <file>`](#backup) | คัดลอกฐานข้อมูล SQLite ขณะที่ CMS ทำงานอยู่ |
| [`copy --from <config>`](#copy) | คัดลอกเนื้อหาทั้งหมดไปอีกฐานข้อมูล เช่น จาก SQLite ไป Postgres |
| [`run-scheduled`](#run-scheduled) | รันงานตั้งเวลาที่ถึงกำหนดและส่ง webhook ซ้ำหนึ่งรอบ |
| [`serve`](#serve) | รัน CMS เป็น server ของตัวเอง |

ตัวเลือกที่ใช้ได้กับทุกคำสั่ง: `--config <file>` (ค่าเริ่มต้น `easy-cms.config.ts`), `--cwd <dir>`
(root ของโปรเจกต์ ใช้ `.env` ในนั้น) และ `--help` ถ้าล้มเหลวจะจบด้วย exit code ที่ไม่ใช่ 0
จึงใช้ใน CI และสคริปต์ deploy ได้ ตั้ง `DEBUG=1` เพื่อดู stack trace

### migrate {#migrate}

```bash
npx easy-cms migrate
```

รันทุก migration ใน `easy-cms/migrations` ที่ฐานข้อมูลยังไม่ได้รันตามลำดับ แต่ละตัวรันใน transaction
ของตัวเอง ถ้าล้มจะ rollback และหยุด ให้รันทุกครั้งที่ deploy ก่อนเวอร์ชันใหม่เริ่มทำงาน
ดู [Migration และการ deploy](./deployment)

### migrate:create {#migrate-create}

```bash
npx easy-cms migrate:create add-author-bio
```

เทียบ config กับ migration ล่าสุด แล้วเขียน `easy-cms/migrations/<timestamp>_<name>.sql` (และ snapshot `.json`)
เมื่อมีอะไรเปลี่ยน ถ้ารันใน terminal จะถามว่า field ที่หายไปถูกเปลี่ยนชื่อหรือไม่ เพื่อเก็บข้อมูลไว้แทนการลบทิ้ง
ตรวจ SQL แล้ว commit ทั้งสองไฟล์

### migrate:status {#migrate-status}

```bash
npx easy-cms migrate:status
# ✓ applied  20260925091723_init
# • pending  20260928040614_seo
```

### create-admin {#create-admin}

```bash
npx easy-cms create-admin --email ann@example.com --name Ann
npx easy-cms create-admin --email bob@example.com --role editor
```

สร้างผู้ใช้บทบาท `admin` (หรือตาม `--role`) จะถามรหัสผ่านใน terminal ถ้าไม่มี terminal (CI, container)
จะอ่านจาก `EASY_CMS_ADMIN_PASSWORD` ใช้ได้เมื่อสร้าง admin คนแรกใน browser ไม่ได้ หรือเมื่อต้องกู้การเข้าถึง

### generate:types {#generate-types}

```bash
npx easy-cms generate:types --out ../web/src/cms-types.ts
```

เขียน interface หนึ่งตัวต่อ collection และ global (ไฟล์ค่าเริ่มต้น `easy-cms-types.ts`) ไฟล์นี้ไม่มี import
frontend ใน repo อื่นจึงใช้ได้ ส่วนแอปที่ import config ได้ไม่ต้องใช้ เพราะ type [สร้างจาก config](./typescript) อยู่แล้ว

### backup {#backup}

```bash
npx easy-cms backup backups/cms-2026-09-28.db
```

คัดลอกฐานข้อมูล SQLite ไปไฟล์ใหม่ขณะที่ CMS ยังทำงาน เป็น snapshot ที่ข้อมูลตรงกันทั้งไฟล์
ไฟล์ปลายทางต้องยังไม่มีอยู่ ไม่รวมไฟล์อัปโหลด ให้สำรองโฟลเดอร์ uploads หรือ bucket แยก
สำหรับ Postgres ใช้ `pg_dump` ดู [Backup](./backups)

### copy {#copy}

```bash
npx easy-cms copy --from easy-cms.old.config.ts
```

คัดลอกทุกเอกสาร เวอร์ชัน ผู้ใช้ และ global จากฐานข้อมูลของ config ใน `--from` ไปยังฐานข้อมูลของ config
ของโปรเจกต์ เช่น จาก SQLite ไป Postgres (หรือกลับทาง) id ยังเหมือนเดิม relationship ประวัติ และการ login จึงใช้ได้ต่อ

- config ทั้งสองต้องมี collection และ field เหมือนกัน: import config หลักเข้าไปใน config เก่าแล้วเปลี่ยนแค่ `db`
  ถ้า field ต่างกันจะถูกปฏิเสธ
- ฐานข้อมูลปลายทางต้องว่าง ตอนพัฒนาจะสร้างตารางให้ ส่วนบน production ให้รัน `easy-cms migrate` กับปลายทางก่อน
- ไม่คัดลอกไฟล์อัปโหลด ไฟล์ยังอยู่ในโฟลเดอร์ uploads หรือ bucket เดิม
- หยุดเขียนข้อมูลลงต้นทางระหว่างคัดลอก หรือคัดลอกจาก[ไฟล์สำรอง](#backup)

ดู [ย้ายจาก SQLite ไป Postgres](./recipes/sqlite-to-postgres)

### run-scheduled {#run-scheduled}

```bash
npx easy-cms run-scheduled
```

รัน[การเผยแพร่และยกเลิกที่ตั้งเวลาไว้](./drafts#scheduled-publishing)ที่ถึงกำหนด และส่ง
[webhook](./webhooks#delivery) ที่ล้มเหลวซ้ำหนึ่งรอบ server ทำเองทุกนาทีอยู่แล้ว
ใช้คำสั่งนี้จาก cron ในที่ที่ไม่มี process ของ server ทำงานค้างไว้ (serverless)

### serve {#serve}

```bash
npx easy-cms serve --port 4000
npx easy-cms serve --watch          # ตอนพัฒนา: โหลดใหม่เมื่อ config เปลี่ยน
```

รัน Easy CMS โดยไม่ใช้ Nuxt หรือ Next.js: หน้า admin ที่ `/admin`, REST API ที่ `/api/cms`
และ `/healthz` สำหรับ load balancer

| ตัวเลือก | |
|---|---|
| `--port <n>` | port ค่าเริ่มต้นคือ `PORT` แล้วตามด้วย 4000 |
| `--host <host>` | interface ที่รับ request ค่าเริ่มต้นคือ `HOST` แล้วตามด้วยทุก interface |
| `--watch` | โหลดใหม่เมื่อ config หรือไฟล์ที่มัน import เปลี่ยน |
| `--trust-proxy` | เชื่อ `X-Forwarded-For` และ `X-Forwarded-Proto` จาก reverse proxy ของคุณ |

บน production (`NODE_ENV=production`) ถ้ามี migration ค้าง server จะไม่เริ่มทำงาน
ดู [Standalone server](./standalone)

## ขั้นต่อไป {#next-steps}

- [Migration และการ deploy](./deployment): ควรรันคำสั่งไหนเมื่อไหร่
- [Standalone server](./standalone): รัน CMS ให้ frontend ใดก็ได้
