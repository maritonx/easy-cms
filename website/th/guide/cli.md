# CLI {#cli}

::: info หน้านี้สอนอะไร
เครื่องมือ command line สองตัว: `create-easy-cms` สำหรับตั้งค่าโปรเจกต์ และ `easy-cms` สำหรับ migration,
ผู้ใช้, type, การสำรองข้อมูล, งานตั้งเวลา และ standalone server
:::

## create-easy-cms {#create-easy-cms}

```bash [pm]
npx create-easy-cms [dir] [--db sqlite|postgres] [--pm npm|pnpm|yarn|bun] [--standalone] [--yes] [--skip-install] [--from <link>]
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
| `--pm` | `npm`, `pnpm`, `yarn` หรือ `bun` ค่าเริ่มต้นคือตัวที่โปรเจกต์ใช้ (ช่อง `packageManager` แล้วตามด้วย lockfile) ไม่อย่างนั้นใช้ตัวที่คุณใช้เรียกคำสั่งนี้ |
| `--standalone` | ตั้งค่า standalone server แม้อยู่ในโปรเจกต์ Nuxt หรือ Next.js |
| `--yes` | ใช้ค่าเริ่มต้นโดยไม่ถาม |
| `--skip-install` | เขียนไฟล์อย่างเดียว คุณติดตั้งแพ็กเกจเอง |
| `--from` | ลิงก์จาก [Studio](./studio): เขียน `easy-cms.config.ts` จากลิงก์ (ถ้ามีไฟล์อยู่แล้วจะเขียนไว้ข้างกันเป็น `easy-cms.config.studio.ts`) ใช้ฐานข้อมูลตาม adapter ใน config และติดตั้งทุกแพ็กเกจ `@easy-cms` ที่ config import โดยติดตั้งอย่างน้อยเวอร์ชันที่ลิงก์ทำไว้ถ้าใหม่กว่า `create-easy-cms` (ต่าง major ได้เวอร์ชันของ CLI พร้อมคำเตือน) |

คำสั่งนี้ติดตั้งและแสดงขั้นต่อไปด้วย package manager ตัวนั้น (`pnpm exec easy-cms …`, `yarn easy-cms …`,
`bunx easy-cms …`) ถ้าเป็น Yarn 2 ขึ้นไปจะเขียน `.yarnrc.yml` ที่ตั้ง `nodeLinker: node-modules` ให้
เพราะยังไม่รองรับ Plug'n'Play การติดตั้งด้วย Bun ยังรัน CMS บน Node.js ถ้าจะรันบน Bun หรือ Deno ดู
[Bun และ Deno](./standalone#bun-and-deno)

ดูขั้นต่อจากนี้ได้ที่ [เริ่มใช้งาน](./getting-started)

## easy-cms {#easy-cms}

ติดตั้งเป็น dev dependency (เป็น dependency ปกติสำหรับ standalone server) ทุกคำสั่งโหลด `.env`
จาก root ของโปรเจกต์และอ่าน `easy-cms.config.ts`

```bash [pm]
npx easy-cms <command> [--config <file>] [--cwd <dir>]
```

| คำสั่ง | |
|---|---|
| [`migrate`](#migrate) | รัน migration ที่ยังค้างอยู่ |
| [`migrate:create <name>`](#migrate-create) | เขียน migration สำหรับการเปลี่ยน config, SQL ที่เขียนเอง (`--empty`) หรือขั้นย้ายข้อมูล (`--data`) |
| [`migrate:status`](#migrate-status) | แสดงรายการ migration และสถานะว่ารันแล้วหรือยัง |
| [`seed`](#seed) | รัน `easy-cms/seed.ts` เพื่อใส่เนื้อหาตัวอย่างหรือเนื้อหาเริ่มต้น |
| [`admin:create`](#admin-create) | สร้างผู้ใช้ |
| [`generate:types`](#generate-types) | เขียน type ของ TypeScript สำหรับแอปอื่น |
| [`backup <file>`](#backup) | คัดลอกฐานข้อมูลเป็นไฟล์ SQLite ขณะที่ CMS ทำงานอยู่ |
| [`backup:decrypt <file>`](#backup-decrypt) | ถอดรหัส backup ที่ทำด้วย `backups.encryptionKey` |
| [`copy --from <config>`](#copy) | คัดลอกเนื้อหาทั้งหมดไปอีกฐานข้อมูล เช่น จาก SQLite ไป Postgres |
| [`jobs:run`](#jobs-run) | รันงานตั้งเวลาที่ถึงกำหนดและส่ง webhook ซ้ำหนึ่งรอบ |
| [`search:reindex [collection]`](#search-reindex) | สร้าง index ค้นหาใหม่จากฐานข้อมูล |
| [`audit:resign`](#audit-resign) | หลังเปลี่ยน secret: เซ็น audit log ด้วยตัวใหม่ |
| [`secrets:rotate`](#secrets-rotate) | หลังเปลี่ยน secret: เข้ารหัสการเชื่อมต่อใน Integrations ด้วยตัวใหม่ |
| [`reset-sign-in`](#reset-sign-in) | ให้การเข้าสู่ระบบกลับไปใช้ผู้ให้บริการจาก config สำหรับผู้ดูแลระบบที่เข้าไม่ได้ |
| [`serve`](#serve) | รัน CMS เป็น server ของตัวเอง |
| [`build --target workers`](#build) | เขียนสิ่งที่ Wrangler ต้องใช้ deploy ไป Cloudflare Workers |
| [`build:admin [files…]`](#build-admin) | build component ของ admin ที่เขียนด้วย Vue, React หรือ Svelte |

ตัวเลือกที่ใช้ได้กับทุกคำสั่ง: `--config <file>` (ค่าเริ่มต้น `easy-cms.config.ts`), `--cwd <dir>`
(root ของโปรเจกต์ ใช้ `.env` ในนั้น) และ `--help` ถ้าล้มเหลวจะจบด้วย exit code ที่ไม่ใช่ 0
จึงใช้ใน CI และสคริปต์ deploy ได้ ตั้ง `DEBUG=1` เพื่อดู stack trace คำสั่งในตัวจะหยุดเมื่อเจอตัวเลือกที่ไม่รู้จัก

ก่อน 0.60 `admin:create` และ `jobs:run` ชื่อ `create-admin` และ `run-scheduled` ชื่อเดิมยังใช้ได้

### migrate {#migrate}

```bash [pm]
npx easy-cms migrate
```

รันทุก migration ใน `easy-cms/migrations` ที่ฐานข้อมูลยังไม่ได้รันตามลำดับ แต่ละตัวรันใน transaction
ของตัวเอง [ขั้นย้ายข้อมูล](#data-migrations) รันต่อจาก SQL ของมัน ถ้าล้มจะ rollback และหยุด ให้รันทุกครั้งที่ deploy ก่อนเวอร์ชันใหม่เริ่มทำงาน
ดู [Migration และการ deploy](./deployment)

### migrate:create {#migrate-create}

```bash [pm]
npx easy-cms migrate:create add-author-bio
```

เทียบ config กับ migration ล่าสุด แล้วเขียน `easy-cms/migrations/<timestamp>_<name>.sql` (และ snapshot `.json`)
เมื่อมีอะไรเปลี่ยน ถ้ารันใน terminal จะถามว่า field ที่หายไปถูกเปลี่ยนชื่อหรือไม่ เพื่อเก็บข้อมูลไว้แทนการลบทิ้ง
ตรวจ SQL แล้ว commit ทั้งสองไฟล์

#### SQL ที่เขียนเอง {#empty-migrations}

```bash [pm]
npx easy-cms migrate:create app-log --empty
```

เขียนไฟล์ `<timestamp>_app-log.sql` ว่างๆ ให้คุณเขียนเอง เช่น ตารางของแอปคุณ, view, index หรือการเติมข้อมูล
รันและบันทึกพร้อม migration อื่น ใน transaction ของตัวเอง คั่นแต่ละคำสั่งด้วยบรรทัด `--> statement-breakpoint`
ไฟล์นี้ไม่รวมการเปลี่ยน config การเปลี่ยน config ยังต้องมี migration ของตัวเอง

```sql
CREATE TABLE app_log (id integer PRIMARY KEY, note text NOT NULL)
--> statement-breakpoint
CREATE INDEX app_log_note ON app_log (note)
```

ตั้งชื่อตารางโดยไม่ใช้ prefix ของ Easy CMS (`ecms_`) เพราะ Easy CMS ไม่แตะตารางที่ไม่มี prefix ของมัน
ดู[ตารางของคุณเอง](./escape-hatches#your-own-tables)

#### ย้ายข้อมูล {#data-migrations}

```bash [pm]
npx easy-cms migrate:create split-name --data
```

เขียน SQL ของการเปลี่ยน config (ถ้ามี) และ `<timestamp>_split-name.ts` ซึ่งเป็นขั้นย้ายข้อมูลที่รันต่อจาก SQL นั้นใน
**transaction เดียวกัน** ถ้า throw คอลัมน์ใหม่และทุกแถวที่มันแก้จะ rollback ไปด้วยกัน และ `migrate` จะหยุด

```ts
import type { DataMigration } from '@easy-cms/core'

