# ADR-0053: outbox สำหรับ afterChange และ webhook

- **สถานะ:** Accepted (opt-in ใน 1.x, เป็นค่าปริยายใน 2.0)
- **วันที่:** 2026-10-18

## บริบท

- hook รันนอก transaction ของฐานข้อมูล (`website/guide/hooks.md`): `afterChange` เห็นเอกสารที่บันทึกแล้ว และถ้าช้าก็ทำให้ response ช้า
- ผลคือข้อมูลกับ side effect ไม่ตรงกันได้สองทาง: บันทึกสำเร็จแต่ `afterChange` ล้ม (ส่งอีเมลไม่ออก, ไม่ได้ purge cache) หรือ process ตายระหว่างบันทึกกับ hook
- เปลี่ยนพฤติกรรมของ hook ตอนนี้เลยจะผิดสัญญาความเสถียรของ 1.0 (ROADMAP §1) เพราะมีโค้ดของผู้ใช้ที่พึ่งว่า `afterChange` รันทันทีใน request เดียวกัน

## การตัดสินใจ

- **outbox:** เมื่อเปิดใช้ การบันทึกเอกสารจะเพิ่มงาน `afterChange` และ webhook ลงในคิว ([ADR-0052](./0052-postgres-job-queue.md)) ใน transaction เดียวกัน แล้ว worker รันหลัง commit พร้อม retry
- `before*` hook ยังรันก่อนบันทึกเหมือนเดิม
- **1.x:** เปิดด้วย `outbox: true` ใน config ([#178](https://github.com/maritonx/easy-cms/issues/178)) ค่าปริยายยังเป็นแบบเดิม
- **2.0:** outbox เป็นค่าปริยาย พร้อมคู่มืออัปเกรดและทางเลือกกลับไปแบบเดิมได้ต่อหนึ่ง major
- hook ที่รันผ่าน outbox ต้องทำซ้ำได้โดยไม่เสียหาย (idempotent) เพราะ retry ได้ เอกสารต้องเขียนเรื่องนี้ไว้ชัด

## วิธีทำ (#178)

- **transaction:** adapter ไม่มี API transaction ทั่วไป `create`, `update`, `delete` และ `updateGlobal` จึงรับ `outbox` (แถวที่คำนวณจาก id ของเอกสารที่เขียน) แล้วเขียนแถวนั้นใน transaction เดียวกัน adapter ที่ทำได้ประกาศ `outbox: true` ส่วนแบบที่ทำไม่ได้จะเริ่มระบบไม่ขึ้นถ้าเปิด outbox
  - ฉบับร่างของเอกสารที่เผยแพร่แล้วบันทึกเป็น version: แถวจึงเขียนไปพร้อมกับ version
- **ตาราง `outbox`:** หนึ่งแถวต่อการบันทึก เก็บ event, เอกสารตามที่บันทึก, เอกสารก่อนหน้า และ user ณ ตอนนั้น (ไม่เก็บ password hash) จะเขียนก็ต่อเมื่อมีอะไรต้องรัน (มี hook, webhook หรือ purge)
- **worker:** รันทันทีหลังบันทึกใน process เดิมแบบเบื้องหลัง และรันกับงานตามเวลาด้วย หยิบแถวแบบ compare-and-set มี lease 5 นาทีตาม ADR-0052 ลำดับคือ hook → webhook (นับว่าเสร็จเมื่อบันทึกลงคิว `webhook-deliveries` แล้ว) → purge ขั้นที่สำเร็จจะบันทึกไว้ใน `done` เพื่อไม่ให้ retry รันซ้ำ
- **retry:** 1 นาที, 5 นาที, 30 นาที, 2 ชั่วโมง, 12 ชั่วโมง จากนั้นเป็น `failed` และแสดงใน ตั้งค่า → งานเบื้องหลัง → Outbox ให้ admin กดลองใหม่
- hook ที่รันจาก outbox ได้ `context` ว่าง เพราะ context ของ request serialize ไม่ได้เสมอไป

## ผลที่ตามมา

- ✅ บันทึกสำเร็จเท่ากับ side effect จะเกิดแน่ (อย่างน้อยหนึ่งครั้ง)
- ✅ response ไม่ต้องรอ hook ที่ช้า
- ⚠️ `afterChange` ไม่ได้รันใน request เดียวกันอีกต่อไป โค้ดที่แก้ response หรือคาดว่าผลเห็นทันทีต้องเปลี่ยน
- ⚠️ ต้องรอ ADR-0052 เสร็จก่อน
- ❌ ไม่ใช่ exactly-once: hook ต้องจัดการการรันซ้ำเอง
