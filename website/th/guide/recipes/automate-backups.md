# สำรองข้อมูลอัตโนมัติ {#automate-backups}

::: info สิ่งที่จะได้
สำรองฐานข้อมูลและไฟล์อัปโหลดทุกวัน ลบไฟล์เก่าทิ้ง และซ้อมกู้คืนเพื่อให้รู้ว่าใช้ได้จริง
**ใช้:** [backup](../backups), [CLI](../cli#backup)
:::

## SQLite บน server {#sqlite-on-a-server}

สคริปต์ที่คัดลอกฐานข้อมูลขณะเว็บยังทำงาน พร้อมไฟล์อัปโหลด:

```bash [scripts/backup.sh]
#!/bin/sh
set -e
cd /srv/my-site                          # root ของโปรเจกต์
day=$(date +%F)
mkdir -p backups
npx easy-cms backup "backups/cms-$day.db"            # สำเนาที่ข้อมูลตรงกัน CMS ยังทำงานต่อ
tar -czf "backups/uploads-$day.tar.gz" uploads       # ไฟล์อัปโหลด
find backups -type f -mtime +14 -delete              # เก็บไว้สองสัปดาห์
```

ตั้งให้รันทุกคืนด้วย cron (`crontab -e`):

```
30 2 * * * /srv/my-site/scripts/backup.sh >> /var/log/cms-backup.log 2>&1
```

แล้วคัดลอก `backups/` ออกจาก server ไฟล์สำรองที่อยู่ดิสก์เดียวกันจะหายไปพร้อมดิสก์ เช่น ส่งไป bucket ของ S3 ด้วย
`aws s3 sync backups s3://my-backups/cms` หรือใช้ `rclone`

## Postgres {#postgres}

Postgres แบบจัดการให้ (Neon, Supabase, RDS…) มักมีการสำรองแบบย้อนเวลาได้ ให้เปิดใช้ก่อน ส่วนสำเนาของคุณเอง:

```bash
pg_dump --format=custom --file="backups/cms-$(date +%F).dump" "$DATABASE_URL"
```

## ไฟล์อัปโหลดใน bucket {#uploads-in-a-bucket}

เปิด **versioning** ของ bucket (S3, R2 และ MinIO รองรับ) เพื่อกู้ไฟล์ที่ถูกลบหรือแทนที่ได้ และตั้ง lifecycle rule
ให้ลบเวอร์ชันเก่าเมื่อผ่านไประยะหนึ่ง

## ซ้อมกู้คืน {#restore-drill}

เดือนละครั้ง พิสูจน์ว่าไฟล์สำรองใช้ได้:

1. คัดลอกไฟล์สำรองของเมื่อคืนไปที่ที่แยกไว้ (ห้ามทับ production)
2. เปิดเว็บกับไฟล์นั้น เช่น `DATABASE_URL=file:./restore-test.db npm run dev` (เมื่อ config อ่าน
   `DATABASE_URL` แบบในตัวอย่าง)
3. เปิดหน้า admin เอกสารล่าสุดสักสองสามรายการและรูปของมัน

ขั้นตอนกู้คืนจริง และสิ่งที่ต้องทำกับ migration หลังจากนั้น อยู่ที่ [Backup และการอัปเกรด](../backups#after-a-restore)
