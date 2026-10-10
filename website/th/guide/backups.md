# Backup และการอัปเกรด {#backups-and-upgrades}

::: info หน้านี้สอนอะไร
ต้องสำรองอะไร กู้คืนอย่างไร และอัปเกรด Easy CMS อย่างปลอดภัย

**ควรอ่านก่อน:** [Migration และการ deploy](./deployment)
:::

Easy CMS เก็บข้อมูลไว้สองที่: **ฐานข้อมูล** (เอกสาร, ผู้ใช้, versions, งานที่ตั้งเวลา, webhook ที่รอส่ง และตาราง migrations)
และ **ไฟล์อัปโหลด** (`upload.dir` บนเครื่อง หรือ bucket S3) ต้อง backup ทั้งสองอย่าง Easy CMS ไม่ได้ backup ให้

## ต้อง backup อะไรบ้าง {#what-to-back-up}

| อะไร | อยู่ที่ไหน | บ่อยแค่ไหน |
|---|---|---|
| ฐานข้อมูล | ไฟล์ SQLite หรือฐานข้อมูล Postgres | ทุกวัน และก่อนทุกครั้งที่ deploy แล้วมี migration |
| ไฟล์อัปโหลด | `uploads/` (หรือ `upload.dir`) หรือ bucket S3 | ทุกวัน ถ้าใช้ S3 ให้เปิด bucket versioning |
| `EASY_CMS_SECRET` | ที่ตั้งค่า secret ของ host | ครั้งเดียว เก็บไว้ใน password manager |
| `backups.encryptionKey` | ที่ตั้งค่า secret ของ host | ครั้งเดียว เก็บไว้ที่อื่นที่ไม่ใช่ที่เดียวกับ backup |
| `easy-cms/migrations` | Git | มีอยู่แล้วเมื่อ commit |

ถ้า `EASY_CMS_SECRET` หาย ข้อมูลไม่หาย เพราะใช้เซ็น session และลิงก์ preview ไม่ได้ใช้กับรหัสผ่าน
การตั้งค่าใหม่จะทำให้ทุกคนหลุดออกจากระบบและลิงก์ preview เดิมใช้ไม่ได้

## จากหน้า admin {#from-the-admin}

<Screenshot name="backups" alt="ตั้งค่า → Backups: รอบที่ตั้งไว้ ปุ่ม Backup ตอนนี้ และรายการ backup พร้อมปุ่มดาวน์โหลด" />

admin เปิด **ตั้งค่า → Backups** ในหน้า admin ได้ มีปุ่ม **Backup ตอนนี้** รายการ backup พร้อมบอกว่าใครทำ ปุ่ม **ดาวน์โหลด**
และ **ลบ** ส่วนรอบอัตโนมัติและจำนวนที่เก็บตั้งใน config:

```ts
import { sqlite } from '@easy-cms/db-sqlite'

backups: {
  frequency: 'daily',   // หรือ 'weekly' ไม่ใส่ = กดทำเองเท่านั้น
  at: '03:00',           // เวลาของ server
  keep: 7,               // ชุดที่เก่ากว่านี้จะถูกลบ
  // dir: 'backups',     // ค่าเริ่มต้น ไม่เปิดเป็น URL สาธารณะ
  // storage: s3Storage({ bucket: 'my-private-backups' }), // แทนดิสก์ของ server
  // encryptionKey: process.env.EASY_CMS_BACKUP_KEY,       // เข้ารหัสไฟล์ ดูด้านล่าง
  // sqlite,             // เฉพาะ Postgres ดูด้านล่าง
},
```

- **backup แต่ละชุดเป็นไฟล์ SQLite บีบอัดไฟล์เดียว** (`<ชื่อเว็บ>-YYYY-MM-DD-HHmm.db.gz`) ของทั้งฐานข้อมูล: เอกสาร ผู้ใช้
  เวอร์ชัน การตั้งค่า SQLite คัดลอกตัวเองได้ ส่วน **Postgres** ถูกคัดลอกลงไฟล์ SQLite จึงต้องส่ง `sqlite` จาก
  `@easy-cms/db-sqlite` เป็น `backups.sqlite` (ติดตั้งแพ็กเกจนั้นด้วย) ถ้าฐานข้อมูล Postgres ใหญ่ ควรใช้ backup ของผู้ให้บริการ
  หรือ `pg_dump` ควบคู่ไปด้วย
