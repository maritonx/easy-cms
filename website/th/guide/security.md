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
- **rate limit** (`rateLimit`) เมื่อเปิด: แต่ละ IP ของผู้เข้าชม ผู้ใช้ที่ login และ API key ส่ง request ได้ไม่เกินจำนวนที่กำหนดต่อนาที
  นับรวมทุก instance ถ้าเกิน API ตอบ `429` พร้อม `Retry-After` ดู[ข้างล่าง](#rate-limits)
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
  เปลี่ยนโดยไม่ให้ทุกคนหลุด login ได้ด้วย[การหมุน secret](#rotating-the-secret)
- **เขียนกฎสิทธิ์อย่างตั้งใจ** โดยเฉพาะ `read` collection จะเป็นสาธารณะเมื่อคุณกำหนดเท่านั้น
  เช่น `read: () => true` หรือ "เฉพาะที่เผยแพร่แล้ว"
- **ให้บทบาทเท่าที่จำเป็น**: ผู้แก้เนื้อหาใช้ `editor` ไม่ใช่ `admin` มีแต่ admin ที่จัดการผู้ใช้ได้
- **ติดตั้งเฉพาะ plugin ที่เชื่อถือได้** plugin ทำงานบน server ของคุณ และ admin component
  ของมันทำงานด้วยสิทธิ์ของผู้ที่ login อยู่
- **review migration** ก่อน deploy และอัปเดต dependency สม่ำเสมอ
- **สำรองข้อมูล** ทั้งฐานข้อมูลและไฟล์อัปโหลด ดู [Backup](./backups)

## Rate limit {#rate-limits}

`rateLimit` จำกัดจำนวน request ที่ client หนึ่งส่งเข้า API ได้ต่อนาที กันฐานข้อมูลจาก script หรือผู้เข้าชมที่ยิงมากกว่าการใช้งานปกติมาก
และใช้ได้แม้รันหลาย instance

```ts
export default defineConfig({
  rateLimit: {}, // ใช้ค่าเริ่มต้นข้างล่าง
  // rateLimit: { window: 60, anonymous: 300, users: 1200, apiKeys: 1200 },
})
```

| ใคร | นับตาม | ค่าเริ่มต้นต่อนาที |
|---|---|---|
| ผู้เข้าชมที่ไม่ได้ login | IP | 300 |
| ผู้ใช้ที่ login (รวม admin) | ผู้ใช้ | 1,200 |
| API key | key | 1,200 |

ตั้งกลุ่มไหนเป็น `false` เพื่อไม่จำกัดกลุ่มนั้น เมื่อเกิน API ตอบ `429 Too Many Requests` พร้อม `Retry-After` คือจำนวนวินาทีจนหมดช่วงเวลา
health check (`/healthz`, `/readyz`) และ `jobs/run` ไม่ถูกนับ ใช้กับทุกอย่างใต้ route ของ API รวม endpoint ของ plugin แต่ไม่รวม Local API
หรือหน้าที่แอปของคุณ render ฝั่ง server

- **เปิดแล้วต้องสร้าง migration** สำหรับตาราง `rate-limits` (`easy-cms migrate:create`) โปรเจกต์ที่สร้างด้วย `create-easy-cms` 1.19 ขึ้นไปเปิดไว้แล้ว
- **ยอดนับรวมกันผ่านฐานข้อมูลทุกไม่กี่วินาที** ไม่ใช่ทุก request API จึงไม่ต้องเขียนฐานข้อมูลทุกครั้งที่อ่าน ระหว่างรอบ client อาจเกินไปเล็กน้อย
  ตามจำนวนที่ instance อื่นนับไปในช่วงนั้น
- **IP ต้องเป็นของผู้เข้าชมจริง** Vercel และ Netlify รู้เอง ถ้าอยู่หลัง proxy ของคุณเองให้ตั้ง `trustProxy` ถ้าไม่รู้ IP ผู้เข้าชมที่ไม่ได้ login
  จะไม่ถูกจำกัด (ถ้านับรวมเป็นคนเดียว ทุกคนจะโดนตัดพร้อมกัน) และ log ของ server จะเตือนหนึ่งครั้ง
- **ไม่เก็บ IP** ตารางเก็บแค่ HMAC ของ IP ที่สร้างจาก secret
- **build แบบ static** ดึงหลายหน้าพร้อมกัน ให้ build ด้วย API key ที่เกณฑ์สูงกว่า (หรือตั้ง `apiKeys: false`) หรือใช้ Local API

login การสมัครสมาชิก และการส่งฟอร์ม ยังมีการจำกัดของตัวเองที่ต่ำกว่า

## หมุน secret {#rotating-the-secret}

เปลี่ยน `EASY_CMS_SECRET` เมื่ออาจรั่ว หรือเปลี่ยนตามรอบ โดยไม่ทำให้ทุกคนหลุด login `previousSecrets`
คือรายการ secret ที่เคยใช้ สิ่งที่มันเซ็นไว้ยังตรวจผ่าน ส่วนของใหม่ทั้งหมดเซ็นด้วย `secret`

```ts
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  previousSecrets: (process.env.EASY_CMS_PREVIOUS_SECRETS ?? '').split(',').filter(Boolean),
  // ...
})
```

โปรเจกต์ที่สร้างด้วย `create-easy-cms` 1.18 ขึ้นไปมีบรรทัดนี้แล้ว โปรเจกต์เก่าให้เพิ่มเอง

1. **deploy พร้อมกันทั้งสองตัว** สร้าง secret ใหม่ (`openssl rand -hex 32`) ตั้งเป็น `EASY_CMS_SECRET` และย้ายตัวเก่าไปที่
   `EASY_CMS_PREVIOUS_SECRETS` session, ลิงก์รหัสผ่านและคำเชิญ, preview token, ลิงก์ไฟล์ส่วนตัว และฟอร์มที่เปิดค้างไว้
   ยังใช้ได้
2. **เซ็น audit log ใหม่** `npx easy-cms audit:resign` เซ็นรายการที่เซ็นด้วย secret เก่าใหม่ด้วย secret ใหม่ รายการที่ไม่มี
   secret ไหนตรวจผ่าน แปลว่าถูกแก้ในฐานข้อมูล จะไม่ถูกแตะและถูกแสดงรายการไว้
3. **เอา secret เก่าออก** เมื่อสิ่งที่มันเซ็นหมดอายุแล้ว คือ session (`auth.tokenExpiration` ค่าเริ่มต้น 7 วัน) และลิงก์คำเชิญ
   (`auth.inviteExpiration` 7 วัน) session ที่ยังใช้ secret เก่าอยู่จะหมดอายุตอนนั้น

ถ้า secret เก่ารั่ว ไม่ต้องรอ ให้เอาออกทันที แล้วทุกคน login ใหม่

- **rate limit** ของฟอร์มสาธารณะจะเริ่มนับใหม่ เพราะ key สร้างจาก secret
- **ไม่เกี่ยวข้อง:** `backups.encryptionKey` เป็น key แยกต่างหาก backup ที่ทำด้วย key เก่าต้องใช้ key นั้นเปิด ส่วน API key
  ไม่ขึ้นกับ secret

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
