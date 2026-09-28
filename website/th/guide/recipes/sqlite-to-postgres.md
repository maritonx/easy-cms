# ย้ายจาก SQLite ไป Postgres {#move-from-sqlite-to-postgres}

::: info สิ่งที่จะได้
เว็บเดิมที่ใช้ Postgres แทน SQLite ทั้งแบบก่อนเปิดตัว (ง่าย) หรือแบบที่มีเนื้อหาที่ต้องเก็บไว้
**ใช้:** [ฐานข้อมูล](../databases), [migration](../deployment), [backup](../backups)
:::

SQLite เหมาะกับ server เครื่องเดียวที่มีดิสก์ ให้ย้ายไป Postgres เมื่อ deploy แบบ serverless รันหลาย server
หรือ hosting มี Postgres แบบจัดการให้พร้อมระบบสำรองข้อมูล

## ก่อนเปิดตัว: เปลี่ยนแล้วเริ่มใหม่ {#before-launch-switch-and-start-fresh}

ถ้าเนื้อหาที่มีเป็นแค่เนื้อหาทดสอบ ให้เปลี่ยน adapter แล้วสร้างเนื้อหาใหม่:

```bash
npm install @easy-cms/db-postgres @electric-sql/pglite
```

```ts
import { postgres } from '@easy-cms/db-postgres'

db: process.env.DATABASE_URL
  ? postgres({ url: process.env.DATABASE_URL })
  : postgres({ pglite: '.pglite' }), // Postgres ในโฟลเดอร์ ไม่ต้องมี server
```

migration เขียนด้วย SQL ของฐานข้อมูลแบบใดแบบหนึ่ง จึงต้องสร้างใหม่แทนของ SQLite:

```bash
rm -r easy-cms/migrations
npx easy-cms migrate:create init
```

commit โฟลเดอร์ใหม่ รัน `npx easy-cms migrate` ในที่ที่ deploy และสร้าง admin คนแรกใหม่
(`npx easy-cms create-admin`)

## แบบมีเนื้อหาที่ต้องเก็บไว้ {#with-content-to-keep}

Easy CMS ยังไม่มีคำสั่งคัดลอกข้อมูลข้ามฐานข้อมูลในตัว สิ่งที่ทำได้ตอนนี้:

1. **สำรอง**ฐานข้อมูล SQLite (`npx easy-cms backup backups/before-postgres.db`) และโฟลเดอร์ uploads
2. **สร้าง schema ของ Postgres** จาก config ตามด้านบน (`migrate:create init` แล้ว `migrate` กับฐานข้อมูลใหม่)
   ให้มีทุกตารางและคอลัมน์ที่ Easy CMS ต้องใช้
3. **คัดลอกแถวข้อมูล**ทีละตารางด้วยเครื่องมือฐานข้อมูล เช่น [pgloader](https://pgloader.io) แบบ "data only"
   ตารางมีชื่อเดียวกัน (prefix `ecms_`) และคอลัมน์เดียวกันทั้งสองฐานข้อมูล
4. **ตั้งค่า sequence ของ id ใหม่** เพื่อไม่ให้เอกสารใหม่ชนกับที่คัดลอกมา:

   ```sql
   SELECT setval(pg_get_serial_sequence('ecms_posts', 'id'), (SELECT max(id) FROM ecms_posts));
   ```

   ทำซ้ำกับทุกตาราง `ecms_` ที่มีคอลัมน์ `id`
5. **ตรวจ**เว็บกับฐานข้อมูลใหม่: เปิดหน้า admin เอกสารที่มี relationship และรูป และประวัติเวอร์ชัน

::: warning ทดสอบกับสำเนาก่อน
เรายังไม่ได้ทดสอบทุกเครื่องมือและทุกกรณีในขั้นที่ 3 ให้ลองย้ายทั้งหมดกับสำเนาข้อมูลก่อน และเก็บไฟล์สำรองของ SQLite
ไว้จนกว่าเว็บบน Postgres จะใช้งานได้ดีสักระยะ
:::

ไฟล์อัปโหลดไม่ต้องย้าย ไฟล์ยังอยู่ใน `uploads/` หรือ bucket และเอกสารยังชี้ไปที่ไฟล์เดิม