- **ไม่รวมไฟล์ที่อัปโหลด**: backup โฟลเดอร์ uploads แยก หรือเปิด versioning ของ S3 bucket
- **เก็บที่ไหน:** ค่าเริ่มต้นคือ `backups/` บนดิสก์ของ server ซึ่งหายไปพร้อม server (และบน serverless หายทุกครั้งที่ deploy)
  ตั้ง `backups.storage` เป็น bucket **ส่วนตัว** หรือดาวน์โหลดเก็บไว้ ห้ามใช้โฟลเดอร์ uploads หรือ bucket สาธารณะ
  เพราะ backup มี hash ของรหัสผ่านและ API key ถ้า `backups.storage` ให้ URL สาธารณะ (เช่น S3 ที่ตั้ง `publicURL`)
  จะมีคำเตือนใน log ตอนเริ่ม server ส่วน `create-easy-cms` เพิ่ม `backups/` ลงใน `.gitignore` ให้
- **การเข้ารหัส:** ตั้ง `backups.encryptionKey` (อย่างน้อย 32 ตัวอักษร เช่น `process.env.EASY_CMS_BACKUP_KEY`)
  แล้วแต่ละไฟล์จะถูกเข้ารหัสด้วย AES-256-GCM และชื่อลงท้าย `….db.gz.enc` ถ้า bucket หรือดิสก์หลุดออกไปก็อ่านไม่ได้
  ไฟล์ที่ดาวน์โหลดจากหน้า admin ถูกถอดรหัสให้แล้ว เก็บสำเนาของ key ไว้ที่อื่นที่ไม่ใช่ที่เดียวกับ backup เพราะถ้าไม่มี key
  จะกู้คืน backup ไม่ได้
