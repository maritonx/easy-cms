# ความปลอดภัย {#security}

::: info หน้านี้สอนอะไร
Easy CMS ป้องกันอะไรให้บ้าง อะไรยังเป็นหน้าที่ของคุณ และเช็กลิสต์ก่อนขึ้นระบบจริง

**ควรอ่านก่อน:** [การควบคุมสิทธิ์](./access-control) และ [ผู้ใช้และการยืนยันตัวตน](./auth)
:::

## สิ่งที่ Easy CMS ทำให้ {#what-easy-cms-does-for-you}

### บัญชีและ session {#accounts-and-sessions}

- **รหัสผ่าน** hash ด้วย scrypt (N=2¹⁷) และไม่มี API ไหนส่งคืน ต้องยาวอย่างน้อย 8 ตัวอักษร
  และต้องไม่อยู่ในรายการรหัสผ่านที่ใช้บ่อยที่สุดราว 2,000 อัน (เช่น `password1` หรือ `iloveyou`)
- **session token** สุ่มขึ้นมา เซ็นด้วย `EASY_CMS_SECRET` และเก็บเฉพาะค่า hash สำเนาของฐานข้อมูลจึงใช้ login ไม่ได้
- **cookie** เป็น `HttpOnly`, `SameSite=Lax` และ `Secure` บน production (หรือเมื่อใช้ HTTPS)
  เมื่อใช้ HTTPS (หรือบน production) cookie ของ session, CSRF และ SSO จะมีชื่อขึ้นต้นด้วย `__Host-`
  (`__Host-ecms-session`, `__Host-ecms-csrf`, `__Host-ecms-sso`) จึงตั้งได้จาก host นี้เท่านั้น subdomain ตั้งไม่ได้
  ส่วนตอนพัฒนาผ่าน HTTP ธรรมดาจะใช้ชื่อเดิม cookie ชื่อเดิมยังอ่านได้อยู่ และการ logout จะล้างทั้งสองแบบ
- **จำกัดการ login**: ล้มเหลว 5 ครั้งต่อ email (และ IP ถ้ารู้) ภายใน 15 นาที การ login จะตอบ `429`
  (`auth.maxLoginAttempts`, `auth.lockWindow`)
- การ logout การเปลี่ยนรหัสผ่าน หรือการปิดใช้งานผู้ใช้ จะปิดทุก session ของคนนั้น
- **การ logout** ตอบพร้อม `Clear-Site-Data: "cache"` เพื่อให้ browser ทิ้งหน้าที่ cache ไว้
  ไม่ใช้ `"storage"` เพราะเว็บของคุณอาจใช้ origin เดียวกันและเก็บข้อมูลของตัวเอง (เช่น ตะกร้าของผู้เยี่ยมชม)
  หน้า admin ยังลบสิ่งที่เก็บไว้ใน browser เกี่ยวกับเนื้อหาด้วย ได้แก่ ฉบับร่างที่ยังไม่บันทึก เอกสารล่าสุด
  โฟลเดอร์ media ล่าสุด และตำแหน่งในรายการ ส่วนค่าที่ตั้งไว้ เช่น ธีม ยังอยู่

### Request {#requests}

- **CSRF**: การเขียนข้อมูลที่ยืนยันตัวตนด้วย session cookie ต้องส่ง CSRF token ของ session ใน header
  `x-csrf-token` และ `Origin` ต้องเป็นของ API เองหรืออยู่ใน `auth.trustedOrigins`
  request ข้ามเว็บที่ไม่มี `Origin` จะถูกปฏิเสธ ส่วน request ที่ใช้ Bearer token ไม่ต้องใช้ CSRF token
  (browser ไม่ส่ง Bearer token ไปเอง)
- **CORS** ปิดเป็นค่าเริ่มต้น `cors` ระบุ origin ที่โค้ดใน browser เรียก API ได้ และมีเฉพาะ
  `auth.trustedOrigins` ที่ส่ง cookie ได้ origin ใน `cors` เขียนข้อมูลได้ด้วยถ้า**ไม่มี** session cookie
  (เช่น [ฟอร์ม](./forms)สาธารณะ) เพราะไม่มี session ให้ปลอม และกฎสิทธิ์ของ collection ยังเป็นตัวตัดสิน
- **ขนาด body** จำกัดที่ 1 MB (JSON) และ `upload.maxFileSize` (ไฟล์ ค่าเริ่มต้น 10 MB)
- **HSTS**: บน production (`NODE_ENV=production`) REST API และหน้า admin ส่ง
  `Strict-Transport-Security: max-age=31536000` (ไม่มี `includeSubDomains`) browser จึงใช้แต่ HTTPS เป็นเวลา 1 ปี
  ถ้าเปิดผ่าน HTTP ธรรมดา browser จะไม่สนใจ header นี้
- **error** แสดงรายละเอียดเฉพาะตอนพัฒนา บน production error ที่ไม่คาดคิดจะตอบ `Internal Server Error`
  และบันทึก log ไว้ที่ server

### เนื้อหา {#content}

- **สิทธิ์ปิดเป็นค่าเริ่มต้น**: ถ้าไม่มีกฎ มีเฉพาะผู้ใช้ที่ login ที่อ่านหรือแก้ collection ได้
  กฎระดับ field จะเอา field ออกจากผลลัพธ์และไม่รับค่าของ field นั้น
- **ไฟล์อัปโหลด** ถูกตรวจจากเนื้อไฟล์ (ไม่ใช่ชื่อไฟล์) จำกัดขนาด เปลี่ยนชื่อ และส่งพร้อม
  `Content-Security-Policy: sandbox` และ `nosniff` ไฟล์ SVG หรือ HTML ที่อัปโหลดจึงรัน script บนเว็บคุณไม่ได้
