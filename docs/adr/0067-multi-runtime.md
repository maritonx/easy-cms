# ADR-0067: core รันได้หลาย runtime

- **สถานะ:** Accepted
- **วันที่:** 2026-11-13
- **เกี่ยวข้อง:** [ADR-0001](0001-embedded-web-standard-core.md), [ADR-0011](0011-standalone-mode.md); แทนข้อ "ไม่รองรับ Edge" ใน SRS C-3, DESIGN §13 และ ROADMAP M11

## บริบท

- core มี handler แบบ Web-standard `(Request) => Promise<Response>` อยู่แล้ว (ADR-0001) แต่ตัว CMS รันบน Node อย่างเดียว
  - เหตุผลเดิม (2026-11-02): scrypt, sharp, driver แบบ TCP, SMTP และ disk ไม่มีบน Edge
- เจ้าของโปรเจกต์ต้องการให้ Easy CMS เป็น backend ที่เขียนครั้งเดียวแล้ว deploy ได้ตั้งแต่ VPS (SQLite + disk), Bun, Deno ไปจนถึง Cloudflare Workers (Turso + R2) (grilling 2026-11-13)
- ตอนเริ่ม core import `node:*` ใน 21 ไฟล์ ส่วนใหญ่เป็น HMAC, hash และ random ที่ทุก runtime มี
  - ส่วนที่ผูกกับเครื่องจริงๆ: disk storage, การโหลด config, admin modules, ไฟล์ชั่วคราวของ backup และการดาวน์โหลดจาก URL

## การตัดสินใจ

- **ปลายทาง:** core ใช้ Web API ล้วน (`fetch`, `Request`/`Response`, `crypto.subtle`, streams)
- **ทางไป:** import `node:*` ได้เฉพาะใน `packages/core/src/runtime/`
  - `runtime/crypto.ts`, `bytes.ts` และ `context.ts` ใช้ได้เฉพาะ `node:crypto`, `node:buffer` และ `node:async_hooks`
    ซึ่ง Node, Bun, Deno และ Cloudflare Workers (เปิด `nodejs_compat`) มีครบ
  - `runtime/node/` เป็นส่วนที่ต้องมี disk หรือ socket: disk storage, ไฟล์และ module, ดาวน์โหลดจาก URL
  - ไฟล์อื่นใน core ห้าม import `node:*` และห้ามใช้ `Buffer` (biome: `noRestrictedImports`, `noRestrictedGlobals`)
  - เทส `core/test/runtime.test.ts` ตรวจทั้ง source และ package ที่ build ว่าใช้ Node module ไหนบ้าง ตัวใหม่ต้องตัดสินใจก่อนว่าอยู่กลุ่มไหน
  - โค้ดใหม่ใช้ Web API ก่อน ฟังก์ชันใน `runtime/` ย้ายไป Web Crypto ได้ทีละตัวโดยไม่แตะที่อื่น
  - `AsyncContext` (TC39) จะแทน `AsyncLocalStorage` ได้ใน `runtime/context.ts` ที่เดียว
- **ไม่สร้างแพ็กเกจ `@easy-cms/runtime-*`:** แยก adapter ตามหน้าที่ (`db-*`, `storage-*`, email) ไม่ใช่ตามชื่อ runtime
- **ไม่ breaking ใน 1.x:** ผู้ใช้ Node ไม่ต้องแก้อะไร ส่วน API ที่ยัง sync จะเปลี่ยนเป็น async ได้ใน 2.0
- **"รองรับ" แปลว่ามี smoke test ใน CI:** เปิด server → `/healthz` → สร้าง admin → login → CRUD → อัปโหลด → อ่านผ่าน REST
- **รหัสผ่าน:** scrypt `N=2^15, r=8, p=3` (32 MB) แทน `N=2^17, r=8, p=1` (128 MB)
  - OWASP ถือว่าแข็งแรงเท่ากัน และพอดีกับหน่วยความจำ 128 MB ของ Worker
  - hash เก็บพารามิเตอร์ไว้ในตัว hash เดิมยังตรวจได้ และถูกแทนที่ตอน login สำเร็จครั้งถัดไป
  - hash ที่ขอหน่วยความจำเกิน 1.43 (`N * r > 2^20`) ถูกปฏิเสธแทนที่จะคำนวณ
- **ลำดับงาน:**
  1. `runtime/`, lint, เทสของ build และพารามิเตอร์ scrypt (1.44)
  2. smoke test ของ Bun และ Deno ใน CI ด้วย CLI เดิม (`bun easy-cms dev`, `deno run -A npm:easy-cms dev`)
  3. Cloudflare Workers แบบ standalone (`export default { fetch, scheduled }`):
     - ค่าเริ่มต้นเลือกด้วย export conditions (`workerd`, `node`) ไม่มี disk storage และแจ้ง error ตอนเริ่มถ้าไม่ได้ตั้ง `storage`
     - Turso ผ่าน `@libsql/client/web`, Postgres ผ่าน Hyperdrive
     - ไฟล์ admin จาก Workers Assets (`easy-cms build --target workers`)
     - ดาวน์โหลดจาก URL ด้วย `fetch` ตรวจ hostname และไล่ redirect เอง
     - jobs จาก Cron Triggers และ backup ไม่ใช้ไฟล์ชั่วคราว
     - ไม่ย่อรูป (ไม่มี sharp)
     - smoke test ใน CI ด้วย workerd (miniflare) + `sqld` + MinIO ไม่ใช้บัญชี Cloudflare
  4. ภายหลัง: Nuxt บน Cloudflare (Nitro), Next (OpenNext), D1, adapter `images`
- แพ็กเกจทางการอื่นใช้กติกาเดียวกัน ตัวที่ใช้บน Workers ไม่ได้ (เช่น `email-smtp`) ติดป้าย "Node only" และแจ้งตอนเริ่ม
- คำว่า "Edge-ready" ใช้ในการตลาดได้เมื่อ smoke test ของ Workers ผ่านใน CI แล้วเท่านั้น

## ผลที่ตามมา

- บน Workers ต้องเปิด `nodejs_compat` และใช้ plan แบบเสียเงิน (plan ฟรีให้ CPU 10 ms ต่อ request ไม่พอสำหรับ hash รหัสผ่าน)
- ต้องทดลองบน Workers จริงก่อนขั้นที่ 3 ว่ามี `scrypt` ใน `nodejs_compat` และใช้ CPU เท่าไร
- reset link ที่ส่งไปก่อน login ครั้งแรกหลังอัปเกรดจะใช้ไม่ได้ เพราะ hash เปลี่ยน (link ผูกกับ hash)
- โค้ดใน core ที่อ่านไฟล์หรือเปิด socket ต้องอยู่ใน `runtime/node/` และต้องมีทางเลือกสำหรับ runtime ที่ไม่มี disk
