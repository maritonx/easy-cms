# Migration และการ deploy {#migrations-deployment}

::: info หน้านี้สอนอะไร
การเปลี่ยน schema ถูกใช้ตอนพัฒนาอย่างไร และส่งเป็น migration ขึ้น production อย่างไร

**ควรอ่านก่อน:** [ฐานข้อมูล](./databases)
:::

## ช่วงพัฒนา: อัตโนมัติ {#development-automatic}

ระหว่างพัฒนา (`NODE_ENV` ไม่ใช่ `production`) Easy CMS จะปรับฐานข้อมูลให้ตรงกับ
config ตอนเริ่มทำงาน: field ใหม่จะกลายเป็นคอลัมน์ field ที่ถูกลบจะถูก drop

::: warning การเปลี่ยนชื่อทำให้ข้อมูลหายในช่วงพัฒนา
การเปลี่ยนชื่อ field ในช่วงพัฒนา (development) จะ drop คอลัมน์เดิมและเพิ่มคอลัมน์ใหม่ ให้ใช้ migration (ด้านล่าง)
เมื่อข้อมูลมีความสำคัญ
:::

## Production: migration {#production-migrations}

ใน production จะไม่มีการเปลี่ยนแปลงใดเกิดขึ้นอัตโนมัติ server จะไม่ยอมเริ่มทำงานเมื่อมี migration
ค้างอยู่หรือ config เปลี่ยนโดยไม่มี migration และจะบอกว่าต้องรันคำสั่งอะไร

```bash [pm]
npx easy-cms migrate:create init     # after your first model, and after every change
git add easy-cms/migrations          # review the SQL, then commit
npx easy-cms migrate                 # where you deploy, before starting the new version
```

`migrate:create` เปรียบเทียบ config ของคุณกับ migration ล่าสุด เมื่อรันใน terminal จะถามว่า
field ที่เปลี่ยนไปถูกเปลี่ยนชื่อหรือไม่ เพื่อเก็บข้อมูลไว้ แต่ละ migration รันใน transaction เดียว migration ที่
ล้มเหลวจะถูก rollback และไม่ถูกบันทึก

ฐานข้อมูลที่ตั้งค่าด้วยการ push ในช่วงพัฒนาไม่สามารถรับ migration ได้ ให้รัน migration กับฐานข้อมูลใหม่

## Environment variable {#environment-variables}

`create-easy-cms` ใส่ `EASY_CMS_SECRET` (และ `DATABASE_URL` หากใช้) ไว้ใน `.env` ไฟล์นั้น
มีไว้สำหรับช่วงพัฒนา ส่วน production จะอ่านไฟล์นี้หรือไม่ขึ้นกับวิธีเริ่ม server:

| Server | อ่าน `.env` ใน production หรือไม่ | สิ่งที่ต้องทำ |
|---|---|---|
| Next.js (`next start`) | อ่าน | ไม่ต้องทำอะไร หรือตั้งค่าตัวแปรบนโฮสต์ |
| Nuxt (`node .output/server/index.mjs`) | **ไม่อ่าน** | ตั้งค่าตัวแปรบนโฮสต์ หรือเริ่มด้วย `node --env-file=.env .output/server/index.mjs` |
| แพลตฟอร์ม (Vercel, Netlify, Fly, Docker…) | ใช้การตั้งค่าของแพลตฟอร์ม | เพิ่มตัวแปรใน dashboard, CLI หรือไฟล์ compose ของแพลตฟอร์ม |

เมื่อไม่มี `EASY_CMS_SECRET` API จะตอบ `500` และ log จะแสดง
`secret: is required`

## Checklist {#checklist}

- ตั้งค่า `EASY_CMS_SECRET` ใน environment ของ production (อักขระสุ่มอย่างน้อย 32 ตัว:
  `openssl rand -hex 32`) ดู [Environment variable](#environment-variables)
- `NODE_ENV=production`
- deploy โฟลเดอร์ `easy-cms/migrations` ไปด้วย และรัน `easy-cms migrate`
- เริ่ม server **จาก root ของโปรเจกต์**: path ฐานข้อมูลแบบ relative, migration และไฟล์ที่อัปโหลด
  อ้างอิงจาก working directory
- ไฟล์ที่อัปโหลดลงดิสก์ในเครื่องต้องใช้ persistent volume บนแพลตฟอร์ม serverless ให้ใช้
  [S3 storage](./uploads#s3-cloudflare-r2-and-minio)
- build บน OS และสถาปัตยกรรมเดียวกับ server เมื่อใช้ SQLite (native driver)
- เมื่ออยู่หลัง proxy ที่เชื่อถือได้ ให้เปิด `trustProxy` เพื่อจำกัดอัตราการเข้าสู่ระบบแยกตาม IP
- ตั้งค่า `auth.trustedOrigins` หากหน้า admin หรือ frontend เรียก API จาก origin อื่น
- มี[backup](./backups)ของฐานข้อมูลและไฟล์อัปโหลด และเคยลองกู้คืนแล้ว

## ขั้นต่อไป {#next-steps}

- [Backup และการอัปเกรด](./backups): สำรองข้อมูลก่อนอัปเกรด
- [ความปลอดภัย](./security): เช็กลิสต์ก่อนขึ้นระบบจริง
