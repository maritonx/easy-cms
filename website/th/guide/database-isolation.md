# แยกฐานข้อมูลจากแอป {#database-isolation}

::: info หน้านี้สอนอะไร
เลือกว่าจะแยก Easy CMS ออกจากข้อมูลของแอปบน Postgres แค่ไหน ตั้งแต่ใช้ฐานข้อมูลร่วมกันไปจนถึงแยก server
และวิธีตั้ง schema ของ CMS เอง

**ควรอ่านก่อน:** [ฐานข้อมูล](./databases)
:::

โดยปกติ Easy CMS สร้างตารางของตัวเอง (ขึ้นต้นด้วย `ecms_` ทั้งหมด) ในฐานข้อมูลของแอปคุณ ซึ่งง่ายและเหมาะกับเว็บส่วนใหญ่
แต่องค์กรมักต้องการแยก CMS ออกจากข้อมูลธุรกิจ เพื่อไม่ให้ role ของ CMS อ่านตารางลูกค้าได้ และไม่ให้ CMS ที่ทำงานหนักทำให้แอปช้า
เลือกระดับได้ด้วย config และการตั้งค่าฐานข้อมูลอย่างเดียว ไม่ต้องแก้โค้ด

| ระดับ | ข้อมูลของ CMS อยู่ที่ไหน | วิธี |
|---|---|---|
| **L0** ใช้ร่วมกัน | ฐานข้อมูลและ schema เดียวกับแอป แยกด้วย `tablePrefix` | ค่าเริ่มต้น |
| **L1** แยก schema | ฐานข้อมูลของแอป แต่มี schema และ role ของตัวเอง | [`search_path` ของ role](#a-schema-of-its-own-l1) |
| **L2** แยกฐานข้อมูล | ฐานข้อมูลอื่นบน server เดียวกัน | `url` ของตัวเอง |
| **L3** แยก server | Postgres อีกเครื่อง | `url` ของตัวเอง |

## เลือกระดับไหน {#which-level}

- **L0** เมื่อคนดูแล CMS กับแอปเป็นทีมเดียวกัน
- **L1 ขึ้นไป** เมื่อ CMS ควรเข้าถึงได้แค่ตารางของตัวเอง: role ของ CMS อ่านข้อมูลธุรกิจไม่ได้แม้มีอะไรผิดพลาดใน CMS
  และ migration ของ CMS แตะตารางของแอปไม่ได้
- **L3** เมื่อ CMS ต้องไม่กระทบ performance ของแอป ระดับ L0 ถึง L2 ใช้ CPU, memory, disk และ lock ของ server ร่วมกัน
  การ import ข้อมูลจำนวนมากหรือ backup ฝั่ง CMS จึงทำให้แอปช้าลงด้วย

pool ที่แยกกันแยกได้แค่ connection Easy CMS เปิด pool ของตัวเองเสมอ (`max` ค่าเริ่มต้น 10) และไม่ใช้ pool ร่วมกับแอป
แต่ทั้งคู่ยังใช้ทรัพยากรของ server เดียวกัน

ไม่มีระดับไหนแทนการเขียน query ที่ปลอดภัยได้ Easy CMS ใช้ query แบบ parameter ทุกที่ การแยกช่วยจำกัดความเสียหายเมื่อมีอะไรผิดพลาด

## Schema ของตัวเอง (L1) {#a-schema-of-its-own-l1}

ใช้ superuser หรือเจ้าของฐานข้อมูล สร้าง role และ schema ที่ role นั้นเป็นเจ้าของ แล้วตั้งให้เป็น schema ปริยายของ role:

```sql
CREATE ROLE cms LOGIN PASSWORD '…';
CREATE SCHEMA easy_cms AUTHORIZATION cms;
ALTER ROLE cms SET search_path = easy_cms;
```

แล้วต่อด้วย role นั้น:

```ts
db: postgres({ url: 'postgres://cms:…@db.example.com:5432/app' })
```

ทุกตารางที่ Easy CMS สร้างและทุก migration ที่รันจะไปอยู่ใน `easy_cms` CI รัน integration suite แบบนี้ผ่าน PgBouncer
ค่านี้อยู่ที่ role ไม่ใช่ที่ connection จึงใช้ได้หลัง pooler ที่ไม่รับ startup parameter ด้วย

- **ลืมตั้ง role** role ที่ไม่มี `search_path` ของตัวเองจะสร้างตารางใน `public` แต่ตั้งแต่ Postgres 15 role ที่ไม่ได้เป็นเจ้าของ
  `public` จะได้ error "permission denied for schema public" แทน จึงเห็นความผิดพลาดตั้งแต่เริ่มระบบครั้งแรก
- **แอปอ่านตารางของ CMS** ให้สิทธิ์อ่านกับ role ของแอป:

  ```sql
  GRANT USAGE ON SCHEMA easy_cms TO app;
  GRANT SELECT ON ALL TABLES IN SCHEMA easy_cms TO app;
  ALTER DEFAULT PRIVILEGES FOR ROLE cms IN SCHEMA easy_cms GRANT SELECT ON TABLES TO app;
  ```

  บรรทัดสุดท้ายครอบคลุมตารางที่ migration สร้างทีหลัง แล้วอ้างถึงเป็น `easy_cms.ecms_posts` หรือเพิ่ม schema นี้ใน
  `search_path` ของ role ของแอป

ตัวเลือก `schema` ของ `postgres()` ที่ไม่ขึ้นกับ `search_path` และการรันด้วย role ที่อ่านเขียนข้อมูลได้อย่างเดียวอยู่ในแผนแล้ว

## ย้ายระบบที่ติดตั้งแล้วไป L1 {#moving-an-existing-install-to-l1}

[backup](./backups) ก่อนและหยุดแอป แล้วย้ายตารางด้วย superuser:

```sql
CREATE ROLE cms LOGIN PASSWORD '…';
CREATE SCHEMA easy_cms AUTHORIZATION cms;
ALTER ROLE cms SET search_path = easy_cms;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ecms\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA easy_cms', t);
    EXECUTE format('ALTER TABLE easy_cms.%I OWNER TO cms', t);
  END LOOP;
END $$;
```

sequence และ index ย้ายตามตารางไปเอง ถ้าเปลี่ยน `tablePrefix` ไว้ให้ใช้ prefix ของคุณ จากนั้นชี้ `url` ไปที่ role ใหม่แล้วเริ่มแอป
`verify()` จะเจอตาราง migration ใน schema ใหม่และไม่รันอะไรซ้ำ

## ระดับ L2 และ L3 {#levels-l2-and-l3}

ให้ CMS มี `url` ของตัวเอง: ฐานข้อมูลอื่น (`CREATE DATABASE cms OWNER cms`) หรือ server อื่น ไม่ต้องเปลี่ยนอะไรอีก
Easy CMS ไม่ join ตารางของตัวเองกับของแอป แอปจึงอ่านเนื้อหาผ่าน [Local API](./local-api) หรือ [REST](./rest-api) ไม่ใช่ SQL

บน SQLite ไฟล์แยกก็คือฐานข้อมูลแยกอยู่แล้ว

## ขั้นต่อไป {#next-steps}

- [ฐานข้อมูล](./databases#connections): ขนาด pool, pooler และ serverless
- [Migration และการ deploy](./deployment): รัน migration บน production
- [สถาปัตยกรรมสำหรับ production](./deploy/production): หลาย instance บนฐานข้อมูลเดียว
