# ADR-0011: Standalone mode (`easy-cms serve`) และ CORS

- **สถานะ:** Accepted
- **วันที่:** 2026-09-27

## บริบท

v0.1 ทำงานได้เฉพาะภายใน Nuxt หรือ Next.js ผู้ใช้ Vite/React/Vue ล้วน หรือเว็บ static ใช้ Easy CMS เป็น backend ไม่ได้ ซึ่งเป็นกรณีหลักของโจทย์ตั้งต้น (ลูกค้าสร้างเว็บ Vue/React แล้วติดตั้ง Easy CMS เป็นหลังบ้าน) DESIGN วาง standalone ไว้ที่ v0.2

## การตัดสินใจ

- **อยู่ใน CLI (`easy-cms serve`)** ไม่แยก package ใหม่ เพราะ CLI โหลด config และ `.env` ได้อยู่แล้ว ส่วน standalone ใช้ `easy-cms` เป็น dependency (ไม่ใช่ dev) และ CLI พึ่ง `@easy-cms/admin`
- **Handler เดียวแบบ Web-standard** (`createStandaloneHandler`) รวม REST (`routes.api`), admin (`admin.path`), `/healthz` และ redirect `/` ไป admin แล้วต่อกับ `node:http` ด้วยตัวแปลงเล็กๆ (ไม่เพิ่ม dependency) จึงนำไปใช้กับ Bun/Deno/Hono ได้
- **CORS อยู่ใน core** (`cors` ใน config) เพื่อให้ Nuxt/Next ได้ด้วย origin ใน `cors` เรียกแบบไม่มี cookie ได้ ส่วน origin ใน `auth.trustedOrigins` ได้ `allow-credentials` ด้วย preflight ตอบก่อนตรวจ auth และ CSRF ยังบังคับ origin ที่ trusted สำหรับการเขียนด้วย cookie เหมือนเดิม
- **`--watch`** สร้าง instance ใหม่เมื่อไฟล์ `.ts/.js` ในโปรเจกต์เปลี่ยน (ยกเว้น node_modules, uploads, build output) ถ้า config ใหม่ผิดให้ใช้ของเดิมต่อ แทนการ restart process
- **`--trust-proxy`** ใช้ `X-Forwarded-For` (rate limit การ login) และ `X-Forwarded-Proto` (cookie `Secure`) ตามที่ adapter อื่นทำ
- `create-easy-cms`: โฟลเดอร์ใหม่หรือว่างให้เป็น standalone อัตโนมัติ แต่โปรเจกต์ที่มีอยู่แล้วที่ไม่ใช่ Nuxt/Next ต้องใส่ `--standalone` หรือตอบยืนยันใน terminal (`--yes` ไม่พอ) เพื่อไม่ให้ใส่ package ฝั่ง server ลงในโปรเจกต์ frontend โดยไม่ตั้งใจ
- e2e: ชุดทดสอบ admin ชุดเดิมรันกับ standalone เป็นแอปที่สาม โดยใช้หน้า frontend ตัวอย่างบนอีก origin แทน "public site" จึงทดสอบ CORS จากเบราว์เซอร์จริง

## ผลที่ตามมา

- ✅ ใช้เป็น backend ของ frontend ใดก็ได้ และ deploy เป็น container เดียวได้
- ✅ Nuxt/Next ได้ CORS ไปด้วย
- ❌ ยังไม่มี Local API แบบ typed ข้าม process: frontend ใช้ REST + `generate:types`
- ❌ `--watch` reload เฉพาะไฟล์ JS/TS ไม่ดู `.env`