const migrate: DataMigration = async (tx) => {
  const users = await tx.sql`SELECT id, name FROM ecms_users WHERE first_name IS NULL`
  for (const user of users) {
    const [first, ...rest] = String(user.name ?? '').split(' ')
    await tx.sql`UPDATE ecms_users SET first_name = ${first}, last_name = ${rest.join(' ')} WHERE id = ${user.id}`
  }
}

export default migrate
```

`` tx.sql`…` `` ทำงานเหมือน [`cms.sql`](./local-api#raw-sql) ทุกค่าเป็น bound parameter ขั้นย้ายข้อมูลทำงานกับตารางและคอลัมน์
ตามที่ migration นั้นทิ้งไว้ ไม่ได้อ่าน config จึงยังใช้ได้แม้ config เปลี่ยนภายหลัง commit ไฟล์ `.ts` พร้อม `.sql` และ `.json`

### migrate:status {#migrate-status}

```bash [pm]
npx easy-cms migrate:status
# ✓ applied  20260925091723_init
# ✓ applied  20261117080102_split-name  (+ data)
# • pending  20261118040614_seo
```

### seed {#seed}

```bash [pm]
npx easy-cms seed
npx easy-cms seed --file scripts/demo-content.ts
```

รัน `easy-cms/seed.ts` (หรือ `--file`) ซึ่ง export default ฟังก์ชันที่รับ `cms` คือ [Local API](./local-api) โดยไม่ใช้กฎสิทธิ์

```ts
import type { Seed } from '@easy-cms/core'
import type config from '../easy-cms.config.ts'

