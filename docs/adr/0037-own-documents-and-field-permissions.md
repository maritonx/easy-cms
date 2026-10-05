# ADR-0037: เฉพาะเอกสารของตัวเอง และสิทธิ์ระดับ field ในบทบาท

- **สถานะ:** Accepted
- **วันที่:** 2026-10-05
- **ต่อจาก:** [ADR-0036](0036-roles-from-the-admin.md)

## บริบท

- บทบาทใน 0.33 ให้สิทธิ์ทั้ง collection เท่านั้น ส่วน "นักเขียนแก้ได้แค่บทความของตัวเอง" และ "ซ่อน field ราคาจากบางบทบาท" ยังต้องเขียน `access` ในโค้ด
- ระบบยังไม่รู้ว่าใครสร้างเอกสาร (versions เก็บ `author` เฉพาะ collection ที่เปิด versions)
- กฎ `access.read` ระดับ field ในโค้ดซ่อนค่าจาก response แต่ยังใช้ field นั้นใน `where` และ `sort` ได้ จึงเดาค่าที่ซ่อนอยู่ได้

## การตัดสินใจ

- **`createdBy` เฉพาะเมื่อเปิด `auth.rbac`:** field relationship ไปที่ users เพิ่มให้ทุก collection ยกเว้น users (`CREATED_BY_FIELD`) Easy CMS ตั้งค่าตอนสร้างจาก user ของ request ส่วน request แก้เองไม่ได้ (field access `update: false`) Local API แบบ trusted ตั้งเองได้สำหรับ import โปรเจกต์ที่ไม่เปิด rbac schema ไม่เปลี่ยน ถ้า collection มี field ชื่อ `createdBy` อยู่แล้วจะแจ้ง config error
- **`admin.ownerField`:** ชี้ไปที่ relationship ไป users แบบค่าเดียว เช่น `author` ใช้แทน `createdBy` เป็นเจ้าของ ถ้าว่างตอนสร้างเติมเป็นผู้สร้าง บทบาทที่แก้ได้เฉพาะของตัวเองจะได้ field นี้เป็นอ่านอย่างเดียว (ยกเอกสารให้คนอื่นหรือแย่งของคนอื่นไม่ได้)
- **"เฉพาะของตัวเอง" ต่อ operation:** `permissions.own: { [slug]: ['read' | 'update' | 'delete' | 'publish'] }` ใช้คู่กับ `collections` (ต้องได้ operation นั้นก่อน) ไม่มีที่ create, users และ globals ตรวจด้วย where `{ [owner]: { equals: user.id } }` ผ่านกลไกเดียวกับบัญชีของตัวเองใน 0.33 การเผยแพร่ซึ่งเดิมตรวจแค่ระดับ collection มี `checkDocumentGrant` ตรวจเอกสารนั้นด้วย
- **สิทธิ์ระดับ field:** `permissions.fields: { collections: { [slug]: { [field]: 'read' | 'hidden' } }, globals: … }` เฉพาะ field ชั้นบนสุด (field ย่อยตามตัวแม่) field ที่ไม่ได้ตั้งตามสิทธิ์ของแถว จึงเก็บเฉพาะที่ต่างจากค่าเริ่มต้น ตรวจใน `FieldAccessChecker` ร่วมกับ `access` ในโค้ด (AND) โดยระบุ field ด้วยตัว object ของ config ทำให้ใช้ได้ทั้ง collection หลักและเอกสารที่ populate
- **field ที่บังคับกรอกและไม่มีค่าเริ่มต้น** ตั้งเป็นอ่านอย่างเดียวหรือซ่อนไม่ได้ สำหรับบทบาทที่สร้างเอกสารได้ (ตรวจตอนบันทึกบทบาท 400)
- **ห้ามกรองและเรียงด้วย field ที่อ่านไม่ได้** (403) ทั้งจากกฎของบทบาทและ `access.read` ในโค้ด ตรวจทุก segment ของ path ผ่าน group, array และ blocks ส่วน `/admin/schema` ไม่ส่ง field ที่อ่านไม่ได้ หน้า admin จึงไม่มีช่อง คอลัมน์ หรือตัวกรองของ field นั้น
- **เติม `createdBy` ให้เอกสารเดิม** ตอนใช้งานครั้งแรก (พร้อมการสร้างบทบาทตั้งต้น) จากผู้บันทึก version แรก เฉพาะ collection ที่ยังไม่มีเอกสารไหนมี `createdBy` จึงทำครั้งเดียว ทำในไฟล์ migration ไม่ได้เพราะ migration เป็น SQL ที่สร้างจาก schema
- **ลบผู้ใช้:** `transferTo` โอน `createdBy` และ `ownerField` ของทุก collection ให้ผู้ใช้อีกคน ถ้าไม่ระบุ (หรือ `none`) เป็น `null` (ไม่มีเจ้าของ) แทนการเก็บ id เดิม เพราะ relationship ที่ชี้ไปผู้ใช้ที่ถูกลบจะทำให้บันทึกเอกสารนั้นไม่ผ่านการตรวจ reference snapshot ใน versions ไม่แก้ หน้า admin เรียก `GET /admin/owned/:userId` แล้วบังคับให้เลือกคนรับก่อนลบ

## ผลที่ตามมา

- ✅ "นักเขียนแก้ได้เฉพาะของตัวเอง" และ "ซ่อน field จากบางบทบาท" ตั้งได้จากหน้า admin โดยไม่ต้องเขียนโค้ด
- ✅ ปิดช่องเดาค่าของ field ที่ซ่อนผ่าน `where`/`sort` (รวมกฎในโค้ดเดิม)
- ⚠️ โปรเจกต์ที่เปิด rbac ต้อง migrate คอลัมน์ `created_by` ทุก collection ครั้งเดียว
- ⚠️ การกรองด้วย field ที่อ่านไม่ได้ซึ่งเคยทำได้ ตอนนี้ตอบ 403
- ❌ สิทธิ์ของ field ย่อยใน group/array/blocks และการกำหนดเจ้าของทีละหลายเอกสารยังไม่มี
