# ADR-0015: Webhooks และการตั้งเวลาเผยแพร่

- **สถานะ:** Accepted
- **วันที่:** 2026-09-27

## บริบท

เว็บแบบ static หรือที่มี cache (SSG, ISR, CDN) ต้องรู้ว่าเนื้อหาเปลี่ยนเพื่อ rebuild หรือล้าง cache และทีมเนื้อหาต้องการตั้งเวลาเผยแพร่ล่วงหน้า hook ที่มีอยู่เป็นโค้ดใน config ซึ่งไม่ได้ช่วยเรื่องลายเซ็นหรือการส่งซ้ำ

## การตัดสินใจ

**Webhooks**
- `webhooks: [{ url, events?, collections?, globals?, secret?, headers? }]` ใน config
- event ได้แก่ `create`/`update`/`delete` (สิ่งที่เก็บในฐานข้อมูลเปลี่ยน), `publish`/`unpublish` (สถานะเปลี่ยน ส่งพร้อม create/update) และ `draft` (บันทึกเฉพาะฉบับร่าง สิ่งที่ออนไลน์ไม่เปลี่ยน) เพื่อให้ปลายทางเลือกได้ว่าจะ rebuild เมื่อไหร่ collection ภายในไม่ส่ง event
- body เป็นเอกสารที่เก็บไว้ (ทุกภาษา ไม่มี field ที่ hidden) ลงลายเซ็น `x-easy-cms-signature: sha256=<HMAC ของ body>` และมี `x-easy-cms-delivery` ที่เหมือนกันทุกครั้งที่ส่งซ้ำ ให้ปลายทางกันการทำงานซ้ำได้
- ส่งหลังบันทึกเสร็จโดยไม่รอ (ไม่ทำให้การบันทึกช้าหรือล้ม) timeout 10 วินาที ส่งซ้ำ 2 ครั้งเมื่อ network error, 429 หรือ 5xx ส่วน `flushWebhooks()` (และ `destroy()`) รอให้ส่งเสร็จ สำหรับ serverless

**การตั้งเวลา**
- `schedule: true` บน collection/global ที่มี drafts เก็บงานใน internal collection `scheduled-jobs` ที่ถูกเพิ่มเฉพาะเมื่อมีการใช้ (แบบเดียวกับ versions)
- งานรันผ่าน `updateDocument`/`unpublish` ปกติ จึงเผยแพร่ฉบับร่างที่รออยู่ และได้ hooks, versions และ webhooks ครบ ถ้าล้มจะบันทึกเป็น `failed` พร้อม error และไม่ลองใหม่
- ตัวรัน: server ที่รันต่อเนื่องจะตรวจทุกนาที (timer ที่ unref) ส่วน serverless ใช้ `GET <api>/jobs/run` ที่ยืนยันด้วย `Authorization: Bearer <cronSecret | CRON_SECRET>` ตามแบบ Vercel Cron หรือ admin และมีคำสั่ง `easy-cms run-scheduled`

## ผลที่ตามมา

- ✅ เว็บ static และ CDN ตามทันการเปลี่ยนแปลงได้ ตั้งเวลาได้ทั้งบน server และ serverless
- ❌ ถ้าหลาย instance รันงานพร้อมกัน งานเดียวกันอาจถูกทำซ้ำ (การเผยแพร่ซ้ำไม่มีผลเสีย แต่ webhook จะถูกส่งซ้ำ)
- ~~❌ การส่ง webhook อยู่ในหน่วยความจำ ถ้า process ดับระหว่างรอส่งซ้ำ event นั้นจะหาย~~ แก้แล้วใน [ADR 0017](./0017-durable-webhooks-block-queries-locale-moves.md)
