# Backup และการอัปเกรด {#backups-and-upgrades}

Easy CMS เก็บข้อมูลไว้สองที่: **ฐานข้อมูล** (เอกสาร, ผู้ใช้, versions, งานที่ตั้งเวลา, webhook ที่รอส่ง และตาราง migrations)
และ **ไฟล์อัปโหลด** (`upload.dir` บนเครื่อง หรือ bucket S3) ต้อง backup ทั้งสองอย่าง Easy CMS ไม่ได้ backup ให้

## ต้อง backup อะไรบ้าง {#what-to-back-up}

| อะไร | อยู่ที่ไหน | บ่อยแค่ไหน |
|---|---|---|
| ฐานข้อมูล | ไฟล์ SQLite หรือฐานข้อมูล Postgres | ทุกวัน และก่อนทุกครั้งที่ deploy แล้วมี migration |
| ไฟล์อัปโหลด | `uploads/` (หรือ `upload.dir`) หรือ bucket S3 | ทุกวัน ถ้าใช้ S3 ให้เปิด bucket versioning |
| `EASY_CMS_SECRET` | ที่ตั้งค่า secret ของ host | ครั้งเดียว เก็บไว้ใน password manager |
| `easy-cms/migrations` | Git | มีอยู่แล้วเมื่อ commit |

ถ้า `EASY_CMS_SECRET` หาย ข้อมูลไม่หาย เพราะใช้เซ็น session และลิงก์ preview ไม่ได้ใช้กับรหัสผ่าน
การตั้งค่าใหม่จะทำให้ทุกคนหลุดออกจากระบบและลิงก์ preview เดิมใช้ไม่ได้

## SQLite {#sqlite}

ฐานข้อมูลทำงานในโหมด WAL การคัดลอก `cms.db` ขณะ server ทำงานอาจได้ไฟล์ที่เสีย ให้ใช้ `easy-cms backup` แทน
คำสั่งนี้อ่าน config ของโปรเจกต์แล้วเขียนสำเนาที่สมบูรณ์ได้ขณะ CMS ทำงานอยู่

```bash
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
   ```bash
   npm install @easy-cms/core@latest @easy-cms/nuxt@latest @easy-cms/db-sqlite@latest easy-cms@latest
   ```
3. รัน `npx easy-cms migrate:create upgrade` บางเวอร์ชันเพิ่มตารางภายใน (0.7 เพิ่ม `webhook-deliveries`)
   ถ้ามีจะได้ migration ให้ตรวจและ commit ถ้าไม่มี migration นี้ production จะไม่ยอมเริ่ม
4. ลองกับสำเนาข้อมูล production (backup ที่กู้คืนแล้ว) ก่อน deploy
5. deploy ตามปกติ: backup, `easy-cms migrate`, เริ่มเวอร์ชันใหม่

**ย้อนกลับ:** migration เดินหน้าอย่างเดียว ถ้าจะกลับไปเวอร์ชันก่อน ให้กู้คืน backup ที่ทำไว้ก่อน deploy แล้ว deploy แอปเวอร์ชันก่อนหน้า

## เวอร์ชันและการสนับสนุน {#versioning}

Easy CMS ใช้ [semantic versioning](https://semver.org) ตามกติกาปกติของเวอร์ชันก่อน 1.0:

- **ก่อน 1.0 (ตอนนี้):** minor release (0.8 → 0.9) อาจเปลี่ยน API, config หรือรูปแบบคำตอบของ REST
  changelog จะบอกว่าเปลี่ยนอะไรและต้องแก้อย่างไร ส่วน patch release (0.9.0 → 0.9.1) แก้บั๊กอย่างเดียว
- **ตั้งแต่ 1.0:** breaking change เฉพาะใน major release พร้อมคู่มืออัปเกรดใน changelog
  API ที่เลิกใช้จะยังทำงานพร้อมคำเตือนจนถึง major ถัดไป
- **การแก้ช่องโหว่** ออกให้ minor release ล่าสุด (และตั้งแต่ 1.0 ให้ major ก่อนหน้าด้วยเป็นเวลาหกเดือน)
  ดู[นโยบายความปลอดภัย](https://github.com/maritonx/easy-cms/blob/main/SECURITY.md)