- **backup ตามรอบ** ทำงานพร้อม[งานที่ตั้งเวลาไว้](./drafts#scheduled-publishing): ทุกนาทีบน server ที่ทำงานต่อเนื่อง หรือจาก cron
  ที่เรียก `<api>/jobs/run` ทำทีละชุด ชุดที่ค้างเพราะ process หยุดกลางทางจะถูกทำต่อในรอบถัดไป แดชบอร์ดจะเตือน admin
  เมื่อ backup ตามรอบครั้งล่าสุดไม่สำเร็จ หรือไม่มีชุดที่สำเร็จนานเกินสองรอบ
- **การดาวน์โหลด** ผ่าน server เฉพาะ admin และรายการบอกว่าใครดาวน์โหลดครั้งล่าสุด เก็บไฟล์ที่ดาวน์โหลดให้ปลอดภัยเท่ากับฐานข้อมูล
- อัปเกรดเป็น Easy CMS 0.32 จะเพิ่มตาราง `database-backups` ต้องสร้าง migration (`npx easy-cms migrate:create backups`)

### กู้คืนจาก backup ของหน้า admin {#restoring-a-backup-from-the-admin}

การกู้คืนทำบน server ไม่ใช่ในหน้า admin แตกไฟล์ก่อน:

```bash
gunzip my-site-2026-10-04-0300.db.gz
```

ไฟล์ที่เข้ารหัสซึ่งเอามาจากที่เก็บโดยตรง (`.db.gz.enc`) ต้องถอดรหัสก่อนด้วย
[`easy-cms backup:decrypt`](./cli#backup-decrypt) ซึ่งใช้ key จาก config:

```bash [pm]
npx easy-cms backup:decrypt my-site-2026-10-04-0300.db.gz.enc
```

- **SQLite:** หยุด server แทนที่ `cms.db` ด้วยไฟล์ที่แตกแล้ว (ลบ `cms.db-wal` และ `cms.db-shm` ถ้ามี) แล้วเริ่ม server
- **Postgres:** คัดลอกไฟล์เข้าฐานข้อมูลว่างด้วย `easy-cms copy` ตาม[การย้ายจาก SQLite ไป Postgres](./recipes/sqlite-to-postgres#with-content-to-keep)
  โดยใช้ config ที่ `db` เป็น `sqlite({ url: 'file:./my-site-2026-10-04-0300.db' })` เป็นต้นทาง

## SQLite {#sqlite}

ฐานข้อมูลทำงานในโหมด WAL การคัดลอก `cms.db` ขณะ server ทำงานอาจได้ไฟล์ที่เสีย ให้ใช้ `easy-cms backup` แทน
คำสั่งนี้อ่าน config ของโปรเจกต์แล้วเขียนสำเนาที่สมบูรณ์ได้ขณะ CMS ทำงานอยู่

```bash [pm]
npx easy-cms backup backups/cms-$(date +%F).db
```

คำสั่ง `sqlite3` ก็ทำได้เหมือนกัน: `sqlite3 cms.db ".backup 'backups/cms.db'"`

**กู้คืน:** หยุด server แทนที่ `cms.db` ด้วยไฟล์ backup แล้วลบ `cms.db-wal` และ `cms.db-shm` ถ้ามี จากนั้นเริ่ม server

## Postgres {#postgres}

```bash
pg_dump --format=custom --file=cms-$(date +%F).dump "$DATABASE_URL"
```

ถ้าฐานข้อมูลใช้ร่วมกับแอปอื่น ให้ dump เฉพาะตารางของ Easy CMS ด้วย prefix (`tablePrefix` ค่าเริ่มต้น `ecms_`):
`pg_dump -t 'ecms_*' …` ส่วน Postgres แบบ managed (Neon, Supabase, RDS…) มักมี point-in-time recovery ให้เปิดไว้ด้วย

**กู้คืน:** หยุด server แล้วรัน

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" cms-2026-10-01.dump
```

## หลังกู้คืน {#after-a-restore}

backup มีตาราง migrations อยู่ด้วย ฐานข้อมูลจึงอยู่ที่ schema ของวันที่ backup ให้เริ่มแอปเวอร์ชันที่ตรงกับตอนนั้น
หรือ deploy เวอร์ชันปัจจุบันแล้วรัน `easy-cms migrate` เพื่อเพิ่ม migration ที่สร้างหลังจากนั้น
server ในโหมด production จะไม่ยอมเริ่มถ้าไม่ตรงกัน จึงเห็นปัญหาทันทีแทนที่ข้อมูลจะเสีย

**ลองกู้คืนดู** เป็นระยะ: กู้คืนลงฐานข้อมูลทดลอง เริ่มแอปกับฐานข้อมูลนั้น แล้วเปิดหน้า admin
backup ที่ไม่เคยลองกู้คืนก็ยังไม่รู้ว่าใช้ได้จริง

## อัปเกรด Easy CMS {#upgrading-easy-cms}

แพ็กเกจ `@easy-cms/*`, `easy-cms` และ `create-easy-cms` ใช้เลขเวอร์ชันเดียวกัน ให้อัปเกรดพร้อมกันทั้งหมด

1. อ่าน changelog ของเวอร์ชันที่อยู่ระหว่างทาง (`packages/core/CHANGELOG.md` บน GitHub หรือ `npm view @easy-cms/core --json`)
2. อัปเกรดทุกแพ็กเกจเป็นเวอร์ชันเดียวกัน:
   ```bash [pm]
   npm install @easy-cms/core@latest @easy-cms/nuxt@latest @easy-cms/db-sqlite@latest easy-cms@latest
   ```
3. รัน `npx easy-cms migrate:create upgrade` บางเวอร์ชันเพิ่มตารางภายใน (0.7 เพิ่ม `webhook-deliveries`)
   ถ้ามีจะได้ migration ให้ตรวจและ commit ถ้าไม่มี migration นี้ production จะไม่ยอมเริ่ม
4. ลองกับสำเนาข้อมูล production (backup ที่กู้คืนแล้ว) ก่อน deploy
5. deploy ตามปกติ: backup, `easy-cms migrate`, เริ่มเวอร์ชันใหม่

**ย้อนกลับ:** migration เดินหน้าอย่างเดียว ถ้าจะกลับไปเวอร์ชันก่อน ให้กู้คืน backup ที่ทำไว้ก่อน deploy แล้ว deploy แอปเวอร์ชันก่อนหน้า

## เวอร์ชันและการสนับสนุน {#versioning}

เลขเวอร์ชันสัญญาอะไร ครอบคลุมส่วนไหน ชื่อเก่าถูกเลิกใช้อย่างไร และแต่ละ release ได้รับการแก้ช่องโหว่นานเท่าไร
ดูที่[เวอร์ชันและการเลิกใช้](./versioning)

## ขั้นต่อไป {#next-steps}

- [CLI](./cli): คำสั่ง backup
- [ความปลอดภัย](./security): ดูแลไฟล์สำรองให้ปลอดภัย