const seed: Seed<typeof config> = async (cms) => {
  if ((await cms.count('posts')) > 0) return // ใส่ไว้แล้ว
  await cms.create('posts', { title: 'Hello', status: 'published' })
}

export default seed
```

รันทุกครั้งที่เรียก จึงควรเช็กก่อนว่ามีอะไรอยู่แล้ว ตอน development จะ push schema ก่อนเหมือน dev server
ยกเว้นโปรเจกต์ที่มี migration แล้ว ถ้า `NODE_ENV=production` ให้รัน `easy-cms migrate` ก่อน
[template แบบ one-click](./one-click-deploy) รันคำสั่งนี้ตอน build เพื่อใส่โพสต์ตัวอย่าง

### admin:create {#admin-create}

```bash [pm]
npx easy-cms admin:create --email ann@example.com --name Ann
npx easy-cms admin:create --email bob@example.com --role editor
```

สร้างผู้ใช้บทบาท `admin` (หรือตาม `--role`) จะถามรหัสผ่านใน terminal ถ้าไม่มี terminal (CI, container)
จะอ่านจาก `EASY_CMS_ADMIN_PASSWORD` ใช้ได้เมื่อสร้าง admin คนแรกใน browser ไม่ได้ หรือเมื่อต้องกู้การเข้าถึง

### generate:types {#generate-types}

```bash [pm]
npx easy-cms generate:types --out ../web/src/cms-types.ts
```

เขียน interface หนึ่งตัวต่อ collection และ global (ไฟล์ค่าเริ่มต้น `easy-cms-types.ts`) ไฟล์นี้ไม่มี import
frontend ใน repo อื่นจึงใช้ได้ ส่วนแอปที่ import config ได้ไม่ต้องใช้ เพราะ type [สร้างจาก config](./typescript) อยู่แล้ว

### backup {#backup}

```bash [pm]
npx easy-cms backup backups/cms-2026-09-28.db
```

คัดลอกฐานข้อมูลเป็นไฟล์ SQLite ใหม่ขณะที่ CMS ยังทำงาน เป็น snapshot ที่ข้อมูลตรงกันทั้งไฟล์ ชื่อที่ลงท้าย `.gz` จะถูกบีบอัด
เหมือน backup จากหน้า admin ไฟล์ปลายทางต้องยังไม่มีอยู่ Postgres ต้องมี `backups: { sqlite }` ใน config (หรือใช้ `pg_dump`)
ไม่รวมไฟล์อัปโหลด ให้สำรองโฟลเดอร์ uploads หรือ bucket แยก ดู [Backup](./backups)

### backup:decrypt {#backup-decrypt}

```bash [pm]
npx easy-cms backup:decrypt my-site-2026-10-04-0300.db.gz.enc [--out <file>]
```

ถอดรหัส backup ที่ทำด้วย `backups.encryptionKey` (ไฟล์ `.db.gz.enc` เช่นที่คัดลอกมาจาก bucket ของ backup) เป็นไฟล์ `.db.gz`
โดยใช้ key จาก config คำสั่งนี้ไม่เปิดฐานข้อมูล ถ้าไม่ใส่ `--out` จะเขียนไฟล์ไว้ข้างกันโดยตัด `.enc` ออก ไฟล์ปลายทางต้องยังไม่มีอยู่

### copy {#copy}

```bash [pm]
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

