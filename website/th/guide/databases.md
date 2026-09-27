# ฐานข้อมูล {#databases}

## SQLite {#sqlite}

```bash
npm install @easy-cms/db-sqlite
```

```ts
import { sqlite } from '@easy-cms/db-sqlite'

db: sqlite({ url: 'file:./cms.db' }) // relative to the project root
db: sqlite({ url: 'libsql://my-db.turso.io', authToken: process.env.TURSO_TOKEN })
```

ใช้ libSQL ไม่รองรับฐานข้อมูลแบบ in-memory (`:memory:`)

SQLite เขียนได้ทีละรายการ การเขียนใน process เดียวกันจะเข้าคิวรอกัน ส่วนเมื่อ process อื่นเขียนไฟล์เดียวกันอยู่
(server ตัวที่สอง หรือคำสั่ง `easy-cms`) การเขียนจะรอได้นานสูงสุด `busyTimeout` (ค่าเริ่มต้น 10000 ms)
ระหว่างรอ process นั้นจะหยุดทำงานชั่วคราว ถ้ามีหลาย process ที่เขียนไฟล์เดียวกันบ่อยๆ ควรใช้ Postgres

```ts
db: sqlite({ url: 'file:./cms.db', busyTimeout: 5_000 })
```

## Postgres {#postgres}

```bash
npm install @easy-cms/db-postgres
```

```ts
import { postgres } from '@easy-cms/db-postgres'

db: postgres({ url: process.env.DATABASE_URL }) // a server, via postgres.js
db: postgres({ pglite: '.pglite' }) // PGlite: Postgres in WebAssembly, needs @electric-sql/pglite
```

PGlite สะดวกสำหรับใช้งานในเครื่องและในเทสต์: เป็น Postgres จริงโดยไม่ต้องติดตั้งอะไร การตั้งค่าที่พบบ่อย:

```ts
db: process.env.DATABASE_URL ? postgres({ url: process.env.DATABASE_URL }) : postgres({ pglite: '.pglite' }),
```

## ตัวเลือกทั่วไป {#common-options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `tablePrefix` | `ecms_` | prefix ของทุกตารางที่ Easy CMS สร้าง |
| `migrationDir` | `easy-cms/migrations` | ตำแหน่งเก็บไฟล์ migration |

## ใช้ฐานข้อมูลร่วมกับแอปของคุณ {#sharing-a-database-with-your-app}

Easy CMS สร้างและแก้ไขเฉพาะตารางที่มี prefix ของตัวเอง จึงใช้ฐานข้อมูลของแอปคุณได้
ตารางของคุณเองจะไม่ถูกแตะต้อง ทั้งในช่วงพัฒนา (development) และโดย migration

## ข้อแตกต่างที่ควรรู้ {#differences-to-know}

- การเรียงข้อความเป็นไปตาม collation ของฐานข้อมูล: SQLite และ PGlite เรียงแบบแยกตัวพิมพ์เล็ก-ใหญ่ ส่วน
  Postgres server ส่วนใหญ่ไม่แยก
- ไฟล์ migration สร้างขึ้นสำหรับฐานข้อมูลชนิดเดียว ไฟล์ที่สร้างสำหรับ SQLite จะถูกปฏิเสธบน Postgres
