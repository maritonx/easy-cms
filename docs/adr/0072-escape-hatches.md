# ADR-0072: Escape hatches: dev เขียนเองได้ทุกส่วน

- **สถานะ:** Accepted
- **วันที่:** 2026-11-17
- **เกี่ยวข้อง:** [ADR-0069](0069-typescript-backend-six-levels.md) (หกระดับ), [ADR-0018](0018-plugin-endpoints-admin-components.md) (endpoint และ component ของ plugin),
  [ADR-0052](0052-postgres-job-queue.md) (คิวงานในฐานข้อมูล), [ADR-0053](0053-outbox-for-after-hooks.md) (outbox), [ADR-0054](0054-http-cache-not-redis.md) (HTTP cache),
  [ADR-0065](0065-code-first-application-engine.md) (application engine), [ADR-0070](0070-realtime.md) (realtime)

## บริบท

- เจ้าของโปรเจกต์ต้องการให้ Easy CMS เป็น backend ที่ทำได้ทุกระบบ และ dev ปรับแต่งได้ 100% ด้วย TypeScript ไม่ติดกรอบของ CMS
  (`directions/images/4 - dev custom 100%`, ตกลงกัน 2026-11-17)
- ข้อเสนอมีห้าแกน: เข้าถึงฐานข้อมูลตรง, API และ middleware, หน้า admin ระดับ component, plugin เจาะลึกพร้อม event bus,
  และ state/cache/queue พร้อม migration และ seed ด้วย TypeScript หน้า admin แยกเป็นสามระดับ: slot และหน้าเพิ่ม, UI ข้ามเฟรมเวิร์ก,
  headless admin
- หลายอย่างมีแล้ว: `endpoints` (ADR-0018), plugin แบบ `(config) => config`, `onRequest`, `cms.emit` / `cms.on` และ webhook,
  `outbox` (ADR-0053), realtime (ADR-0070), component ของ admin แบบ Web Component (ADR-0018), หน้า `<admin>/p/<path>`,
  widget บน dashboard, nav และ command palette, `actions`, `jobs`, `cliCommands`
- ที่ยังไม่มี: raw SQL และ transaction ข้ามหลาย collection (`cms.db` เป็น adapter ภายใน อยู่นอก semver), hook ฝั่ง response และ error,
  `access` ของ endpoint, migration ที่ย้ายข้อมูลด้วย TypeScript และคำสั่ง seed, การปิด admin ใน Nuxt และ `easy-cms serve`,
  ตัว build component ของ admin

## การตัดสินใจ

- **เป็นหลักการ ไม่ใช่ระดับใหม่:** ทุกอย่างที่ Easy CMS ทำให้ต้องมีทางให้ dev เขียนเอง (escape hatch) ใช้กับทุกระดับของ ADR-0069
  ระดับ 3 (App framework) ยังเป็น "ครบแล้ว" งานแต่ละชิ้นอยู่ในระดับที่มันเกี่ยว
- **"100%" มีขอบ:** เส้นทางปกติยังผ่านกฎสิทธิ์ชุดเดียวทุกทางเข้า ทางที่ข้ามกฎสิทธิ์ทำได้ แต่ต้องเห็นในโค้ด (ชื่อหรือ option ที่บอกตรงๆ)
  และเอกสารบอกว่าเป็นความรับผิดชอบของ dev ไม่มีอะไรข้ามกฎเงียบๆ
- **backend ก่อน admin**

### งาน ตามลำดับ (issue และ PR แยก, minor release แยก)

1. **`cms.transaction(async (tx) => …)` และ `sql`**
   - `tx` เป็น Local API ตัวเดียวกับ `cms` ที่ผูกกับ transaction เดียว: `tx.find`, `tx.update` ฯลฯ ยังผ่านกฎสิทธิ์และ hook
   - `` tx.sql`select … ${value}` `` (และ `cms.sql` นอก transaction): tagged template ค่าใน `${}` เป็น parameter เสมอ ไม่ต่อสตริง
     ไม่ผ่านกฎสิทธิ์ ไม่มี hook นี่คือทางข้ามที่เห็นในโค้ด ใช้ได้กับ SQLite, Turso และ Postgres (SQL ที่เขียนเป็นของแต่ละฐาน)
   - `before*` hook รันใน transaction; `after*` hook, webhook และ event realtime รอ commit (กลไกเดียวกับ outbox)
     rollback แล้วไม่มีอะไรออกไป ไม่ประกาศสิ่งที่ไม่ได้เกิด
   - Drizzle ยังเป็นของภายใน ไม่เปิด `cms.drizzle`: อัปเกรด Drizzle แล้วผู้ใช้ไม่พัง
