# Migration และการ deploy {#migrations-deployment}

::: info หน้านี้สอนอะไร
การเปลี่ยน schema ถูกใช้ตอนพัฒนาอย่างไร และส่งเป็น migration ขึ้น production อย่างไร

**ควรอ่านก่อน:** [ฐานข้อมูล](./databases)
:::

ถ้าต้องการลองบน Vercel หรือ Netlify ในไม่กี่คลิก โดยมีฐานข้อมูลและที่เก็บไฟล์สร้างให้ ใช้ [deploy ด้วยคลิกเดียว](./one-click-deploy)

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
| แพลตฟอร์ม (Vercel, Netlify, Fly, Docker…) | ใช้การตั้งค่าของแพลตฟอร์ม | เพิ่มตัวแปรใน dashboard, CLI หรือไฟล์ compose ของแพลตฟอร์ม ดู [การ Deploy](./deploy/) |

เมื่อไม่มี `EASY_CMS_SECRET` API จะตอบ `500` และ log จะแสดง
`secret: is required`

## Log {#logs}

โดยปกติ Easy CMS เขียนบรรทัดที่อ่านง่าย `[easy-cms] …` และ stack ของ error อยู่ใต้บรรทัดนั้น ถ้าส่ง log เข้าระบบรวบรวม log
(Datadog, Loki, CloudWatch หรือ `docker logs` เข้า collector) ให้เขียนเป็น JSON บรรทัดละหนึ่ง object แทน:

```ts
logs: { format: 'json' }
```

หรือตั้ง `EASY_CMS_LOG_FORMAT=json` บน host ซึ่งมีผลเหนือ config:

```json
{"time":"2026-10-25T14:22:19.280Z","level":"info","name":"easy-cms","message":"GET /api/cms/posts 200","requestId":"lb-7f3a","method":"GET","path":"/api/cms/posts","status":200,"durationMs":7,"userId":3}
{"time":"2026-10-25T14:22:20.011Z","level":"error","name":"easy-cms","message":"REST request failed: …","requestId":"0b6f…","error":{"name":"Error","message":"…","stack":"…"}}
```

- **Request id** ทุก response ของ API มี header `X-Request-Id` และทุกบรรทัดที่ log ระหว่างตอบ request นั้นมี `requestId`
  เดียวกัน ถ้า load balancer ส่ง `X-Request-Id` มาและเป็นค่าธรรมดา (ตัวอักษร ตัวเลข `.` `_` `-` ยาวไม่เกิน 128)
  จะใช้ค่านั้นต่อ id เดียวจึงตามจาก log ของ proxy มาถึง log ของ Easy CMS ได้
- **หนึ่งบรรทัดต่อ request** มี method, path (ไม่รวม query string ซึ่งอาจมีข้อมูลส่วนตัว), status, เวลาที่ใช้ และ id ของผู้ใช้
  ปิดได้ด้วย `logs: { requests: false }` ถ้า load balancer log request อยู่แล้ว
- **งานเบื้องหลัง** การเผยแพร่ตามกำหนดเวลาและ job แต่ละรอบ log พร้อม `runId` ของรอบนั้น และ `requestId` ของ cron ที่เรียกให้รัน

`easy-cms serve` ใช้ค่าเดียวกัน ถ้าส่ง `logger` ของคุณเองให้ `createEasyCMS` ค่า `logs` จะไม่มีผล ใช้ `jsonLogger()`
จาก `@easy-cms/core` ถ้าต้องการรูปแบบนี้

## Health check {#health-checks}

load balancer, แพลตฟอร์ม container และ Kubernetes ถามสองคำถาม:

| Path | ตอบ | ใช้เป็น |
|---|---|---|
| `<api>/healthz` | `200 ok` เมื่อ process ยังทำงาน ไม่แตะฐานข้อมูลเลย | Liveness: restart process เมื่อไม่ตอบ |
| `<api>/readyz` | `200` เมื่อ Easy CMS เริ่มแล้ว ฐานข้อมูลตอบ และไม่มี migration ค้าง ไม่อย่างนั้นตอบ `503` | Readiness: ส่ง traffic ไปเฉพาะ instance ที่พร้อม |

