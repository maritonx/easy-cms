# ADR-0048: Multi-tenant ครบขึ้น: ไฟล์ โฟลเดอร์ plugin อื่น audit และการลบ

- **สถานะ:** Accepted
- **วันที่:** 2026-10-09

## บริบท

หลังปล่อย multi-tenant (ADR-0047) ยังมีช่องที่ข้อมูลข้าม tenant ได้และจุดที่ใช้ไม่ครบ:

- field upload บันทึก id ของสื่อจาก tenant อื่นได้ถ้ายิง API ตรงๆ
- key ของโฟลเดอร์ (`folder: 'banners'`) ใช้ร่วมกันทุก tenant
- nested-docs, redirects และ form-builder ยังไม่รู้จัก tenant: slug ของหน้าระดับบนชนกันข้าม tenant, redirect และฟอร์มหาข้ามทุก tenant และเอกสารที่ plugin สร้างเองไม่มี tenant
- admin ของ tenant เปิด audit log ไม่ได้
- การลบ tenant ไม่บอกผลกระทบ และตอนสร้างเอกสารช่อง tenant ยังว่าง

## การตัดสินใจ

- **core แบบกลาง (ใช้กับงานอื่นได้):**
  - `filterOptions` บน field upload (ตัวเลือกใน admin และตรวจตอนบันทึก)
  - `uniqueWithin` รับหลาย field (`['parent', 'tenant']`) พร้อม unique index ของทุกคอลัมน์ ชื่อ index แบบ field เดียวคงเดิม
  - `cms.uniqueScope(collection, field, { context })`: ค่าที่ field unique ภายในสำหรับการเรียกนี้ โดยรัน `beforeValidate` ของการสร้างกับเอกสารว่าง plugin จึงหาเอกสารด้วย key ใน tenant ที่ถูกได้โดยไม่ต้องรู้จัก plugin multi-tenant
  - โฟลเดอร์ตาม key หาและสร้างภายใน scope นั้น ถ้า scope ยังไม่ครบ (เช่น ทุก tenant) จะไม่สร้าง และ `media-folders` ใน config รวม field ชื่อเดียวกับของในตัวได้
  - `audit.scope(context)` เก็บใน `scope` ของ entry (ลงลายเซ็นเมื่อมีค่า entry เดิมจึงยังตรวจผ่าน) ผู้ใช้ที่ `scoped` เห็นเฉพาะ scope ของตัวเอง admin ที่ scoped เปิด audit ได้เมื่อมี `scope` ส่วนคนอื่นกรองตาม scope ของ context
  - `admin.confirmDelete { typeTitle, impact }` บน collection, `admin.defaultValue`, `admin.column`, `admin.allowCreate` บน field และคอลัมน์ relationship ในหน้ารายการ (แสดงชื่อเรื่องของเอกสารปลายทาง)
- **plugin ทางการ:**
  - nested-docs ตรวจ path และ `findByPath`/`getTree` ภายใน scope ของ slug (ยกเว้น parent)
  - redirects แยก cache และ resolve ตาม `uniqueScope` ของ `from` และ redirect อัตโนมัติได้ scope ของหน้า
  - form-builder หาฟอร์มตาม `uniqueScope` ของ slug และส่ง `context` ตอนบันทึกข้อมูลที่ส่งมา
- **plugin multi-tenant:**
  - กรอง field upload ไป media ของ tenant
  - เอกสารใหม่ที่ไม่มี tenant ใน context ได้ tenant ของเอกสารแรกที่ชี้ไป
  - key ของโฟลเดอร์ unique ต่อ tenant
  - ตั้ง `audit.scope`
  - tenants มี `confirmDelete` พร้อม `/tenant-impact`
  - field tenant ใส่ค่าเริ่มต้นจาก tenant ที่เลือก ไม่มีปุ่มสร้าง และเป็นคอลัมน์ในโหมดทุก tenant
  - `tenants:assign` ข้ามเอกสารที่ย้ายไม่ได้พร้อมรายงาน
- **ผู้ใช้ใส่ collection ของ plugin อื่นเอง** ใน `collections` และวาง multi-tenant หลัง plugin เหล่านั้น เพราะบางเว็บอาจอยากให้ redirect หรือฟอร์มใช้ร่วมกัน

## ผลที่ตามมา

- ✅ ปิดช่องที่ข้อมูลข้าม tenant ได้ทั้ง upload และโฟลเดอร์
- ✅ หน้าย่อย redirect และฟอร์มใช้ได้ต่อ tenant
- ✅ audit log ต่อ tenant
- ⚠️ โปรเจกต์ที่เปิด `audit` ต้องสร้าง migration (คอลัมน์ `scope`)
- ⚠️ `uniqueScope` รัน hook `beforeValidate` กับเอกสารว่าง hook ที่ต้องการข้อมูลจริงจะทำให้ scope ไม่รู้ค่า (ได้ `null`)
- ❌ ยังไม่มี: export/backup ทีละ tenant, webhook ต่อ tenant, ให้ tenant สมัครเอง, SSO ตามโดเมนอีเมล และลบ tenant แบบงานเบื้องหลัง