2. **`access` ของ endpoint, `onResponse` และ `onError`**
   - `endpoints[].access` แบบเดียวกับ collection: ไม่ต้องเช็ก `user` เองในทุก handler
   - `onResponse(response, ctx)` ระดับ config: แก้ header หรือ body, logging; `onError(error, ctx)`: ส่ง error ออกไป (เช่น Sentry)
     หรือเปลี่ยนรูป error เป็นรายการได้เหมือน `onRequest` ไม่ทำ middleware แบบชั้น (`use(fn)`)
3. **`easy-cms migrate:create --empty <name>`, `--data <name>` และ `easy-cms seed`**
   - `--empty`: ไฟล์ SQL ว่างให้เขียนเอง (เช่นตารางของแอปเอง) รันในชุด migration เดียวกัน
   - `--data`: ไฟล์ `.ts` ที่ export ฟังก์ชันรับ `tx` รันต่อจาก SQL ของ migration เดียวกันใน transaction เดียว ไว้ย้ายข้อมูล
   - `easy-cms seed`: รัน `easy-cms/seed.ts` (export ฟังก์ชันรับ `cms`) template ของ `create-easy-cms` และเว็บ easycms.dev ใช้คำสั่งนี้
4. **`admin: false`** ปิด admin ได้ทุก adapter (Next.js, Nuxt, `easy-cms serve`) API ยังอยู่ ให้แอป admin ที่ dev เขียนเอง
5. **`easy-cms build:admin`** build component ของ admin ที่เขียนด้วย `.vue`, `.tsx` หรือ `.svelte` ด้วย Vite ให้เป็น ES module ไฟล์เดียว
   ที่ลงทะเบียน custom element (สัญญาเดิมของ ADR-0018) dev ไม่ต้องตั้ง bundler เอง ไม่ฝัง Vue component เข้า admin โดยตรง
   เพราะจะผูกกับ Vue และของภายใน admin ทุกเวอร์ชัน
6. **ต่อด้วยลำดับของ ADR-0065:** custom list view, Kanban, ธีม, `admin.edit.component`

### ตารางของแอปเอง

- อยากให้ Easy CMS ดูแล (สิทธิ์, hook, หน้า admin, REST) ใช้ collection (`admin.group: false` ถ้าไม่อยากให้อยู่ในเมนู)
- ตารางดิบ: สร้างด้วย `migrate:create --empty` แล้วอ่านเขียนด้วย `sql` Easy CMS ไม่ใส่สิทธิ์หรือ hook ให้ตารางที่ไม่ใช่ collection
  ไม่ทำระบบสิทธิ์ชุดที่สอง

### ยังไม่ทำ

- **Redis / BullMQ / adapter ของ cache และ queue:** ADR-0052 และ ADR-0054 ยังใช้ได้ ("ไม่ต้องมี infra เพิ่ม")
  เพิ่มเมื่อมีผู้ใช้หรือ load test ที่ต้องการจริง ไม่ออกแบบ interface ไว้ล่วงหน้า
- **Admin SDK ที่อยู่ใน semver:** endpoint `admin/ui/*` ยังนอก semver ทำพร้อม client package เมื่อ API นิ่ง
- **เปิด Drizzle ให้ใช้ตรง**
- **middleware แบบชั้น** และ **micro-frontend ที่โหลดโมดูลจาก URL ภายนอก** (CSP ของ admin ไม่อนุญาต; iframe ใน custom element ยังทำได้)

### การสื่อสาร

- หน้าเอกสาร "Escape hatches" (`website/guide/escape-hatches.md`, EN และ TH) รวมทุกทางที่มีอยู่ เพิ่มทีละชิ้นเมื่อออก
- หน้า roadmap: บรรทัดหลักการหนึ่งบรรทัด
- บทความ: หลังงานข้อ 1–3 ออกแล้ว ไม่ประกาศของที่ยังไม่มี

## ผลที่ตามมา

- dev ทำ transaction ข้ามหลาย collection และ query ที่ Local API ทำไม่ได้ (join, aggregate) ได้โดยไม่ต้องแยก client ฐานข้อมูลเอง
- `sql` ไม่ผ่านกฎสิทธิ์: หน้าเอกสารและ JSDoc ต้องบอกชัด และตัวอย่างต้องรับ input ผ่าน `${}` เท่านั้น
- `tx` ทำให้ hook ที่เขียนไว้แล้วอาจรันใน transaction: hook ที่เรียกบริการภายนอกควรอยู่ใน `after*` ซึ่งรอ commit
- SQL ที่เขียนเองผูกกับฐานข้อมูลที่ใช้ ย้ายจาก SQLite ไป Postgres แล้วต้องแก้เอง (เอกสารบอก)