`<api>` คือ `routes.api` (ค่าเริ่มต้น `/api/cms`) ทุก setup จึงมีทั้งสองตัว: Next.js, Nuxt และ
[standalone server](./standalone) ซึ่งตอบ `/healthz` และ `/readyz` ที่ root ด้วย ทั้งสองตัวไม่ต้อง login และไม่ถูก cache

```json
{ "status": "ok", "checks": { "database": "ok", "migrations": "ok" } }
{ "status": "error", "checks": { "database": "ok", "migrations": "1 pending" } }
```

response บอกแค่ชื่อข้อที่ไม่ผ่าน ไม่บอกรายละเอียด ข้อความ error อยู่ใน log พร้อม [request id](#logs) ถ้า Easy CMS
เริ่มไม่ขึ้น (config ผิด หรือต่อฐานข้อมูลไม่ได้) `/healthz` ยังตอบ `200` และ `/readyz` ตอบ `503` พร้อม `"startup": "error"`

```yaml
# Kubernetes
livenessProbe:
  httpGet: { path: /api/cms/healthz, port: 3000 }
readinessProbe:
  httpGet: { path: /api/cms/readyz, port: 3000 }
  periodSeconds: 5
```

ให้ liveness เรียก `healthz` ไม่ใช่ `readyz` เพราะเมื่อฐานข้อมูลล่ม ควรเอา instance ออกจาก load balancer ไม่ใช่ restart
ทุกตัว probe ไม่ถูกเขียนเป็น[บรรทัดของ request ใน log](#logs)

## Checklist {#checklist}

- ตั้งค่า `EASY_CMS_SECRET` ใน environment ของ production (อักขระสุ่มอย่างน้อย 32 ตัว:
  `openssl rand -hex 32`) ดู [Environment variable](#environment-variables)
- `NODE_ENV=production`
- deploy โฟลเดอร์ `easy-cms/migrations` ไปด้วย และรัน `easy-cms migrate`
- เริ่ม server **จาก root ของโปรเจกต์**: path ฐานข้อมูลแบบ relative, migration และไฟล์ที่อัปโหลด
  อ้างอิงจาก working directory
- ไฟล์ที่อัปโหลดลงดิสก์ในเครื่องต้องใช้ persistent volume บนแพลตฟอร์ม serverless ให้ใช้
  [S3 storage](./uploads#s3-cloudflare-r2-and-minio), [Vercel Blob](./uploads#vercel-blob) หรือ
  [Netlify Blobs](./uploads#netlify-blobs)
- ตั้ง `EASY_CMS_SETUP_CODE` ไว้จนกว่าจะมี admin คนแรก กันคนอื่นแย่งเว็บ
- build บน OS และสถาปัตยกรรมเดียวกับ server เมื่อใช้ SQLite (native driver)
- เมื่ออยู่หลัง proxy ที่เชื่อถือได้ ให้เปิด `trustProxy` เพื่อจำกัดอัตราการเข้าสู่ระบบแยกตาม IP
- ตั้งค่า `auth.trustedOrigins` หากหน้า admin หรือ frontend เรียก API จาก origin อื่น
- มี[backup](./backups)ของฐานข้อมูลและไฟล์อัปโหลด และเคยลองกู้คืนแล้ว

หลังเปิดใช้งาน แดชบอร์ดจะบอก admin ว่ามีอะไรต้องดูแล ดู[ตรวจสุขภาพระบบ](./health-checks)

## ขั้นต่อไป {#next-steps}

- [การ Deploy](./deploy/): ทีละขั้นตอนบน Vercel, Netlify, Docker, VPS และโฮสต์อื่นๆ
- [Backup และการอัปเกรด](./backups): สำรองข้อมูลก่อนอัปเกรด
- [ความปลอดภัย](./security): เช็กลิสต์ก่อนขึ้นระบบจริง
