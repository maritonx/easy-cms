# ฐานข้อมูล {#databases}

::: info หน้านี้สอนอะไร
SQLite, Turso, Postgres และ PGlite: การเชื่อมต่อ การเลือก และการปรับแต่ง

**ควรอ่านก่อน:** [เริ่มใช้งาน](./getting-started)
:::

## SQLite {#sqlite}

```bash [pm]
npm install @easy-cms/db-sqlite
```

```ts
import { sqlite } from '@easy-cms/db-sqlite'

db: sqlite({ url: 'file:./cms.db' }) // relative to the project root
db: sqlite({ url: 'libsql://my-db.turso.io', authToken: process.env.TURSO_TOKEN })
```

ใช้ libSQL ไม่รองรับฐานข้อมูลแบบ in-memory (`:memory:`)

SQLite เขียนได้ทีละรายการ การเขียนใน process เดียวกันจะเข้าคิวรอกัน ส่วนเมื่อ process อื่นเขียนไฟล์เดียวกันอยู่
(server ตัวที่สอง หรือคำสั่ง `easy-cms`) การเขียนจะรอได้นานสูงสุด `busyTimeoutMs` (ค่าเริ่มต้น 10000 ms)
ระหว่างรอ process นั้นจะหยุดทำงานชั่วคราว ถ้ามีหลาย process ที่เขียนไฟล์เดียวกันบ่อยๆ ควรใช้ Postgres

```ts
db: sqlite({ url: 'file:./cms.db', busyTimeoutMs: 5_000 })
```

## Postgres {#postgres}

