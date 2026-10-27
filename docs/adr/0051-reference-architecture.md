# ADR-0051: สถาปัตยกรรมอ้างอิงสำหรับ production ขนาดใหญ่

- **สถานะ:** Accepted
- **วันที่:** 2026-10-18

## บริบท

- องค์กรที่จะ self-host ต้องรู้ว่า setup แบบไหนที่โปรเจกต์ทดสอบและรับรอง ตอนนี้เอกสารบอกว่าใช้ได้ทุกแบบ (SQLite หรือ Postgres, local disk หรือ S3, instance เดียวหรือหลาย instance) แต่ไม่มีเอกสารเรื่องการรันหลาย instance และไม่มีเทสต์แบบนั้นใน CI
- จุดที่ผูกกับเครื่องเดียว:
  - SQLite เขียนได้ทีละ process
  - storage แบบ local เขียนไฟล์ลงดิสก์ของเครื่อง
  - scheduler เป็น `setInterval` ใน process และ `runScheduled` อ่านแล้วอัปเดตโดยไม่ล็อก จึงรันซ้ำได้เมื่อมีหลาย instance
  - rate limit ของอีเมลทดสอบอยู่ใน `Map` ในหน่วยความจำ
- ที่แยกจากเครื่องอยู่แล้ว: session, rate limit ของ login, คิว webhook และ audit log อยู่ในฐานข้อมูล
- เป้าหมายขนาด (ตกลงในการวางแผน 1.x): 1M เอกสารต่อ collection, editor พร้อมกัน 200 คน, API p95 ต่ำกว่า 200 ms

## การตัดสินใจ

- **สถาปัตยกรรมอ้างอิง** ที่ทดสอบใน CI และรับรองว่า scale แนวนอนได้:
  - Postgres (รวมถึงหลัง PgBouncer หรือ RDS Proxy แบบ transaction pooling)
  - storage แบบ S3 (S3, R2, MinIO)
  - app แบบ stateless N instance หลัง load balancer, ไม่ต้องใช้ sticky session
  - CDN อยู่หน้าเว็บและ API อ่านแบบ public (ดู [ADR-0054](./0054-http-cache-not-redis.md))
- **SQLite และ local disk** ยังรองรับเต็มที่สำหรับ dev, เว็บเล็ก และ instance เดียว แต่เอกสารต้องบอกชัดว่าไม่รองรับหลาย instance
- **สิ่งที่ต้องเป็นจริงก่อนเรียกว่ารองรับ:**
  - งานเบื้องหลังล็อกข้าม instance (ดู [ADR-0052](./0052-postgres-job-queue.md))
  - CI มีเทสต์ที่รัน 2 instance บน Postgres เดียวกัน
  - เทสต์กับ PgBouncer แบบ transaction pooling และตั้ง `prepare` กับขนาด pool ได้ (postgres.js ใช้ prepared statement โดยปริยาย)
  - `/healthz` และ `/readyz` มีในทุก adapter ไม่ใช่แค่ standalone
  - log เป็น JSON และมี request id
  - Docker image อย่างเป็นทางการ
- **ไม่ทำ:** multi-region, read replica และฐานข้อมูลอื่นนอกจาก Postgres และ SQLite จนกว่าจะมีผู้ใช้ที่ต้องการจริง

## สถานะ (2026-10-26)

ข้อกำหนดก่อนเรียกว่ารองรับครบแล้ว:

- งานเบื้องหลังล็อกข้าม instance ด้วย `SKIP LOCKED` (#153, [ADR-0052](./0052-postgres-job-queue.md))
- CI รัน 2 instance บน Postgres และ bucket เดียวกัน หลัง proxy แบบ round-robin (#154, job `multi-instance`)
- เทสต์ผ่าน PgBouncer แบบ transaction pooling และตั้ง `prepare`, timeout, `applicationName` ได้ (#155, job `pgbouncer`)
- log เป็น JSON และมี request id (#157)
- `<api>/healthz` และ `<api>/readyz` ในทุก adapter (#158)
- Docker image อย่างเป็นทางการ `ghcr.io/maritonx/easy-cms` (#159)
- เอกสาร: หน้า Reference architecture (`website/guide/deploy/production.md`, #160)

- HTTP cache ของการอ่านแบบสาธารณะ (`httpCache`: `s-maxage`, `ETag`, cache tag และ purge) ให้ CDN ใช้ได้ (#174)

ที่ยังเหลือ: ตัวเลขที่ 1M เอกสารรอ load test ทุกคืน (#161)

## ผลที่ตามมา

- ✅ องค์กรมีคำตอบชัดว่าต้องเตรียมอะไร และโปรเจกต์ทดสอบแค่ชุดที่รับรอง แทนการรองรับทุกชุดแบบผิวเผิน
- ✅ งานใน 1.1 (hardening) มีเกณฑ์ว่าเสร็จเมื่อไหร่
- ⚠️ ทุกการเปลี่ยนแปลงในอนาคตต้องไม่เก็บ state ในหน่วยความจำของ process ยกเว้นเป็น cache ที่หายได้
- ❌ ยังไม่มี: multi-region, read replica, MySQL/MSSQL/Oracle
