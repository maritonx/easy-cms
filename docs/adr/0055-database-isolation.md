# ADR-0055: ระดับการแยกฐานข้อมูลจากแอปหลัก

- **สถานะ:** Accepted
- **วันที่:** 2026-10-18

## บริบท

- Easy CMS สร้างตารางในฐานข้อมูลของแอป (prefix `ecms_`, ADR-0003) ซึ่งสะดวก แต่องค์กรมักต้องการแยก CMS ออกจากข้อมูลธุรกิจ ทั้งเรื่องสิทธิ์ (least privilege) และไม่ให้ CMS ทำให้แอปหลักล่ม
- สิ่งที่มีอยู่แล้ว:
  - `@easy-cms/db-postgres` เปิด client ของ postgres.js เองจาก `url` และมี pool ของตัวเอง (`max`, ค่าปริยาย 10) ไม่เคยใช้ pool ร่วมกับแอป
  - ชื่อตารางไม่ระบุ schema และไม่มีการอ่าน `information_schema` migration ที่สร้างขึ้นไม่มี `"public".` จึงน่าจะทำงานใน schema อื่นได้ด้วย `search_path` ของ role (ยังไม่ได้ทดสอบ)
  - production เรียก `verify()` ตอนเริ่ม ซึ่งเรียก `ensureTable()` = `CREATE TABLE IF NOT EXISTS` ของตาราง migrations (`drizzle/src/migrations.ts`) role ที่มีแค่สิทธิ์ DML จึงเริ่มระบบไม่ได้
- pool ที่แยกกันกันได้แค่ connection ไม่ได้แยก CPU, IO หรือ lock ของ Postgres และจำนวน connection รวมคือ instance × `max` ซึ่งบน serverless ใช้ `max_connections` หมดได้ง่าย
- การแยก schema ไม่ได้ป้องกัน SQL injection แต่จำกัดความเสียหายถ้าเกิดขึ้น ส่วนการป้องกันมาจาก query แบบ parameter ของ Drizzle

## การตัดสินใจ

- **สี่ระดับ เลือกได้ด้วย config อย่างเดียว** ค่าปริยายยังเป็น L0 จึงไม่ breaking:

  | ระดับ | ที่อยู่ของข้อมูล | วิธี |
  |---|---|---|
  | L0 รวม | ฐานข้อมูลและ schema เดียวกับแอป แยกด้วย `tablePrefix` | ค่าปริยาย |
  | L1 รวมฐานข้อมูล แยก schema | schema ของตัวเอง (เช่น `easy_cms`) และ role ของตัวเอง | `search_path` ของ role ก่อน แล้วตัวเลือก `schema` |
  | L2 แยกฐานข้อมูล | database อื่นบน server เดียวกัน | `url` |
  | L3 แยก server | Postgres อีกเครื่อง | `url` |

  องค์กรแนะนำ L1 ขึ้นไป ถ้าต้องการกัน CPU และ IO ไม่ให้กระทบแอปหลักต้องเป็น L3
- **ไม่รับ client หรือ pool ของแอปเข้ามาใช้ร่วม** เพราะ CMS จะแย่ง connection กับแอปและคุม `prepare`, timeout และ transaction ของตัวเองไม่ได้
- **L1 ทำสองขั้น:**
  1. ตอนนี้: เอกสาร `CREATE SCHEMA` + `ALTER ROLE … SET search_path` (ใช้ได้หลัง PgBouncer เพราะค่าอยู่ที่ role ไม่ใช่ startup parameter) และเทสต์ใน CI ว่าตารางทั้งหมดไปอยู่ใน schema นั้น
  2. ทีหลัง: ตัวเลือก `schema` ใน `@easy-cms/db-postgres` ใช้ `pgSchema()` ให้ชื่อตารางระบุ schema เสมอ ไม่ขึ้นกับ `search_path` พร้อมคำสั่ง CLI ย้ายตารางของระบบที่ติดตั้งแล้ว (`ALTER TABLE … SET SCHEMA`)
- **ตัวเลือกของ pool:** `statementTimeout`, `idleTimeout`, `connectTimeout`, `applicationName` (ค่าปริยาย `'easy-cms'`) และ `prepare` ส่วน `statementTimeout` ไม่มีค่าปริยาย เพราะ migration และ backup อาจใช้เวลานาน เอกสารให้สูตร: instance × `max` ไม่เกิน 10–20% ของ `max_connections` และบน serverless ให้ใช้ pooler
- **role แยกสำหรับ migration:** runtime ใช้ role ที่มีแค่ DML ได้ โดย `verify()` ต้องตรวจตาราง migrations โดยไม่ใช้ DDL ส่วน `easy-cms migrate` รันด้วย role เจ้าของ schema (connection string อีกตัว)

## ผลที่ตามมา

- ✅ ทีมเล็กใช้แบบรวมได้เหมือนเดิม องค์กรแยกได้ถึงระดับที่ DBA ต้องการโดยไม่ต้อง fork
- ✅ role ของ CMS ตอนรันเข้าถึงได้แค่ schema ของตัวเองและแก้โครงสร้างตารางไม่ได้
- ⚠️ L1 แบบ `search_path` พังเงียบถ้าลืมตั้ง role: ตารางไปโผล่ใน `public` จึงต้องมีตัวเลือก `schema` ตามมา
- ⚠️ ระบบที่ย้ายจาก L0 ไป L1 ต้องย้ายตาราง และแอปที่ query ตาราง `ecms_` ตรงๆ ต้องได้สิทธิ์ `SELECT` บน schema ใหม่
- ❌ ไม่รองรับ: ใช้ pool ร่วมกับแอป, transaction ข้ามแอปกับ CMS
