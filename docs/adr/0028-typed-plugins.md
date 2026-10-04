# ADR-0028: type ของสิ่งที่ plugin เพิ่ม (`definePlugin`)

- **สถานะ:** Accepted
- **วันที่:** 2026-10-04

## บริบท

type ของเอกสารอนุมานจาก `collections` ใน config แต่ plugin เป็นแค่ `(config) => config` จึงมองไม่เห็นในระดับ type
- `post.meta` (SEO), `page.path` / `page.breadcrumbs` (nested docs) และ collection `redirects` / `forms` ไม่มี type
- ตัวอย่างและผู้ใช้ต้อง cast หรือใช้ spread หลบ type (6 จุดในตัวอย่าง)
- `generate:types` รัน plugin ก่อนสร้างไฟล์ จึงมี field เหล่านี้ แต่เป็น interface แยก ไม่ได้ผูกกับ `cms.find()`

## การตัดสินใจ

- **ใช้การอนุมานต่อ ไม่บังคับให้รันคำสั่งสร้าง type**
  - plugin แนบ `PluginTypes` ไว้ในระดับ type ด้วย `definePlugin<T>(fn)` (ตอนรันคืนฟังก์ชันเดิม)
  - เก็บผ่าน property ที่มีแค่ใน type (`unique symbol` ที่ไม่มีค่าตอนรัน) ใน `TypedPlugin<T>`
- **`PluginTypes` มีสามส่วน:**
  - `fields`: field ที่เพิ่มให้ collection ระบุตาม slug
  - `globalFields`: field ที่เพิ่มให้ global ระบุตาม slug
  - `collections`: collection ทั้งตัวที่ plugin เพิ่ม
  - field เขียนในรูปเดียวกับ field ของ config ระบบจึงใช้ `FieldValue` เดิมได้ทั้งหมด
- **infer.ts รวมสิ่งที่ plugin ประกาศเข้าไป:**
  - อ่าน `C['plugins']` แล้วดึง `T` ของแต่ละ plugin
  - เพิ่ม field เข้ากับ collection หรือ global ตาม slug (`WithPluginFields`)
  - เพิ่ม collection ของ plugin เข้าไปใน `AllCollections` และ `CollectionSlug`
  - ขยาย constraint ของ `InferCollection` / `InferGlobal` ให้รับโครงที่มีแค่ `fields` / `drafts`
- **ตัวเลือกที่ไม่ใช่ค่า literal** (เช่นตัวแปร `string[]`) ทำให้ key ของ map เป็น `string` กรณีนี้จะไม่เพิ่ม field ให้เลย แทนที่จะเพิ่มให้ทุก collection
- **plugin ทางการใช้ const generic เฉพาะรายชื่อ** (collections, globals, slugs, ชื่อ field)
  - ไม่ใช้ generic กับ options ทั้งก้อน เพราะจะทำให้ callback ใน options เช่น `generateTitle` ไม่ได้ type ของพารามิเตอร์ (พบตอนทำ)
  - SEO → `meta`, nested docs → `parent` / `path` / `breadcrumbs` (ตามชื่อใน option `fields`), redirects → collection พร้อม `to_<slug>` (แปลงขีดเป็นขีดล่างด้วย template literal type), form builder → `forms` และ `form-submissions` (ไม่รวม `rateKey` ที่ไม่มีใครอ่านได้)
  - `fields` ของฟอร์มประกาศเป็น `json` เพราะ blocks ของช่องกรอกซับซ้อน และใช้ผ่าน client อยู่แล้ว
- **plugin-seo ไม่ import `definePlugin` เป็นค่าจริง** แต่ cast เป็น `TypedPlugin` แทน
  - เพราะ `seoMeta()` จากแพ็กเกจเดียวกันรันใน browser ด้วย การ import ค่าจาก core จะดึง core ที่ใช้ `node:crypto` เข้า bundle ฝั่ง client (e2e ของ Nuxt จับได้)
  - plugin ที่มีโค้ดฝั่ง browser ควรทำแบบเดียวกัน
- **helper ของ plugin รับ `EasyCMS<C>` แบบ generic** (`findByPath`, `getTree`, `rebuildNestedDocs`)
  - `findByPath` คืน `DocumentOf<C, S>`
  - core export `DocumentOf` และ `SlugOf` สำหรับ helper ลักษณะนี้
- **กันไม่ให้ type กับตอนรันไม่ตรงกัน:** เทสต์ของแต่ละ plugin ตรวจทั้ง type (`expectTypeOf`) และรายชื่อ field ตอนรันเทียบกับรายชื่อใน type

## ผลที่ตามมา

- ✅ field และ collection ของ plugin มี type โดยไม่ต้องรันคำสั่งเพิ่ม และตัวอย่างไม่มี cast เหลือแล้ว
- ✅ plugin ของคนอื่นใช้วิธีเดียวกันได้ (หัวข้อ "Typing your plugin" ในเอกสาร)
- ⚠️ ถ้าผู้ใช้แก้ field ของ plugin ด้วย option (เช่น `seoPlugin({ fields })`) type จะยังเป็นค่าเริ่มต้น
- ⚠️ type ของ plugin ทางการเขียนแยกจากโค้ดที่สร้าง field จึงต้องแก้คู่กัน มีเทสต์คอยจับถ้าไม่ตรง
- ❌ ยังไม่รองรับ field type ใหม่ที่ plugin สร้างเอง (งานถัดไป)
