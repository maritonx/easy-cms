# ฐานข้อมูล {#databases}

::: info หน้านี้สอนอะไร
SQLite, Turso, Postgres และ PGlite: การเชื่อมต่อ การเลือก และการปรับแต่ง

**ควรอ่านก่อน:** [เริ่มใช้งาน](./getting-started)
:::

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

## ประสิทธิภาพ {#performance}

วัดด้วย `packages/integration/load.ts` บน Postgres 17 (Docker บนโน้ตบุ๊ก 10 คอร์):
บทความ 100,000 รายการ มีสองภาษา, drafts และ versions, relationship, tag แบบ `hasMany` และ blocks
ยิง REST พร้อมกัน 20 request และ connection pool 10

| Request | Request/วินาที | p50 | p95 |
|---|---|---|---|
| ตาม id พร้อม populate relationship (`depth=2`) | 2,750 | 8 ms | 10 ms |
| ตาม slug (`where[slug][equals]`) | 2,770 | 8 ms | 10 ms |
| หน้าแรกของรายการ | 1,060 | 18 ms | 23 ms |
| กรองตาม relationship เรียงตามวันที่ | 560 | 34 ms | 55 ms |
| รายการใน admin รวมฉบับร่าง | 550 | 35 ms | 49 ms |
| บันทึกฉบับร่าง (พร้อม version) | 500 | 38 ms | 52 ms |
| สุ่มหน้าจาก 8,000 หน้า | 150 | 129 ms | 189 ms |
| กรองตามค่า `hasMany` เรียงตามตัวเลข | 115 | 159 ms | 258 ms |
| ค้นหาด้วย `like` | 100 | 198 ms | 262 ms |
| ค้นในบล็อก (`layout.blockType`) | 83 | 237 ms | 304 ms |

ความหมายสำหรับเว็บของคุณ:

- **หน้าเว็บและการดึงตาม id/slug เร็ว** frontend ส่วนใหญ่ดึงตาม id หรือ slug และแสดงรายการหน้าแรกๆ
- **หน้าลึกๆ ใช้เวลามากขึ้น** ตามระยะ เพราะฐานข้อมูลต้องข้ามแถวก่อนหน้า ให้แบ่งหน้า archive ตามวันที่
  (`where[publishedAt][lt]=…`) แทนการไปหน้าที่ 5,000
- **`like` อ่านทุกแถว** ถ้าต้องการค้นหาทั้งเว็บ ให้ใช้บริการค้นหา (Meilisearch, Algolia, Typesense) ที่อัปเดตผ่าน
  [webhooks](./webhooks) หรือเพิ่ม index `pg_trgm` บน Postgres เอง
- **การค้นในบล็อก** อ่าน JSON ของทุกเอกสาร บน Postgres ตัวดำเนินการ `equals` และ `in` ใช้ JSON containment
  จึงเร็วกว่าตัวอื่นประมาณหกเท่า ควรใช้กับการกรอง ไม่ใช่ทุกครั้งที่มีคนเปิดหน้า
- **cache หน้าสาธารณะ** (CDN หรือ cache ของ framework) แล้วสั่ง revalidate จาก webhook
  traffic ส่วนใหญ่จะไม่ต้องมาถึง CMS เลย
- ถ้ามี request พร้อมกันมากกว่าจำนวน connection จะต้องรอ connection ว่าง เพิ่ม `max` ของ `postgres()` ได้ถ้าฐานข้อมูลรับไหว

## ขั้นต่อไป {#next-steps}

- [Migration และการ deploy](./deployment): migration บน production
- [Backup และการอัปเกรด](./backups): สำรองฐานข้อมูล
