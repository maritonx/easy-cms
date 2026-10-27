# ADR-0056: search เป็น adapter แบบเลือกใช้ ค่าเริ่มต้นยังไม่ต้องมี search engine

- **สถานะ:** Accepted
- **วันที่:** 2026-10-27

## บริบท

- การค้นตอนนี้ใช้ `like` ทีละ field ร่วมกับ `index: 'trigram'` บน Postgres (#176) ซึ่งค้นไทยได้และเร็วที่ 1M เอกสาร
  (p95 69ms) แต่ไม่เรียงตามความเกี่ยวข้อง ค้นข้ามหลาย field หรือหลาย collection ในครั้งเดียวไม่ได้
  และคำสั้นๆ ทั้งเว็บยังช้า
- การเรียงตามความเกี่ยวข้องต้องมี engine ที่ตัดคำ (รวมถึงคำไทยที่ไม่เว้นวรรค) และให้คะแนน
- หลักของ 1.x คือไม่เพิ่ม infra ([ADR-0051](./0051-reference-architecture.md),
  [ADR-0052](./0052-postgres-job-queue.md), [ADR-0054](./0054-http-cache-not-redis.md))
- Postgres full-text search ตัดคำไทยไม่ได้

## การตัดสินใจ

- **`SearchAdapter` ใน core:** `index`, `remove`, `clear`, `search` และ `setup` / `describe`
  ที่ไม่บังคับ core แปลงเอกสารเป็นข้อความล้วนต่อ field (rich text, array, group, block) ให้
  adapter จึงไม่ต้องรู้จัก field ของ Easy CMS
- **เลือกใช้ต่อ collection:** `search: { fields }` เรียง field จากสำคัญที่สุด และ index เฉพาะฉบับ
  publish
- **index ตอนบันทึก:** อ่านเอกสารใหม่หลัง commit แล้ว index หรือลบ การรันซ้ำหรือช้าจึงไม่เสียหาย
  ถ้าเปิด outbox ([ADR-0053](./0053-outbox-for-after-hooks.md)) จะเป็นขั้น `search` ของ outbox
  ที่ retry จนสำเร็จ ถ้าไม่เปิดจะเป็น best effort แล้ว log และใช้ `easy-cms search:reindex` ซ่อม
- **สิทธิ์อยู่ที่ core:** engine คืนแค่ `{ collection, id }` แล้ว core อ่านเอกสารด้วย `find`
  ตามสิทธิ์ของผู้อ่าน หน้าหนึ่งจึงอาจได้น้อยกว่า `limit` และ `total` นับก่อนกรองสิทธิ์
- **adapter ตัวแรกคือ `memorySearch()`:** index ในหน่วยความจำ ตัดคำด้วย `Intl.Segmenter` (ICU
  ที่มีใน Node) สร้างใหม่ตอนเริ่ม process เหมาะกับ dev, test และเว็บเล็กที่รัน process เดียว
- **ยังไม่ทำ adapter ของ search engine ภายนอก** (Meilisearch ที่ตัดคำไทยด้วย charabia เป็นตัวเลือกแรก)
  แยกเป็นงานใน backlog ([#244](https://github.com/maritonx/easy-cms/issues/244)) จนกว่าจะมีคนต้องการ ค่าเริ่มต้นยังเป็น `like` + trigram ซึ่งไม่ต้องเพิ่ม infra

## ผลที่ตามมา

- ✅ ไม่มี infra เพิ่มสำหรับคนที่ไม่ใช้ search และ interface พร้อมให้เขียน adapter ของ engine ใดก็ได้
- ✅ สิทธิ์ อ่านฉบับ publish หลายภาษา และ depth ถูกต้องเสมอ เพราะผ่าน `find` ตัวเดียวกับ REST
- ✅ ทดสอบการตัดคำไทยได้ใน CI โดยไม่ต้องมี service เพิ่ม
- ⚠️ `memorySearch()` ใช้หน่วยความจำตามจำนวนเอกสาร และแต่ละ instance มี index ของตัวเอง
  ใน production จึง log คำเตือน
- ⚠️ ถ้าไม่เปิด outbox การ index ที่ล้มทำให้ index ค้างอยู่จนกว่าจะบันทึกใหม่หรือ reindex
- ❌ เว็บใหญ่หรือรันหลาย instance ยังไม่มี adapter สำเร็จรูป ต้องเขียนเองหรือรอ adapter ของ engine