- **การแสดง rich text** (`renderRichText`) escape ข้อความและ attribute และตัด URL ที่ไม่ปลอดภัย เช่น `javascript:`
- **ลิงก์ตัวอย่าง (preview)** มี token ที่เซ็นแล้วสำหรับเอกสารหรือ global เดียว และหมดอายุใน 1 ชั่วโมง

### หน้า admin {#the-admin}

- หน้า admin ส่ง Content Security Policy แบบเข้มงวด (script มาจาก origin ของคุณเท่านั้น),
  `X-Frame-Options: DENY` และ `Referrer-Policy: same-origin`
- [Admin module](./plugins#admin-components) ถูกส่งจาก server ของคุณให้เฉพาะผู้ใช้ที่ login
  และ config จะไม่รับ URL ของเว็บอื่น

## สิ่งที่ยังเป็นหน้าที่ของคุณ {#what-stays-your-job}

- **เก็บ `EASY_CMS_SECRET` เป็นความลับและให้ยาว** (สุ่ม 32 ตัวอักษรขึ้นไป เช่น `openssl rand -hex 32`)
  ถ้าเปลี่ยนค่านี้ ทุกคนจะถูก logout
- **เขียนกฎสิทธิ์อย่างตั้งใจ** โดยเฉพาะ `read` collection จะเป็นสาธารณะเมื่อคุณกำหนดเท่านั้น
  เช่น `read: () => true` หรือ "เฉพาะที่เผยแพร่แล้ว"
- **ให้บทบาทเท่าที่จำเป็น**: ผู้แก้เนื้อหาใช้ `editor` ไม่ใช่ `admin` มีแต่ admin ที่จัดการผู้ใช้ได้
- **ติดตั้งเฉพาะ plugin ที่เชื่อถือได้** plugin ทำงานบน server ของคุณ และ admin component
  ของมันทำงานด้วยสิทธิ์ของผู้ที่ login อยู่
- **review migration** ก่อน deploy และอัปเดต dependency สม่ำเสมอ
- **สำรองข้อมูล** ทั้งฐานข้อมูลและไฟล์อัปโหลด ดู [Backup](./backups)

## เช็กลิสต์ก่อนขึ้นระบบจริง {#checklist-before-going-live}

- [ ] ตั้ง `EASY_CMS_SECRET` ใน environment ของ server แล้ว ไม่ใช่มีแค่ใน `.env` บนเครื่องคุณ
- [ ] `NODE_ENV=production` และเว็บให้บริการผ่าน HTTPS
- [ ] เว็บให้บริการผ่าน HTTPS เท่านั้น โดย proxy หรือ host redirect HTTP ไป HTTPS
- [ ] กฎ `read` ของทุก collection เป็นไปตามที่ตั้งใจ ลองทดสอบตอนไม่ได้ login
- [ ] `cors` และ `auth.trustedOrigins` มีเฉพาะ origin ของคุณเอง
- [ ] ถ้าอยู่หลัง proxy ที่คุณควบคุม ให้เปิด trust proxy (`trustProxy` สำหรับ Nuxt และ Next.js,
  `--trust-proxy` สำหรับ standalone) เพื่อให้การจำกัด login เห็น IP จริงของผู้ใช้ ระบบใช้ที่อยู่ตัวสุดท้ายของ
  `X-Forwarded-For` และการตรวจ origin ของ CSRF จะใช้ `X-Forwarded-Host` ด้วย ถ้าไม่เปิด trust proxy
  แต่ proxy เปลี่ยน `Host` การเขียนข้อมูลจากหน้า admin จะล้มเหลวด้วย `403` ส่วน Vercel และ Netlify
  ระบบรู้จักเองและไม่ต้องตั้งอะไร ถ้าไม่รู้ IP การ login ผิดจะนับต่ออีเมล และ log ของ server จะบอกไว้
- [ ] `EASY_CMS_SECRET` เป็นค่าสุ่ม (`openssl rand -hex 32`) บน production ค่าที่ดูเหมือนตัวอย่างหรือเป็นรูปแบบซ้ำๆ จะใช้ไม่ได้
- [ ] ตั้ง `EASY_CMS_SETUP_CODE` ไว้จนกว่าจะมี admin คนแรก (บน production server จะเตือนตราบใดที่ยังไม่มี admin
      และไม่มีรหัส) และการสร้าง admin คนแรกจะถูกบันทึกใน audit log
- [ ] `CRON_SECRET` เป็นข้อความสุ่มยาวอย่างน้อย 32 ตัวอักษร เหมือน `EASY_CMS_SECRET`
- [ ] admin คนแรกใช้รหัสผ่านที่แข็งแรง และคนอื่นใช้บทบาท `editor`
- [ ] รัน migration แล้ว (`easy-cms migrate`) และมีการสำรองข้อมูลตามรอบ

## การแจ้งช่องโหว่ {#reporting-a-vulnerability}

แจ้งช่องโหว่แบบส่วนตัวตามที่อธิบายใน
[SECURITY.md](https://github.com/maritonx/easy-cms/blob/main/SECURITY.md) อย่าแจ้งใน issue สาธารณะ

## ขั้นต่อไป {#next-steps}

- [การควบคุมสิทธิ์](./access-control): กฎระดับ collection เอกสาร และ field
- [Migration และการ deploy](./deployment): ส่งการเปลี่ยน schema ขึ้นระบบอย่างปลอดภัย
