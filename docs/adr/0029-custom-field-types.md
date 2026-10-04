# ADR-0029: ชนิด field ที่แพ็กเกจเพิ่มได้ (`fieldTypes`)

- **สถานะ:** Accepted
- **วันที่:** 2026-10-04

## บริบท

- field มีชนิดในตัว 16 ชนิด ถ้าอยากได้ "สี" หรือ "คะแนนดาว" ต้องใช้ `text`/`number` แล้วเพิ่ม `validate` และ `admin.component` เองทุก field
- plugin ทำได้แค่แก้ config (`(config) => config`) ไม่มีที่ให้ประกาศ `type` ใหม่ที่ใช้ซ้ำได้ทั้งโปรเจกต์
- ADR-0028 ทิ้งเรื่องนี้ไว้เป็นงานถัดไป

## การตัดสินใจ

- **ชนิดใหม่ต่อยอดจากชนิดฐาน ไม่เพิ่มการเก็บข้อมูลแบบใหม่**
  - `defineFieldType({ name, base, validate?, checkOptions?, admin?, typescript? })` และใส่ใน `config.fieldTypes`
  - `base` เป็นชนิด scalar ในตัวเท่านั้น: `text`, `textarea`, `email`, `number`, `boolean`, `date`, `json`
  - ตอน `resolveConfig` (หลัง plugin ก่อนตรวจ config) `applyFieldTypes` แปลง field เป็นชนิดฐานทั้งใน collection, global, group, array และ blocks
  - ฐานข้อมูล การค้นหา REST, localization, migration และ `generate:types` จึงไม่ต้องรู้จักชนิดใหม่เลย
  - ชื่อชนิดเก็บไว้ที่ `customType` และส่งให้ admin ใน schema
- **การตรวจค่า:** `validate` ของชนิดรันก่อน `validate` ของ field ไม่รันกับค่าว่าง (ให้ `required` ดูแล) และได้ `field` พร้อมตัวเลือกของ field
- **ตัวเลือกของ field** (เช่น `presets`) อยู่บน field ตรง ๆ
  - `checkOptions` ตรวจตอนโหลด config
  - `admin.props` เลือกว่าตัวเลือกไหนส่งให้ component เป็น `options`
- **ชื่อ:** ตัวพิมพ์เล็กขึ้นต้น ห้ามซ้ำชนิดในตัว ห้ามซ้ำกันเอง (เป็น config error) ชนิดที่ไม่ได้ใส่ใน `fieldTypes` ถือเป็น type ที่ไม่รู้จักตามเดิม
- **Admin:**
  - `admin.component` ของชนิดเป็นช่องกรอก ถ้า field ตั้งของตัวเองไว้จะใช้ของ field
  - เพิ่ม `admin.cell` (ใช้ได้กับทุก field) แสดงค่าในคอลัมน์ของหน้ารายการผ่าน `PluginElement` แบบอ่านอย่างเดียว
  - คอลัมน์ที่มี cell แสดงตั้งแต่แรกเมื่อผู้ใช้ยังไม่เคยเลือกคอลัมน์
  - `admin.module` ของชนิดถูกเพิ่มเข้า `admin.modules` ให้อัตโนมัติ (ไม่ซ้ำ)
- **TypeScript:** module augmentation ของ `interface CustomFieldTypes { name: { value; options } }`
  - `Field` รวม `CustomField` ที่สร้างจาก interface นี้ จึงตรวจตัวเลือกได้ และ `FieldValue` อนุมานค่าจาก `value`
  - `generate:types` ใช้ `typescript` ของชนิด
- **แพ็กเกจใหม่ `@easy-cms/fields`** มี `color` เป็นชนิดแรก
  - ฐาน `text` ค่า `#rrggbb` หรือ `#rrggbbaa` เมื่อ `alpha: true` ตัวเลือก `presets`
  - `ecms-color-field`: ตัวเลือกสีของ browser ช่องพิมพ์รหัสสี และปุ่มสีแนะนำ (ตัวเลือกสีไม่มี alpha จึงคงค่า alpha เดิมไว้)
  - `ecms-color-cell`: จุดสีบนพื้นลายตาราง (เห็นความโปร่งใส) คู่กับรหัสสี
  - `index.ts` import core แค่ type เพื่อไม่ดึงโค้ดฝั่ง server เข้า bundle (บทเรียนจาก ADR-0028)
- ตัวอย่างทั้งสามมี `color` ในหมวดหมู่ พร้อม migration

## ผลที่ตามมา

- ✅ แพ็กเกจเพิ่มชนิด field ได้โดยไม่ต้องแก้ database adapter และเอาแพ็กเกจออกแล้วข้อมูลยังอยู่ (เป็นค่าของชนิดฐาน)
- ✅ `admin.cell` ใช้กับ field ธรรมดาได้ด้วย
- ⚠️ ชนิดใหม่เป็นชนิดฐานใน REST และ schema (`type: 'text'`, `customType: 'color'`) client ที่อ่าน schema ต้องดู `customType` ถ้าอยากรู้ชนิดจริง
- ❌ ยังสร้างชนิดที่มีโครงสร้างเอง (เช่น field ย่อยหรือตารางแยก) ไม่ได้ ต้องใช้ `json` เป็นฐาน
