# Deploy ด้วยคลิกเดียว {#one-click-deploy}

::: info หน้านี้สอนอะไร
เปิดเว็บพร้อมหน้า admin บน Vercel หรือ Netlify ได้ในไม่กี่คลิก และสิ่งที่ควรทำต่อ

**ควรอ่านก่อน:** ไม่ต้อง ถ้าต้องการเพิ่ม Easy CMS เข้าแอปของคุณเอง ดู [เริ่มต้นใช้งาน](./getting-started)
:::

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaritonx%2Feasy-cms%2Ftree%2Fmain%2Ftemplates%2Fnext-starter&project-name=easy-cms&repository-name=easy-cms&env=EASY_CMS_SETUP_CODE&envDescription=A+code+you+choose%3A+you+type+it+to+create+the+first+admin+at+%2Fadmin&envLink=https%3A%2F%2Fmaritonx.github.io%2Feasy-cms%2Fguide%2Fone-click-deploy&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22public%22%7D%5D)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/maritonx/easy-cms&create_from_path=templates/next-starter)

ปุ่มทั้งสองคัดลอก [starter](https://github.com/maritonx/easy-cms/tree/main/templates/next-starter) ไปเป็น repository
ใหม่ของคุณแล้ว deploy ให้ ได้บล็อก Next.js พร้อมหน้า admin (บทความ หมวดหมู่ สื่อ SEO [บทบาท](./roles) และ
[audit log](./audit-log)) และมีบทความตัวอย่าง

## ได้อะไรบ้าง {#what-you-get}

| | Vercel | Netlify |
|---|---|---|
| ฐานข้อมูล | Neon Postgres ที่ปุ่มสร้างให้ | Netlify Database (Postgres) สร้างตอน deploy ครั้งแรก |
| ไฟล์อัปโหลด | Vercel Blob ที่ปุ่มสร้างให้ | Netlify Blobs สร้างตอนใช้ครั้งแรก |
| สิ่งที่ต้องกรอก | รหัส setup | รหัส setup |

สิ่งเดียวที่ต้องกรอกคือ **รหัส setup** (`EASY_CMS_SETUP_CODE`) จะเป็นข้อความอะไรก็ได้ที่คุณเลือก เว็บที่เพิ่ง deploy
ใครเปิด `/admin` ก่อนก็ตั้งตัวเองเป็น admin ได้ รหัสนี้ทำให้มีแต่คุณที่ทำได้

## หลัง deploy {#after-deploying}

1. เปิด `/admin` ของเว็บใหม่
2. สร้าง admin คนแรก: ชื่อ อีเมล รหัสผ่าน และรหัส setup
3. แก้หรือลบบทความตัวอย่าง แล้วเขียนของคุณเอง เชิญทีมได้ที่ **ตั้งค่า → ผู้ใช้**

## ถ้ามีบางอย่างไม่ทำงาน {#if-something-doesnt-work}

**อัปโหลดไม่ได้ และมีข้อความให้ connect Blob store (Vercel)** แปลว่า deployment นั้นไม่มี
`BLOB_READ_WRITE_TOKEN` อาจเพราะไม่ได้เพิ่ม Blob store ในฟอร์ม deploy หรือเชื่อมหลังจาก deploy เริ่มไปแล้ว

1. ในโปรเจกต์บน Vercel เปิดแท็บ **Storage** ถ้ายังไม่มี Blob store ให้กด **Create** → **Blob** และเลือก **Public**
2. ที่ store นั้นกด **Connect Project** เลือกโปรเจกต์นี้และทุก environment
3. **Settings → Environment Variables** จะมี `BLOB_READ_WRITE_TOKEN` ขึ้นมาเอง อย่านำค่านี้ไปใส่ที่อื่น ใครได้ไปจะแก้ไฟล์
   ของคุณได้
4. **Deployments** → **⋯** → **Redeploy** เพราะ environment variable ใหม่มีผลกับ deployment ใหม่เท่านั้น

**เว็บล้มพร้อมข้อความ "No database"** แปลว่าแพลตฟอร์มไม่ได้ให้ URL ฐานข้อมูล บน Netlify ฐานข้อมูล Netlify Database
จะถูกสร้างตอน deploy ครั้งแรกเพราะ starter ติดตั้ง `@netlify/database` ไว้ ต้องใช้แพ็กเกจแบบ credit-based และดูได้ที่
**Data & Storage → Database** เว็บเก่าที่สร้างจาก starter ใช้ Netlify DB (beta) ซึ่งสร้างใหม่ไม่ได้แล้ว ให้อัปเดต
`package.json` และ `easy-cms.config.ts` ตาม [starter](https://github.com/maritonx/easy-cms/tree/main/templates/next-starter)
หรือตั้ง `DATABASE_URL` เป็น Postgres ใดก็ได้ แล้ว redeploy

**`/admin` ไม่ถามรหัส setup** แปลว่ายังไม่ได้ตั้ง `EASY_CMS_SETUP_CODE` ให้เพิ่มใน environment variable ของโปรเจกต์
แล้ว redeploy ก่อนที่จะมีใครสร้าง admin คนแรก

## เมื่อใช้งานจริง {#for-real-use}

- **ตั้ง `EASY_CMS_SECRET`** ใน environment variable ของโปรเจกต์ (`openssl rand -hex 32`) แล้ว deploy ใหม่
  ระหว่างนี้ starter สร้างค่าให้จาก URL ฐานข้อมูล การ deploy คลิกเดียวจึงใช้ได้ทันที ความลับเท่ากับรหัสผ่านฐานข้อมูล และ
  จะเปลี่ยนถ้ารหัสนั้นเปลี่ยน
- **เปลี่ยนโครงสร้างเนื้อหา** ใน `easy-cms.config.ts` ของ repository ใหม่ สร้าง migration
  (`npx easy-cms migrate:create <name>`) แล้ว push ทุกการ deploy จะรัน `easy-cms migrate` ก่อน
- **อีเมล** สำหรับคำเชิญและลืมรหัสผ่าน ดู [อีเมล](./email)
- **โดเมนของคุณ** ตั้งที่แพลตฟอร์ม และตั้ง `serverURL` ใน config

## ทำงานอย่างไร {#how-it-works}

ขั้น build รัน `easy-cms migrate` ใส่บทความตัวอย่างเมื่อฐานข้อมูลยังไม่มีบทความ แล้วจึง `next build` config เลือกฐาน
ข้อมูลจาก `DATABASE_URL` (Vercel) หรือ `NETLIFY_DB_URL` (Netlify Database ซึ่ง Netlify สร้างให้เพราะ starter ติดตั้ง
`@netlify/database` ต้องใช้แพ็กเกจ Netlify แบบ credit-based) และเลือกที่เก็บไฟล์จาก
`BLOB_READ_WRITE_TOKEN` ([`@easy-cms/storage-vercel-blob`](./uploads#vercel-blob)) หรือ Netlify
([`@easy-cms/storage-netlify-blobs`](./uploads#netlify-blobs)) ถ้าไม่มีจะใช้ PGlite และโฟลเดอร์ `uploads` สำหรับตอนพัฒนา

ฐานข้อมูลอื่นก็ใช้ได้ เช่น Supabase หรือ Postgres ใดๆ ผ่าน `DATABASE_URL` หรือ Turso กับ `@easy-cms/db-sqlite`
ดู [ฐานข้อมูล](./databases)

## ขั้นต่อไป {#next-steps}

- [การ Deploy](./deploy/): ตั้งค่า Vercel, Netlify, Docker หรือ VPS เอง
- [Migration และการ deploy](./deployment): migration และ environment variable
- [บทเรียน](./tutorial): สร้างเว็บด้วย Easy CMS ทีละขั้น
