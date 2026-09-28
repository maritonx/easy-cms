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

`easy-cms copy` ย้ายทุกอย่าง: เอกสาร เวอร์ชัน ผู้ใช้ (จึง login ได้เหมือนเดิม) global และงานตั้งเวลา
id ยังเหมือนเดิม relationship จึงยังชี้ไปที่เอกสารที่ถูกต้อง

1. **สำรองข้อมูล**ก่อน: `npx easy-cms backup backups/before-postgres.db`
2. **เก็บ config ของฐานข้อมูลเก่าไว้** สร้าง `easy-cms.old.config.ts` ข้าง config หลัก ใช้ทุกอย่างเหมือนเดิม
   และเปลี่ยนแค่ `db`:

   ```ts [easy-cms.old.config.ts]
   import { sqlite } from '@easy-cms/db-sqlite'
   import config from './easy-cms.config'

   export default { ...config, db: sqlite({ url: 'file:./cms.db' }) }
   ```

3. **ให้ config หลักชี้ไปที่ Postgres** ตามหัวข้อด้านบน แล้วสร้าง migration ของ Postgres
   (`rm -r easy-cms/migrations && npx easy-cms migrate:create init`)
4. **เตรียมฐานข้อมูลใหม่** ในเครื่อง (PGlite หรือตั้ง `DATABASE_URL` ไว้) ขั้นถัดไปจะสร้างตารางให้เอง
   ถ้าเป็นฐานข้อมูล production ให้รัน `NODE_ENV=production npx easy-cms migrate` พร้อม `DATABASE_URL` ของมันก่อน
5. **คัดลอก** ในช่วงที่ไม่มีใครแก้เนื้อหา:

   ```bash
   npx easy-cms copy --from easy-cms.old.config.ts
   # Copying from sqlite (easy-cms.old.config.ts) to postgres…
   #   ecms_users: 3
   #   ecms_posts: 42
   #   …
   # Copied 318 row(s) from 17 table(s).
   ```

   ปลายทางต้องว่าง ถ้าเผลอรันซ้ำจึงไม่มีอะไรเปลี่ยน
6. **ตรวจ**เว็บ: เปิดหน้า admin เอกสารที่มี relationship และรูป ประวัติของบทความ และลอง login

ไฟล์อัปโหลดไม่ต้องย้าย ไฟล์ยังอยู่ใน `uploads/` หรือ bucket และเอกสารยังชี้ไปที่ไฟล์เดิม เมื่อเว็บบน Postgres
ทำงานดีแล้ว ลบ `easy-cms.old.config.ts` ได้ (เก็บไฟล์สำรองไว้สักพัก)

คำสั่งเดียวกันใช้กลับทางได้ด้วย คือจาก Postgres ไป SQLite
