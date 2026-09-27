# ADR-0013: Live preview

- **สถานะ:** Accepted
- **วันที่:** 2026-09-27

## บริบท

ผู้แก้ไขต้องเห็นว่าเนื้อหาจะแสดงบนเว็บอย่างไรก่อนเผยแพร่ ADR-0012 ทำให้เก็บฉบับร่างแยกจากเวอร์ชันที่เผยแพร่ได้แล้ว แต่การต้องบันทึกทุกครั้งเพื่อดูผลช้าเกินไป และจะสร้างเวอร์ชันขยะในประวัติ

## การตัดสินใจ

- **`preview: ({ doc, locale }) => url | null`** ต่อ collection/global บอกหน้าที่แสดงเอกสาร (path บน origin ของเว็บ หรือ URL เต็ม) ส่วน admin schema ส่งไปแค่ flag `preview: boolean` เพราะฟังก์ชันส่งไปฝั่ง browser ไม่ได้ URL จึงคำนวณที่ server
- **ไม่บันทึกระหว่างพิมพ์:** `cms.preview(collection, id | null, data)` / `previewGlobal` ต่อข้อมูลในฟอร์มเข้ากับสถานะปัจจุบัน (รวมฉบับร่างที่รออยู่) แปลงค่าแบบเดียวกับการบันทึก (ไม่บังคับ required และค่าที่ไม่ผ่าน validation ก็ยังเก็บไว้) แล้วส่งผ่าน `output()` เพื่อ populate relationship รัน `afterRead` และตัด field ตามสิทธิ์ เอกสารที่ได้จึงมีรูปเดียวกับการอ่านปกติ REST คือ `POST /:collection/:id/preview`, `POST /:collection/preview` และ `POST /globals/:slug/preview` โดยต้องมีสิทธิ์ update (หรือ create)
- **ส่งผ่าน `postMessage`:** admin โหลด iframe ครั้งเดียว จากนั้นส่ง `{ type: 'easy-cms:preview', doc }` ทุกครั้งที่ฟอร์มเปลี่ยน (debounce 300ms) โดยระบุ targetOrigin เป็น origin ของหน้านั้น หน้าเว็บส่ง `easy-cms:preview-ready` กลับมาเมื่อพร้อม ทำให้ไม่เสียข้อความแรก วิธีนี้ใช้ได้ทั้ง origin เดียวกันและต่าง origin โดยไม่ต้องมี token เพราะข้อมูลมากับข้อความ
- **Helper:** `@easy-cms/core/live-preview` (ไม่มี import ของ Node, ตรวจ origin ของผู้ส่ง, ถ้าไม่อยู่ใน frame จะไม่ทำอะไร) รวมถึง `useLivePreview(ref)` ของ Nuxt (auto-import) และ `useLivePreview(initial)` ของ Next (`@easy-cms/next/live-preview` ซึ่ง build พร้อม `'use client'`)
- **CSP ของ admin** เพิ่ม `frame-src 'self' http: https:` เพื่อให้ standalone แสดงเว็บที่อยู่คนละ origin ได้ ส่วน `frame-ancestors 'none'` ของ admin ยังเหมือนเดิม
- **Preview token** (เพิ่มในรอบเดียวกัน) สำหรับ frontend ที่อยู่คนละ origin ซึ่งไม่มี session ของ admin: token ลงลายเซ็น HMAC ด้วย `secret` ผูกกับ collection+id (หรือ global เดียว) และหมดอายุใน 1 ชั่วโมง admin เติม `easy-cms-preview=<token>` ลงใน URL ของ preview และ REST `GET /:collection/:id?preview=<token>` (กับ `/globals/:slug?preview=`) จะคืนฉบับร่างปัจจุบันของเอกสารนั้นโดยไม่ตรวจ read access เลือกผูก token กับเอกสารเดียวแทนการให้สิทธิ์อ่านฉบับร่างทั้งหมด เพื่อให้ลิงก์ที่หลุดออกไปเปิดเผยได้แค่เอกสารนั้นในเวลาสั้นๆ ส่วน Nuxt/Next ไม่ต้องใช้ token เพราะใช้ session cookie เดียวกับ admin

## ผลที่ตามมา

- ✅ เห็นผลทันทีโดยไม่ต้องบันทึก และไม่มีเวอร์ชันขยะในประวัติ
- ✅ ใช้ได้กับ frontend ทุกแบบที่ render จากข้อมูลได้
- ❌ หน้าเว็บต้อง render จากเอกสารที่ได้รับ (ถ้า render rich text ไว้ที่ server ต้องย้ายมาทำฝั่ง client ด้วย)
- ❌ URL ของ preview ที่มี token ต้องถือเป็นลิงก์แชร์ชั่วคราว (ใครได้ไปก็อ่านเอกสารนั้นได้จนกว่าจะหมดอายุ)