### jobs:run {#jobs-run}

```bash [pm]
npx easy-cms jobs:run
```

รัน[การเผยแพร่และยกเลิกที่ตั้งเวลาไว้](./drafts#scheduled-publishing)ที่ถึงกำหนด และส่ง
[webhook](./webhooks#delivery) ที่ล้มเหลวซ้ำหนึ่งรอบ server ทำเองทุกนาทีอยู่แล้ว
ใช้คำสั่งนี้จาก cron ในที่ที่ไม่มี process ของ server ทำงานค้างไว้ (serverless)

### search:reindex {#search-reindex}

```bash [pm]
npx easy-cms search:reindex          # ทุก collection ที่มี search
npx easy-cms search:reindex posts
```

สร้าง index [ค้นหา](./search) ใหม่จากเอกสารที่ publish แล้ว ใช้หลังเพิ่ม `search` ให้ collection
หรือเปลี่ยน field หรือเมื่อ index ไม่สำเร็จ ส่วน index ในหน่วยความจำ (`memorySearch()`)
เซิร์ฟเวอร์สร้างเองตอนเริ่ม จึงไม่ต้องทำอะไร

### secrets:rotate {#secrets-rotate}

```bash [pm]
npx easy-cms secrets:rotate
```

ใช้หลัง[หมุน secret](./security#rotating-the-secret) เข้ารหัสการเชื่อมต่อใน[หน้าการเชื่อมต่อ](./integrations)ที่ยังใช้ secret ตัวใดใน
`previousSecrets` ใหม่ด้วย `secret` ปัจจุบัน จึงลบ secret เก่าออกได้ การเชื่อมต่อแต่ละรายการก็ถูกเข้ารหัสใหม่ตอนถูกใช้ด้วย

### reset-sign-in {#reset-sign-in}

```bash [pm]
npx easy-cms reset-sign-in
```

ลบผู้ให้บริการเข้าสู่ระบบที่ผู้ดูแลระบบเปิดหรือปิดไว้ใน Integrations → เข้าสู่ระบบ ให้กลับไปเข้าสู่ระบบตามที่ config ตั้งไว้ ใช้เมื่อ
ผู้ดูแลระบบเข้าไม่ได้แล้ว เช่น client secret ของผู้ให้บริการหมดอายุ คนที่เข้าด้วยผู้ให้บริการที่เปิดจากหน้า admin จะออกจากระบบ
และบันทึกลง audit log ดู [ตั้งในหน้า admin](./sso#in-the-admin)

### audit:resign {#audit-resign}

```bash [pm]
npx easy-cms audit:resign
```

ใช้หลัง[หมุน secret](./security#rotating-the-secret) เซ็นรายการใน [audit log](./audit-log) ที่เซ็นด้วย secret ตัวใดใน
`previousSecrets` ใหม่ด้วย `secret` ปัจจุบัน รายการจึงยังตรวจผ่านหลังเอา secret เก่าออก รายการที่ไม่มี secret ไหนตรวจผ่าน
แปลว่าถูกแก้ในฐานข้อมูล จะไม่ถูกแตะ คำสั่งจะแสดงรายการเหล่านั้นและจบด้วย `1` การรันแต่ละครั้งถูกบันทึกใน audit log

### serve {#serve}

```bash [pm]
npx easy-cms serve --port 4000
npx easy-cms serve --watch          # ตอนพัฒนา: โหลดใหม่เมื่อ config เปลี่ยน
```

รัน Easy CMS โดยไม่ใช้ Nuxt หรือ Next.js: หน้า admin ที่ `/admin`, REST API ที่ `/api/cms`
และ `/healthz` กับ `/readyz` สำหรับ load balancer

| ตัวเลือก | |
|---|---|
| `--port <n>` | port ค่าเริ่มต้นคือ `PORT` แล้วตามด้วย 4000 |
| `--host <host>` | interface ที่รับ request ค่าเริ่มต้นคือ `HOST` แล้วตามด้วยทุก interface |
| `--watch` | โหลดใหม่เมื่อ config หรือไฟล์ที่มัน import เปลี่ยน |
| `--trust-proxy` | เชื่อ `X-Forwarded-For`, `X-Forwarded-Proto` และ `X-Forwarded-Host` (สำหรับการตรวจ origin ของ CSRF) จาก reverse proxy ของคุณ |

บน production (`NODE_ENV=production`) ถ้ามี migration ค้าง server จะไม่เริ่มทำงาน
ดู [Standalone server](./standalone)

### build {#build}

```bash [pm]
npx easy-cms build --target workers
```

เขียนสิ่งที่ Wrangler ต้องใช้ deploy standalone server (หน้า admin และ REST API) เป็น Cloudflare Worker:

- `.easy-cms/workers/`: entry ของ Worker และไฟล์ของหน้า admin เขียนใหม่ทุกครั้งที่ build
- `wrangler.jsonc` ถ้าโปรเจกต์ยังไม่มี ตั้ง `nodejs_compat`, binding `ASSETS`, Cron Triggers ทุกนาทีสำหรับ jobs
  และ alias ของแพ็กเกจที่รันบน Workers ไม่ได้ (`sharp`) เขียนครั้งเดียว หลังจากนั้นเป็นของคุณ

Worker ไม่มีดิสก์ config จึงต้องมี `upload.storage` (เช่น `s3Storage()` กับ bucket ของ R2) และฐานข้อมูลที่ต่อผ่าน HTTP
(เช่น Turso) และจะไม่ย่อรูป รัน `easy-cms migrate` กับฐานข้อมูลเดียวกันจากเครื่องของคุณหรือ CI แล้วจึง
`npx wrangler deploy` ทีละขั้นตอนดู [Deploy บน Cloudflare Workers](./deploy/cloudflare-workers)

### build:admin {#build-admin}

```bash [pm]
npx easy-cms build:admin
npx easy-cms build:admin --watch
npx easy-cms build:admin admin/components/acme-chart.tsx --out admin/dist/chart.js
```

build component ที่เขียนด้วย Vue (`.vue`), React (`.tsx`, `.jsx`) และ Svelte (`.svelte`) ใน `admin/components/`
เป็น module เดียวที่ `admin/dist/components.js` สำหรับ `admin.modules` แต่ละไฟล์เป็น custom element ที่ใช้ชื่อไฟล์เป็นชื่อ tag
ไฟล์ที่ระบุในคำสั่งจะได้ module แยกใน `admin/dist/` (`--out`: ชื่อไฟล์เมื่อมีไฟล์เดียว หรือโฟลเดอร์เมื่อมีหลายไฟล์)
`--watch` build ใหม่เมื่อไฟล์เปลี่ยน ต้องมี `@easy-cms/admin-build` และ Vite plugin ของ framework ในโปรเจกต์
ดู [Vue, React หรือ Svelte](./plugins#frameworks)

### คำสั่งจาก plugin {#commands-from-plugins}

Plugin เพิ่มคำสั่งเองได้ เช่น `easy-cms nested:rebuild` จาก plugin [หน้าย่อย](./nested-docs)
ถ้าพิมพ์คำสั่งที่ไม่รู้จัก `npx easy-cms` จะแสดงคำสั่งที่ config ของคุณมี config ของคุณก็เพิ่มคำสั่งเองได้

```ts
export default defineConfig({
  // …
  cliCommands: [
    {
      name: 'posts:count',
      description: 'Print how many posts there are',
      run: async ({ cms, args, log }) => log(String(await cms.count('posts'))),
    },
  ],
})
```

`run` ได้รับ CMS (schema ตามที่เป็นอยู่ ให้รัน `migrate` ก่อน) คำที่ตามหลังชื่อคำสั่ง (`args`)
ตัวเลือก (`flags`) และ `log` คืนตัวเลขเพื่อใช้เป็น exit code

`flags` มีทุกตัวเลือกที่ CLI ไม่ได้ใช้เอง (`--config`, `--cwd` และ `--help` เป็นของ CLI) ชื่อเป็น
camelCase ค่าเป็น string หรือ `true` สำหรับตัวเลือกที่ไม่มีค่า

| พิมพ์ | `flags` |
|---|---|
| `--dry-run` | `{ dryRun: true }` |
| `--limit=5` | `{ limit: '5' }` |

## ขั้นต่อไป {#next-steps}

- [Migration และการ deploy](./deployment): ควรรันคำสั่งไหนเมื่อไหร่
- [Standalone server](./standalone): รัน CMS ให้ frontend ใดก็ได้