```bash [pm]
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

### Connection {#connections}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `max` | `10` | จำนวน connection ใน pool ต่อ instance |
| `writeConnections` | `0` | connection ที่กันไว้ให้การบันทึก เพิ่มจาก `max` (ดูข้างล่าง) |
| `prepare` | `true` | prepared statement ปิดเมื่ออยู่หลัง pooler ที่เก็บไว้ไม่ได้ |
| `statementTimeoutMs` | — | ยกเลิก statement ที่รันนานเกินนี้ ใช้หลัง PgBouncer ไม่ได้ (ดูข้างล่าง) |
| `idleTimeoutMs` | — | ปิด connection ที่ว่างนานเท่านี้ |
| `connectTimeoutMs` | `30000` | เลิกรอเปิด connection หลังจากนี้ |
| `applicationName` | `easy-cms` | แสดงใน `pg_stat_activity` ใช้ `PGAPPNAME` ได้ด้วย |

ตัวเลือกใน URL (`?prepare=false`) และตัวแปร `PG*` ยังใช้ได้ถ้าไม่ได้ตั้งตัวเลือกนั้น `statementTimeoutMs`
ไม่มีค่าเริ่มต้น เพราะ migration และ backup อาจใช้เวลานาน และ `easy-cms migrate` กับ `easy-cms backup` อ่าน config เดียวกัน จึงควรเผื่อเวลาไว้

**จำนวน connection** ทุก instance เปิดได้ถึง `max` รวมทั้งหมดจึงเป็นจำนวน instance × `max` ควรให้ไม่เกิน 10–20%
ของ `max_connections` ของ server (`SHOW max_connections`) เผื่อไว้ให้แอปของคุณ migration และเครื่องมือของแอดมิน

**การบันทึกที่ต้องรอ read ที่ช้า** เมื่อ read ที่ช้าถือ connection ไว้หมด การบันทึกต้องรอจนกว่าจะมีว่าง `writeConnections`
ทำให้การสร้าง แก้ไข และลบ (รวมทุกการอ่านที่มันทำ) ใช้ connection ชุดของตัวเอง editor จึงบันทึกได้แม้เว็บกำลังยุ่ง
อย่าลืมนับรวมในจำนวน connection ทั้งหมด ใช้กับ PGlite ไม่ได้

```ts
db: postgres({ url: process.env.DATABASE_URL, max: 10, writeConnections: 2 })
```

**Serverless และ pooler** function แต่ละตัวบน serverless มี pool ของตัวเอง และ traffic ที่พุ่งขึ้นทีเดียวจะเปิดหลายตัวพร้อมกัน
ให้ต่อผ่าน pooler (PgBouncer หรือของผู้ให้บริการ เช่น Neon, Supabase, RDS Proxy) และตั้ง `max` น้อย ๆ 1–3

```ts
db: postgres({ url: process.env.DATABASE_POOLER_URL, max: 2, prepare: false })
```

- **Transaction mode** ให้แต่ละ transaction ได้ server connection ตัวไหนก็ได้ Easy CMS ไม่เก็บอะไรค้างไว้ระหว่าง
  transaction จึงใช้ได้ และ CI ทดสอบกับ PgBouncer
- **`prepare: false`** ยกเว้น pooler เก็บ prepared statement ข้าม server connection ได้ ซึ่ง PgBouncer ทำได้ตั้งแต่ 1.24
  (`max_prepared_statements` ค่าเริ่มต้น 200) ไม่อย่างนั้น query จะล้มด้วย "prepared statement … does not exist"
- **ตั้งค่าที่ role** ไม่ใช่ที่ connection เพราะ PgBouncer ปฏิเสธ startup parameter อย่าง `statement_timeout`
  ใช้ `ALTER ROLE cms SET statement_timeout = '15s'` แทน `statementTimeoutMs`
- **Migration** รันผ่าน pooler ได้ หรือต่อตรงก็ได้ถ้าผู้ให้บริการมีให้

## ตัวเลือกทั่วไป {#common-options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `tablePrefix` | `ecms_` | prefix ของทุกตารางที่ Easy CMS สร้าง |
| `migrationDir` | `easy-cms/migrations` | ตำแหน่งเก็บไฟล์ migration |

## ใช้ฐานข้อมูลร่วมกับแอปของคุณ {#sharing-a-database-with-your-app}

Easy CMS สร้างและแก้ไขเฉพาะตารางที่มี prefix ของตัวเอง จึงใช้ฐานข้อมูลของแอปคุณได้
ตารางของคุณเองจะไม่ถูกแตะต้อง ทั้งในช่วงพัฒนา (development) และโดย migration ถ้าต้องการแยกมากกว่านี้ (schema, ฐานข้อมูล หรือ server ของตัวเอง)
ดู[แยกฐานข้อมูลจากแอป](./database-isolation)

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
- **`like` อ่านทุกแถว** ยกเว้น field ที่ตั้ง `index: 'trigram'` บน Postgres (ดูข้างล่าง) ถ้าต้องการค้นหาทั้งเว็บ ให้ใช้บริการค้นหา
  (Meilisearch, Algolia, Typesense) ที่อัปเดตผ่าน [webhooks](./webhooks)
- **การค้นในบล็อก** อ่าน JSON ของทุกเอกสาร บน Postgres ตัวดำเนินการ `equals` และ `in` ใช้ JSON containment
  จึงเร็วกว่าตัวอื่นประมาณหกเท่า ควรใช้กับการกรอง ไม่ใช่ทุกครั้งที่มีคนเปิดหน้า
- **cache หน้าสาธารณะ** (CDN หรือ cache ของ framework) แล้วสั่ง revalidate จาก webhook
  traffic ส่วนใหญ่จะไม่ต้องมาถึง CMS เลย
- ถ้ามี request พร้อมกันมากกว่าจำนวน connection จะต้องรอ connection ว่าง เพิ่ม `max` ของ `postgres()` ได้ถ้าฐานข้อมูลรับไหว

### ที่ 1,000,000 บทความ {#at-1-000-000-posts}

workflow Perf ที่รันทุกคืนวัดข้อมูลรูปแบบเดียวกันที่ 1,000,000 บทความ บน GitHub runner (4 core) กับ Postgres 17
และ 20 request พร้อมกันจาก process เดียว ตัวเลขข้างล่างเป็นค่ามัธยฐานของ 3 รอบบน 1.15 (2026-10-28)
runner แต่ละเครื่องไม่เท่ากัน request เดียวกันอาจเร็วหรือช้าต่างกันราว 40% ระหว่างรอบ จึงควรเทียบตัวเลขจากรอบเดียวกัน

| Request | Requests/s | p50 | p95 |
|---|---|---|---|
| ตาม id หรือ slug | 990 | 23 ms | 27 ms |
| ตาม id ที่ไม่เปลี่ยน (`If-None-Match`, `304`) | 1,165 | 19 ms | 25 ms |
| หน้าแรกของ list | 610 | 32 ms | 36 ms |
| หน้าถัดไปด้วย cursor ในส่วนลึกของ list | 583 | 34 ms | 37 ms |
| กรองด้วยค่า `hasMany` เรียงด้วยตัวเลข | 456 | 34 ms | 43 ms |
| ค้นภาษาไทยด้วย `like` และ `index: 'trigram'` | 347 | 58 ms | 79 ms |
| list ของ admin พร้อม drafts | 302 | 66 ms | 73 ms |
| บันทึก draft (พร้อม version) | 231 | 84 ms | 104 ms |
| ค้นด้วย `like` ตัวเลข 1 ถึง 3 หลัก | 37 | 261 ms | 3.4 s |
| กรองด้วย relationship เรียงด้วยวันที่ | 35 | 170 ms | 1.8 s |
| สุ่มหน้าจาก 100,000 หน้า | 5 | 3.9 s | 6.8 s |
| แบบเดียวกันแต่ไม่นับ (`count=false`) | 6 | 3.6 s | 7.3 s |
| ค้นในบล็อก (`layout.blockType`) | 4 | 6.0 s | 6.0 s |

- **การหาตาม id/slug หน้าแรก และ cursor ยังเร็ว** ที่ขนาดนี้ ส่วน `304` ของเอกสารที่ไม่เปลี่ยน
  ([`httpCache`](./deployment#http-caching)) ประหยัดการส่งข้อมูล ไม่ได้ลดงาน เพราะ Easy CMS ยังต้องอ่านเอกสารนั้น
- **หน้าลึกแบบระบุเลขหน้าคือส่วนที่แพง** ไม่นับยอดรวมก็ช้าเท่ากัน แปลว่าเวลาหมดไปกับการข้ามแถว ไม่ใช่การนับ ใช้ `cursor`
  กับหน้า archive และ feed และตั้ง `maxPage` ไม่ให้ API client ไปหน้าลึก
- **กรองด้วย relationship นับจาก index ได้** ใน collection ที่มี drafts field ที่มี index (relationship, upload, `index: true`)
  จะได้ index คู่กับ `status` ซึ่ง read สาธารณะใช้กรอง การนับยอดรวมจึงอ่านแค่ index
- **trigram index ต้องมีอย่างน้อยสามตัวอักษร** การค้นภาษาไทยไม่กี่คำใช้ index ได้ แต่ `like` ที่มีหนึ่งหรือสองตัวอักษรจะต้องอ่านทุกแถว
  จึงถูกปฏิเสธ (`400`)
- **ไม่ควรค้นในบล็อกบนหน้าสาธารณะ** ที่ขนาดนี้ หรือคัดค่าที่ค้นออกมาเป็น field ของตัวเอง ([Blocks](./fields#queries-inside-blocks-on-large-collections))
- เมื่อมี editor 200 คนพร้อมกันและมี query ที่ช้าเหล่านี้ปนอยู่ การอ่านต้องรอ connection (p95 18 s, บันทึก 31 s) request ช้าแบบเดียวทำให้
  ทุกอย่างช้าตาม หาให้เจอจาก access log (`logs`) แล้วเปลี่ยนไปใช้ cursor, index หรือ cache และให้การบันทึกมี
  [connection ของตัวเอง](#connections)

#### ตัวเลขเหล่านี้มาจากไหน {#how-these-numbers-are-made}

ทุกคืน workflow Perf ใส่ข้อมูล 1,000,000 บทความใน Postgres เปิด `easy-cms serve` ให้ editor 200 คนทำงานสองนาที
แล้ววัด request ทีละแบบ แบบละ 10 วินาที เพื่อตัดสินการเปลี่ยนแปลง workflow จะ build commit ของคืนล่าสุดที่ผ่านด้วย
แล้ววัดทั้งสองชุดบน runner เครื่องเดียวกัน เรียงเป็น base, head, head, base ถ้า request แบบใดมี p95 ช้ากว่า base เกิน 25%
ทั้งสองครึ่ง รอบนั้นจะล้ม ถ้าช้าครึ่งเดียวจะเป็นแค่คำเตือน ข้าม runner กัน request เดียวกันต่างกันได้ราว 40% แต่ในรอบเดียวกัน
โค้ดชุดเดียวกันส่วนใหญ่ต่างกันไม่เกิน 10% ตัวเลขของคืนก่อนๆ แสดงไว้ข้างแต่ละรอบแต่ไม่ใช้ตัดสิน และ summary ของรอบมีค่ามัธยฐาน
ของ 7 คืนล่าสุด ซึ่งเป็นที่มาของตารางข้างบน

## ค้นด้วย like {#search-with-like}

`like` หาข้อความที่ตรงกับส่วนไหนของข้อความก็ได้ ซึ่ง index ปกติช่วยไม่ได้ บน Postgres ตั้ง `index: 'trigram'` เพื่อเพิ่ม index
ที่ช่วยได้ (GIN กับ extension `pg_trgm`) ใช้ได้ทั้งภาษาไทยและภาษาอังกฤษ:

```ts
{ name: 'title', type: 'text', localized: true, index: 'trigram' }
```

ที่ 100,000 บทความ การค้นชื่อบทความภาษาไทยเปลี่ยนจากอ่านทุกแถว (ประมาณ 250 ms ต่อ query) เป็น p95 25 ms ที่ 20 request
พร้อมกัน field หลายภาษาได้ index แยกทุกภาษา

- **Extension** migration แรกที่มี trigram index จะรัน `CREATE EXTENSION IF NOT EXISTS pg_trgm` ตั้งแต่ Postgres 13 เจ้าของฐานข้อมูล
  สร้างได้เอง และ Neon, Supabase และ RDS อนุญาต ถ้าไม่ได้ ให้คนดูแลฐานข้อมูลรันบรรทัดนี้หนึ่งครั้ง
- **LC_CTYPE ของฐานข้อมูล** trigram มาจากตัวอักษรและตัวเลขตามที่ฐานข้อมูลมอง ถ้า `LC_CTYPE` เป็น `C` หรือ `POSIX`
  ตัวอักษรไทยจะไม่ถูกนับเป็นตัวอักษร และ index หาไม่เจอ (ผลยังถูกต้อง แค่ช้า) Easy CMS จะเตือนตอนเริ่ม `C.UTF-8`,
  `en_US.UTF-8` และ `th_TH.UTF-8` ใช้ได้ รวมถึงค่าเริ่มต้นของ image Postgres ใน Docker และของ PGlite
- **อย่างน้อย 3 ตัวอักษร** คำค้นที่สั้นกว่านั้นใช้ index ไม่ได้ `like` บน field แบบนี้จึงปฏิเสธ (`400`) และช่องค้นหาใน admin
  จะรอจนพิมพ์ตัวที่สาม
- **SQLite** ไม่มี index แบบนี้ option นี้จึงไม่มีผลบน SQLite และ config เดียวกันใช้ได้ทั้งสองแบบ

## ขั้นต่อไป {#next-steps}

- [แยกฐานข้อมูลจากแอป](./database-isolation): schema, ฐานข้อมูล หรือ server ของตัวเอง
- [Migration และการ deploy](./deployment): migration บน production
- [Backup และการอัปเกรด](./backups): สำรองฐานข้อมูล
