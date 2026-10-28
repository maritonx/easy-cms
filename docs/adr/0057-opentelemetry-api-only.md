# ADR-0057: OpenTelemetry ผ่าน `@opentelemetry/api` อย่างเดียว ไม่ bundle SDK

- **สถานะ:** Accepted
- **วันที่:** 2026-10-28

## บริบท

- Easy CMS มี log แบบ JSON พร้อม request id (1.6) และ health check (1.7) แต่ยังไม่มี trace หรือ metric
- ตอนวัด 1M เอกสาร ([#161](https://github.com/maritonx/easy-cms/issues/161)) ต้องไล่ access log เองว่า query แบบไหนถือ connection นาน
- ทีมที่ self-host ใช้ backend ต่างกัน (Jaeger, Grafana, Datadog, X-Ray…) และ Next.js มี OpenTelemetry ของตัวเองอยู่แล้ว
- NFR-PERF-05: ฟีเจอร์ที่ไม่ได้เปิดต้องไม่เพิ่มงานต่อ request

## การตัดสินใจ

- **ใช้แค่ `@opentelemetry/api`** เป็น optional peer dependency (แบบเดียวกับ `sharp`) แอปเป็นคนตั้งค่า SDK และ exporter (`instrumentation.ts`, `@vercel/otel`, `NodeSDK` ผ่าน `--import`)
- **เปิดด้วย `telemetry: true`** (หรือ `{ traces, metrics }`) ถ้าไม่เปิด จะไม่โหลด package และไม่ทำงานเพิ่ม ถ้าเปิดแต่ไม่ได้ติดตั้ง จะหยุดตอนเริ่มด้วย ConfigError
- **span สามชั้น:** request (server span หรือ span ใน span ของ framework), Local API และการเรียก `Database` ซึ่งครอบด้วย Proxy จึงใช้ได้กับทุก adapter ส่วน SQL ทีละคำสั่งเป็นหน้าที่ของ instrumentation ของ driver
- **งานเบื้องหลังมี span ของตัวเอง:** `jobs.run`, job แต่ละตัว และรายการใน outbox
- **ชื่อ ไม่ใช่ค่า:** attribute มีแค่ชื่อ collection, route แบบ template, operation, status และชนิดของ error ไม่มีค่าใน `where`, เอกสาร, query string หรือข้อมูลผู้ใช้
- **metric ตาม semantic conventions:** `http.server.request.duration`, `db.client.operation.duration` และของ Easy CMS เองใต้ `easy_cms.*` gauge ของคิวนับตอนงานรัน ไม่ใช่ตอน scrape
- **log ผูกกับ trace:** log แบบ JSON มี `traceId` และ `spanId` ของ span ที่ทำงานอยู่

## ผลที่ตามมา

- ✅ ไม่มี dependency หรือ infra เพิ่มสำหรับคนที่ไม่ใช้ และไม่ผูกกับ vendor
- ✅ trace ของ Easy CMS ต่อกับ trace ของหน้าเว็บใน Next.js ได้เลย
- ✅ ใช้ได้กับทุก database adapter โดย adapter ไม่ต้องแก้
- ⚠️ แอปต้องมี `@opentelemetry/api` ชุดเดียว สองชุดที่ minor ต่างกันอาจมองไม่เห็น SDK ของกัน
- ⚠️ ไม่มี span ระดับ SQL จาก Easy CMS เอง
- ❌ การส่ง webhook และอีเมลยังไม่มี span ของตัวเอง (อยู่ในเวลาของ `jobs.run`)
