# ADR-0016: Blocks field และ localized array / hasMany

- **สถานะ:** Accepted
- **วันที่:** 2026-09-27

## การตัดสินใจ

**Blocks**
- field ชนิด `blocks` มี `blocks: [{ slug, labels, fields }]` แต่ละแถวเป็น `{ id, blockType, ...fields }`
- **เก็บเป็นคอลัมน์ JSON** แทนตารางลูกหนึ่งตารางต่อชนิดบล็อก เพราะแถวต่างชนิดกันแต่ต้องรักษาลำดับร่วมกัน ส่วน schema และ migration ก็ไม่ต้องเปลี่ยนเมื่อเพิ่มชนิดบล็อก ข้อเสียคือใช้ใน where/sort ไม่ได้
- ตัวไล่ field ทุกตัว (validate, ค่าเริ่มต้น, slug, สิทธิ์ของ field, populate, localization) ใช้ `hasRows()` / `rowFields()` ร่วมกับ array ทำให้ relationship/upload ในบล็อก populate ได้ และ field ในบล็อกแปลได้ ส่วน type ที่สร้างเป็น union ตาม `blockType`

**Localized array / hasMany**
- ตารางลูกของ field ที่ localized มีคอลัมน์ `_locale` (ค่าเริ่มต้นเป็นภาษาเริ่มต้น ทำให้แถวเดิมยังอยู่เมื่อเปิด localized) ชั้น database คืนค่าเป็น `{ [locale]: rows }` จึงใช้ `pickLocale`/`toLocaleMaps` ชุดเดิม id ของแถวถูกเก็บเป็น `<id>:<locale>` เพื่อไม่ให้ชนกันข้ามภาษา และตัดส่วนภาษาออกก่อนคืนค่า
- where ระบุภาษาได้ (`tags.en`, `faq.en.question`) ส่วน field ข้างใน list ที่ localized แล้วห้ามตั้ง localized ซ้ำ
- `blocks` ที่ localized เก็บเป็นคอลัมน์ JSON ต่อภาษา เหมือน field scalar

## ผลที่ตามมา

- ✅ ปิดข้อจำกัดของ localization ที่เหลือ และลูกค้าจัดหน้าเองได้
- ✅ inferred type ของ array/blocks/group/hasMany เป็นค่าที่มีเสมอ (ไม่ใช่ null) ตรงกับข้อมูลจริงและ typegen
- ~~❌ ค้นหาข้อมูลข้างในบล็อกไม่ได้~~ แก้แล้วใน [ADR 0017](./0017-durable-webhooks-block-queries-locale-moves.md)
