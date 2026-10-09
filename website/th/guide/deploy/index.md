# เลือกที่ deploy {#choosing-a-host}

::: info หน้านี้สอนอะไร
โฮสต์แบบไหนเหมาะกับเว็บของคุณ ทุกโฮสต์ต้องการอะไรจากคุณ และ checklist ก่อนเปิดใช้งานจริง

**ควรอ่านก่อน:** [Migration และการ deploy](../deployment)
:::

Easy CMS รันได้ทุกที่ที่รัน server ด้วย Node.js 22.12 ขึ้นไปได้ สิ่งที่ต้องมีคือที่เก็บ **ฐานข้อมูล** และที่เก็บ
**ไฟล์อัปโหลด** ซึ่งแต่ละโฮสต์อาจมีให้หรือไม่มีก็ได้ ไม่รองรับ edge runtime (Cloudflare Workers, Vercel Edge Functions)

## เลือกโฮสต์ {#which-host}

| | ฐานข้อมูล | ไฟล์อัปโหลด | งานตามเวลา | เหมาะกับ |
|---|---|---|---|---|
| [Vercel](./vercel) | Postgres แบบ hosted (Neon) หรือ Turso | Vercel Blob หรือ S3 | cron เรียก `jobs/run` | เว็บ Next.js, preview deployment |
| [Netlify](./netlify) | Netlify Database หรือ Postgres แบบ hosted | Netlify Blobs หรือ S3 | scheduled function เรียก `jobs/run` | เว็บ Next.js บน Netlify |
| [Docker](./docker) | Postgres ใน container หรือ SQLite บน volume | volume หรือ S3 | server รันเองทุกนาที | server หรือแพลตฟอร์มใดก็ได้ที่รัน container |
| [VPS](./vps) | SQLite บน disk หรือ Postgres | disk | server รันเองทุกนาที | server เครื่องเดียวที่คุณดูแลเอง ค่าใช้จ่ายต่ำสุด |
| [โฮสต์อื่นๆ](./other-hosts) | ขึ้นกับโฮสต์ | ขึ้นกับโฮสต์ | ขึ้นกับโฮสต์ | Railway, Render, Fly.io, Coolify… |

โฮสต์สองแบบทำงานต่างกัน:

- **Serverless** (Vercel, Netlify): ไม่มี disk ที่เก็บไฟล์ได้ถาวร และไม่มี process ที่รันค้างไว้ ต้องใช้ฐานข้อมูลและที่เก็บไฟล์แบบ
  hosted และเรียก endpoint ของงานตามเวลาจาก cron
- **รันต่อเนื่อง** (Docker, VPS, แพลตฟอร์มส่วนใหญ่): server ตัวเดียวที่รันอยู่ตลอด เก็บ SQLite และไฟล์อัปโหลดไว้บน disk
  ถาวรได้ และ server รัน[งานตามเวลา](../drafts#scheduled-publishing)เองทุกนาที

## ทุกโฮสต์ต้องมี {#what-every-host-needs}

| | |
|---|---|
| `EASY_CMS_SECRET` | ตัวอักษรสุ่มอย่างน้อย 32 ตัว (`openssl rand -hex 32`) ถ้าไม่มี API จะตอบ 500 |
| `NODE_ENV=production` | โหมด production ไม่ยอม start ถ้ายังมี migration ค้าง และไม่เปลี่ยน schema เอง |
| Migration | สร้างด้วย `easy-cms migrate:create` แล้ว commit และรัน `easy-cms migrate` ก่อนเวอร์ชันใหม่จะ start ดู [Migration และการ deploy](../deployment) |
| `EASY_CMS_SETUP_CODE` | ตั้งไว้จนกว่าจะมี admin คนแรก เพื่อไม่ให้คนอื่นยึดเว็บที่เพิ่ง deploy |
| `serverURL` | ที่อยู่สาธารณะของเว็บ ใช้สร้าง URL ของไฟล์และลิงก์ในอีเมล ดู [Health checks](../health-checks#no-serverurl) |
| เชื่อ proxy | ถ้าอยู่หลัง proxy หรือแพลตฟอร์มที่เชื่อถือได้ ให้เปิด `trustProxy` (Next.js, Nuxt) หรือ `--trust-proxy` (standalone) เพื่อให้การจำกัดการ login เห็น IP ของผู้เข้าชมแต่ละคน |
| งานตามเวลา | บน serverless ให้ cron เรียก `<api>/jobs/run` พร้อม `CRON_SECRET` งานเหล่านี้คือเผยแพร่บทความที่ตั้งเวลาไว้ ส่ง webhook ซ้ำ ส่งอีเมลที่รอคิว และสำรองข้อมูล |

## ก่อนเปิดใช้งานจริง {#before-going-live}

- [ ] secret, รหัส setup และ URL ฐานข้อมูลตั้งไว้ใน environment ของโฮสต์ ไม่ได้ commit เข้า git
- [ ] `easy-cms migrate` รันก่อนเวอร์ชันใหม่จะ start ทุกครั้ง
- [ ] ไฟล์อัปโหลดไปอยู่บน disk ถาวรหรือที่เก็บไฟล์ภายนอก ([อัปโหลดและ media](../uploads#serving-and-storage))
- [ ] งานตามเวลาทำงาน: server รันเองทุกนาที หรือเรียกจาก cron
- [ ] ตั้งค่า `email` แล้ว เพื่อให้รีเซ็ตรหัสผ่านและคำเชิญใช้ได้ ([อีเมล](../email))
- [ ] เว็บเป็น HTTPS และตั้ง `serverURL` เป็นที่อยู่ของเว็บ
- [ ] [สำรองข้อมูล](../backups)ทำงาน และเคยลองกู้คืนแล้ว
- [ ] ทำ [checklist ความปลอดภัย](../security) ครบ

## ขั้นต่อไป {#next-steps}

- [Deploy ด้วยคลิกเดียว](../one-click-deploy): เว็บ starter บน Vercel หรือ Netlify ในไม่กี่คลิก
- [Vercel](./vercel), [Netlify](./netlify), [Docker](./docker) หรือ [VPS](./vps): ทีละขั้นตอน
