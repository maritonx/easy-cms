# ADR-0040: Deploy ด้วยคลิกเดียว (Vercel และ Netlify)

- **สถานะ:** Accepted
- **วันที่:** 2026-10-06

## บริบท

- การลองใช้ Easy CMS ต้องติดตั้งในเครื่องก่อน (`create-easy-cms`) ปุ่ม deploy คลิกเดียวช่วยให้คนเห็นของจริงบน production ได้เร็วขึ้น
- บน serverless ดิสก์ไม่ถาวร: PGlite และโฟลเดอร์ `uploads` ใช้ไม่ได้ ไฟล์อัปโหลดต้องอยู่ที่อื่น และ S3 ต้องสมัครบัญชีแยก
- ตัวอย่างใน repo อ้าง `workspace:^` จึง deploy นอก monorepo ไม่ได้
- เว็บที่เพิ่ง deploy เปิดหน้า setup admin คนแรกไว้ ใครเปิดเจอก่อนก็เป็น admin ได้

## การตัดสินใจ

- **template เดียว `templates/next-starter`** (Next.js blog + admin: posts, categories, media, SEO, roles, audit log) อ้างเวอร์ชันจาก npm ปุ่ม Vercel ใช้ `repository-url` แบบ subfolder ปุ่ม Netlify ใช้ `create_from_path` จึงไม่ต้องมี repo แยก
- **ตรวจแพลตฟอร์มจาก environment:** ฐานข้อมูลจาก `DATABASE_URL` (Neon จาก Vercel Marketplace) หรือ `NETLIFY_DB_URL` (Netlify Database ซึ่งสร้างให้อัตโนมัติเมื่อมี `@netlify/database`; Netlify DB เดิมที่ใช้ `@netlify/neon`/`NETLIFY_DATABASE_URL` สร้างใหม่ไม่ได้แล้วตั้งแต่เม.ย. 2026 แต่ยังอ่านค่าไว้ให้เว็บเก่า) ไม่มีก็ใช้ PGlite ตอนพัฒนา แต่บน Vercel/Netlify/Lambda ที่ไม่มีฐานข้อมูลจะหยุดพร้อมข้อความบอกวิธีแก้ แทนที่จะเขียน `.pglite` บนดิสก์ที่อ่านได้อย่างเดียว ไฟล์จาก `BLOB_READ_WRITE_TOKEN`/`VERCEL` หรือ `NETLIFY` (ใน function ดูจาก `Netlify` global ด้วย)
- **package ใหม่:** `@easy-cms/storage-vercel-blob` (public บน CDN หรือ private ผ่าน API, URL สร้างจาก store id ใน token) และ `@easy-cms/storage-netlify-blobs` (consistency แบบ strong เพราะอ่านทันทีหลังอัปโหลด เรียก `getStore` ทุกครั้งเพราะ Netlify ตั้ง context ต่อ request)
- **ปุ่ม Vercel** ใช้ `stores` สร้าง Neon และ Blob (public) ตามเอกสารของ Vercel (template ของ Neon ใช้พารามิเตอร์ `products` แทน จึงต้องยืนยันด้วยการ deploy จริง)
- **`auth.setupCode` / `EASY_CMS_SETUP_CODE` ใน core:** ถ้าตั้ง การสร้าง admin คนแรกต้องใช้รหัสนี้ (เทียบแบบ timing-safe จำกัดจำนวนครั้งต่อ IP) ใช้ได้กับทุกโปรเจกต์ เป็นช่องเดียวในฟอร์ม deploy
- **`EASY_CMS_SECRET` ใน template:** ถ้าไม่ได้ตั้ง สร้างจาก HMAC ของ URL ฐานข้อมูล ให้ deploy ได้ทันที ความลับเท่ากับรหัสผ่านฐานข้อมูล เอกสารแนะนำให้ตั้งเองเมื่อใช้จริง
- **build:** `easy-cms migrate` → seed ตัวอย่างเฉพาะเมื่อยังไม่มีบทความ (ตรวจ schema แบบ verify) → `next build` template มี migration ของตัวเอง
- **กันพัง:** `changeset version` ตามด้วย `scripts/sync-template.mjs` อัปเดตเวอร์ชันใน template ทุกรุ่น CI job `template` ทดสอบ template กับ package ของ commit นั้น (pack เป็น tarball, npm install, build, start, เช็กหน้า) ด้วย `scripts/check-template.mjs` ซึ่งใช้สร้าง migration ของ template ด้วย

## ผลที่ตามมา

- ✅ ลอง Easy CMS บน production ได้ในไม่กี่คลิก มีฐานข้อมูลและที่เก็บไฟล์ให้
- ✅ ปิดช่องแย่ง admin คนแรกสำหรับทุกการ deploy ที่ตั้งรหัส setup
- ✅ ทดสอบด้วยบัญชีจริงแล้วทั้งสองแพลตฟอร์ม (2026-10-06): deploy, บทความตัวอย่าง, สร้าง admin ด้วยรหัส setup, อัปโหลดรูป ระหว่างทดสอบพบและแก้ (0.37.1–0.37.2): Vercel ที่ยังไม่ได้ต่อ Blob store, Netlify DB เดิมสร้างไม่ได้แล้ว (เปลี่ยนเป็น Netlify Database) และ CSRF ที่เทียบ Origin กับ URL ภายในของ proxy (เทียบกับ `x-forwarded-host`/`host` ด้วย)
- ❌ ยังไม่มี template สำหรับ Nuxt และปุ่มบน easy-cms.io
