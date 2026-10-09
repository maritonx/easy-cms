# โฮสต์อื่นๆ {#other-hosts}

::: info หน้านี้สอนอะไร
โฮสต์ Node.js ใดๆ ต้องมีอะไรบ้างถึงจะรัน Easy CMS ได้ และหมายเหตุสำหรับ Railway, Render, Fly.io และ Coolify

**ควรอ่านก่อน:** [เลือกที่ deploy](./), [Docker](./docker)
:::

แพลตฟอร์มส่วนใหญ่จะ build แอปจาก `package.json` หรือรัน image จาก [Docker](./docker) ไม่ว่าแบบไหน ให้เช็ครายการ
ด้านล่าง หมายเหตุของแต่ละแพลตฟอร์มมาจาก docs ของแพลตฟอร์มนั้น เรายังไม่ได้ทดลองรันจริงทุกเจ้า

## โฮสต์ใดๆ ต้องมี {#what-any-host-needs}

- **Node.js 22.12 ขึ้นไป** แพลตฟอร์มส่วนใหญ่อ่าน `engines` ใน `package.json`:
  `"engines": { "node": ">=22.12" }` ไม่รองรับ edge runtime
- **Build แล้ว migrate แล้วจึง start** build ด้วย `next build`, `nuxi build` หรือไม่ต้อง build สำหรับ standalone server
  ก่อน start ให้รัน `easy-cms migrate` แล้ว start ด้วย `next start`, `node .output/server/index.mjs` หรือ
  `easy-cms serve` หลายแพลตฟอร์มมีคำสั่งก่อน deploy (pre-deploy หรือ release) สำหรับ migration ถ้าไม่มีให้ start ด้วย
  `easy-cms migrate && …`
- **ที่เก็บข้อมูล** อาจเป็น disk ถาวร (volume) สำหรับ SQLite และ `uploads` หรือ Postgres แบบ hosted คู่กับ
  [ที่เก็บไฟล์](../uploads#serving-and-storage) ถ้าใช้ SQLite บน disk ให้รัน instance เดียว
- **process ที่รันอยู่ตลอด** เพื่อให้ server รันงานตามเวลาทุกนาที ถ้าแพลตฟอร์มหยุดแอปที่ไม่มีคนใช้ ให้ cron เรียก
  `<api>/jobs/run` พร้อม `CRON_SECRET` แทน
- **environment variable** ตาม[เลือกที่ deploy](./#what-every-host-needs) และเชื่อ proxy ของแพลตฟอร์ม
  (`trustProxy` หรือ `--trust-proxy`)

## Railway {#railway}

- Railway build จาก `package.json` และเลือกเวอร์ชัน Node.js จาก `engines` (หรือ `.node-version`) คำสั่ง start
  คือ script `start` ของคุณ
- **SQLite:** เพิ่ม volume ให้ service แล้ว mount ไว้ในแอป เช่น `/app/data` แล้วตั้ง
  `DATABASE_URL=file:/app/data/cms.db` mount `uploads` แบบเดียวกัน หรือใช้ S3 storage volume ถูก mount ตอนแอป
  รัน ไม่ใช่ตอน build จึงต้อง migrate ในคำสั่ง start
- **Postgres:** เพิ่ม Postgres ของ Railway แล้วอ้างถึง `DATABASE_URL` ของมันในตัวแปรของแอป
- service รันอยู่ตลอด เว้นแต่จะเปิด Serverless (app sleeping) ให้ปิดไว้ ไม่อย่างนั้นงานตามเวลาจะรันเฉพาะตอนมีคนเข้าเว็บ

## Render {#render}

- สร้าง **Web Service** จาก repository Render เลือกเวอร์ชัน Node.js จาก `NODE_VERSION`, `.node-version`,
  `.nvmrc` หรือ `engines`
- **SQLite:** persistent disk ใช้ได้เฉพาะ service แบบเสียเงิน mount ไว้ที่ path แบบเต็ม เช่น
  `/opt/render/project/src/data` แล้วชี้ `DATABASE_URL` ไปที่ไฟล์ในนั้น service ที่มี disk รันได้ instance เดียว และ
  ทุกครั้งที่ deploy เว็บจะหยุดไม่กี่วินาที
- **Postgres:** สร้าง Render Postgres แล้วคัดลอก Internal Database URL ไปใส่ใน `DATABASE_URL`
- web service แบบฟรีจะหยุดหลังไม่มีผู้เข้าชม 15 นาที ซึ่งทำให้งานตามเวลาหยุดด้วย ให้ใช้ instance แบบเสียเงิน หรือ
  Render Cron Job ที่เรียก `<api>/jobs/run` ด้วย `curl`

## Fly.io {#fly-io}

- Fly รัน image จาก [Docker](./docker) (`fly launch` หา `Dockerfile` เอง)
- **SQLite:** สร้าง volume (`fly volumes create data --size 1`) แล้ว mount ใน `fly.toml`:

  ```toml [fly.toml]
  [mounts]
    source = "data"
    destination = "/app/data"
  ```

  volume เป็นของ machine เครื่องเดียวและไม่มีสำเนา ให้รัน machine เดียว และสำรองข้อมูลเอง
- **ให้รันอยู่ตลอด:** `fly launch` ตั้ง `auto_stop_machines = "stop"` ซึ่งหยุด machine ที่ไม่มีคนใช้และหยุดงานตามเวลา
  ไปด้วย ให้ตั้ง `auto_stop_machines = "off"` (หรือ `min_machines_running = 1`) ใต้ `[http_service]`
- **Postgres:** Fly Managed Postgres ตั้ง `DATABASE_URL` ให้เมื่อ attach (`fly mpg attach`)

## Coolify {#coolify}

Coolify รันบน server ของคุณเองและ deploy จาก Git

- เลือก build pack แบบ **Dockerfile** กับ image จาก [Docker](./docker) หรือ Nixpacks
- **SQLite และไฟล์อัปโหลด:** เพิ่ม volume mount ใน **Persistent Storage** เช่น `/app/data` และ `/app/uploads`
- **Postgres:** สร้างจากหน้าฐานข้อมูลของ Coolify แล้วคัดลอก internal URL ไปใส่ใน `DATABASE_URL` Coolify ตั้งเวลา
  สำรองฐานข้อมูลได้
- proxy ของ Coolify ออกใบรับรอง HTTPS ให้โดเมนของคุณ และแอปรันอยู่ตลอด งานตามเวลาจึงทำงานเอง

## ขั้นต่อไป {#next-steps}

- [Docker](./docker): image ที่แพลตฟอร์มเหล่านี้ build
- [สำรองข้อมูล](../backups): ไม่ว่าใช้โฮสต์ไหน ควรเก็บสำเนาไว้ที่อื่นด้วย
