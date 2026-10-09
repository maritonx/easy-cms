# Easy CMS — ผลตรวจความปลอดภัยตาม OWASP ASVS 5.0 ระดับ L1

- **Issue:** [#71](https://github.com/maritonx/easy-cms/issues/71) (milestone `0.50 · Hardening`)
- **วันที่ตรวจ:** 2026-10-09 · **เวอร์ชันที่ตรวจ:** 0.47.2 · **อัปเดตล่าสุด:** 0.48.0
- **วิธีตรวจ:** อ่านโค้ดทั้ง monorepo แบ่งตามหมวดของ ASVS 5.0.0 ข้อที่ร้ายแรงยืนยันซ้ำด้วยการอ่านโค้ด
  และพิสูจน์ด้วย test ที่ล้มกับโค้ดเดิม ไม่ใช่ pentest
- **หมายเหตุ:** เลขข้อของ ASVS อ้างจากความจำ ก่อนอ้างอิงอย่างเป็นทางการต้องเทียบกับเอกสาร ASVS อีกครั้ง
- **การเปิดเผย:** ข้อที่แก้แล้วมีรายละเอียดเต็ม ข้อที่ยังไม่แก้เขียนไว้สั้นๆ จนกว่าจะออก release ที่แก้
  พบช่องโหว่เพิ่ม แจ้งตาม [SECURITY.md](../../SECURITY.md)

---

## 1. สรุป

| | |
|---|---|
| แก้แล้ว | 17 ข้อ: 2 วิกฤต/สูง (0.47.3), 6 กลาง–สูง และ 2 ต่ำ (0.47.4), 7 กลาง (0.48.0) |
| ยังเปิดอยู่ | 20 ข้อระดับต่ำ (milestone 0.60) |
| ไม่ผ่านระดับ L1 ที่ยังเหลือ | 6.2.4 ไม่เช็ครหัสผ่านที่ใช้บ่อย, 3.4.1 HSTS, 14.3.1 ข้อมูลในเบราว์เซอร์หลัง logout |
| ไม่พบ | SQL injection, XSS ในหน้า admin, eval, path traversal, การแก้ราคาหรือสถานะออร์เดอร์จาก client |

**ผู้ที่ใช้ 0.47.2 หรือเก่ากว่า: อัปเกรดทุกแพ็กเกจ `@easy-cms/*` เป็น 0.47.4 ขึ้นไป** (0.48.0 แก้เพิ่มอีก 7 ข้อ และมีขั้นตอนอัปเกรดใน changelog)
โดยเฉพาะผู้ที่ใช้ `@easy-cms/plugin-multi-tenant` ร่วมกับ `auth.members`

## 2. แก้แล้ว

| # | ระดับ | เรื่อง | ASVS | แก้ใน |
|---|---|---|---|---|
| C1 | วิกฤต | **multi-tenant: สมาชิกเว็บได้สิทธิ์ของผู้ดูแลทุก tenant.** เมื่อ `publicReads: 'all'` สมาชิก (เช่นลูกค้าที่สมัครเอง) ที่ไม่ระบุ tenant ถูกนับเป็นผู้มีสิทธิ์ทุก tenant จึงแก้ผู้ใช้คนอื่น (รวมรหัสผ่านของ admin) และสร้างหรือลบ tenant ได้ ตอนนี้สิทธิ์ทุก tenant เป็นของ staff เท่านั้น และการอ่านทุก tenant ไม่ให้สิทธิ์เขียน | 8.2.1, 8.4.1 | 0.47.3 |
| C2 | สูง | **multi-tenant: สมาชิกเว็บดูรายชื่อ staff ของ tenant ใดก็ได้** (อีเมล ชื่อ บทบาท) ตอนนี้สมาชิกเห็นเฉพาะบัญชีตัวเอง | 8.2.2, 8.4.1 | 0.47.3 |
| S1 | กลาง–สูง | **ยึดบัญชีไว้ก่อนเจ้าของสมัคร.** การสมัครด้วยอีเมลของคนอื่นทิ้งรหัสผ่านของผู้สมัครไว้ในบัญชีที่รอยืนยัน เมื่อเจ้าของอีเมลยืนยันหรือ login ด้วย SSO บัญชีก็ยังมีรหัสนั้น ตอนนี้การสมัครซ้ำแทนรหัสและลิงก์เดิม และ SSO ลบรหัสที่ตั้งก่อนยืนยัน | 6.4.1, V10 | 0.47.4 |
| S2 | กลาง | **ร้านค้า: ปุ่มจัดการออร์เดอร์ (จ่ายแล้ว ส่งแล้ว ยกเลิก คืนเงิน) ไม่เช็คสิทธิ์แก้ไข** บทบาทที่อ่านออร์เดอร์ได้อย่างเดียวจึงเปลี่ยนสถานะหรือสั่งคืนเงินได้ | 8.2.1 | 0.47.4 |
| S3 | กลาง | **GraphQL ส่งฉบับร่างให้สมาชิกเว็บที่ขอ** ตอนนี้ Local API บังคับกฎเดียวกับ REST ทุกทาง | 8.2.2 | 0.47.4 |
| S5 | กลาง | **body ที่ไม่ระบุ `Content-Length` ถูกอ่านทั้งก้อนก่อนวัดขนาด** ทำให้ memory หมดได้ ตอนนี้วัดระหว่างอ่านและหยุดเมื่อเกิน | 5.2.1, V4 | 0.47.4 |
| S9 | กลาง | **ลิงก์ยืนยันอีเมลใช้ login ซ้ำได้จนหมดอายุ** ตอนนี้ใช้ได้ครั้งเดียว | 6.4.1 | 0.47.4 |
| S12 | กลาง | **multi-tenant: admin ของ tenant ดึงบัญชีใดก็ได้เข้า tenant และรู้ว่าอีเมลนั้นมีบัญชี** ตอนนี้ดึงสมาชิกเว็บและผู้มีสิทธิ์ทุก tenant ไม่ได้ คำตอบเหมือนกันไม่ว่ามีบัญชีหรือไม่ และเจ้าของบัญชีได้อีเมลแจ้ง | 8.2.1 | 0.47.4 |
| L1 | ต่ำ | admin ของ tenant ถอดการเชื่อม SSO ของคนอื่นได้ ตอนนี้ต้องเป็น admin ของระบบ | 8.2.1 | 0.47.4 |
| L13 | ต่ำ | อัปโหลดจากลิงก์: ที่อยู่ IPv4 ภายในที่อยู่ใน IPv6 (NAT64, `::a.b.c.d`) ไม่ถูกกัน | V1 (SSRF) | 0.47.4 |
| S4 | กลาง | **ไฟล์ที่ผู้ใช้อัปโหลดบน cloud storage.** ลิงก์อัปโหลดตรงของ S3 ไม่ผูก `Content-Type` จึงส่งไฟล์ให้ storage เสิร์ฟเป็นหน้าเว็บได้ และ SVG (ในค่าเริ่มต้น `image/*`) ถูกเสิร์ฟจาก bucket/CDN โดยไม่มี CSP sandbox ตอนนี้ `image/*` ไม่รวม SVG และหลังอัปโหลดตรงต้องได้ชนิดที่ storage เก็บตรงกับที่ตรวจ | 5.2.2, 3.2.1 | 0.48.0 |
| S6 | กลาง | **secret ที่เดาได้.** template เคยใช้ค่าคงที่บน production เมื่อไม่ได้ตั้ง `EASY_CMS_SECRET` และไม่มีฐานข้อมูลภายนอก ตอนนี้ใช้ค่าสุ่มต่อ process และ core ไม่รับ secret ที่ดูเป็นตัวอย่างหรือรูปแบบซ้ำบน production | V13, 9.1.3 | 0.48.0 |
| S7 | กลาง | **rate limit ของ login.** `trustProxy` เคยใช้ที่อยู่ตัวแรกของ `X-Forwarded-For` ซึ่ง client เขียนเอง จึงเดารหัสได้ไม่จำกัด ตอนนี้ใช้ตัวสุดท้าย รู้ IP เองบน Vercel/Netlify และ Nuxt และเตือนใน log เมื่อไม่รู้ IP | 6.3.1, 6.1.1 | 0.48.0 |
| S8 | กลาง | **เปลี่ยนรหัสผ่านหรืออีเมลของตัวเองโดยไม่ถามรหัสเดิม** ตอนนี้ต้องส่ง `currentPassword` | 6.2.3 | 0.48.0 |
| S10 | กลาง | **SSO ผูกเข้าบัญชี staff เดิมจากอีเมล** และ `microsoft()` ใช้ user principal name แทนอีเมล ตอนนี้ staff เชื่อมจากหน้าบัญชีก่อน เว้นแต่ provider ตั้ง `linkByEmail` | V10 | 0.48.0 |
| S11 | กลาง | **multi-tenant: admin ของ tenant แก้ข้อมูลที่ใช้ร่วมกันทุก tenant ได้** ตอนนี้แก้ได้เฉพาะที่ระบุใน `editShared` | 8.2.1 | 0.48.0 |
| S13 | กลาง | **multi-tenant: หน้า "การส่ง" ไม่แยก tenant** ตอนนี้เฉพาะ admin ของระบบ | 8.4.1 | 0.48.0 |

ทุกข้อมี test: `plugin-multi-tenant/test/{site-members,multi-tenant}.test.ts`, `plugin-ecommerce/test/order-roles.test.ts`,
`integration/test/{members,sso,rest,framework,upload,direct-uploads}.test.ts`, `core/test/{remote-file,validate-config}.test.ts`
และ e2e ของการเปลี่ยนรหัสผ่านและ SSO

## 3. ยังเปิดอยู่

### ต่ำ (milestone 0.60)

| # | เรื่อง | ASVS | Issue |
|---|---|---|---|
| L2 | เช็ครหัสผ่านที่ใช้บ่อย | 6.2.4 | [#97](https://github.com/maritonx/easy-cms/issues/97) |
| L3 | เพิกถอน API key เมื่อรีเซ็ตรหัสผ่าน | 7.4 | [#97](https://github.com/maritonx/easy-cms/issues/97) |
| L4 | setup code บน production, audit การสร้าง admin คนแรก, ความยาว `cronSecret`, method ของ `/jobs/run` | V13 | [#97](https://github.com/maritonx/easy-cms/issues/97) |
| L5 | `/shop/confirm` ผูกกับตะกร้าหรือผู้ซื้อ | 8.2.2 | [#98](https://github.com/maritonx/easy-cms/issues/98) |
| L6 | `/admin/media-usage` นับตามสิทธิ์ | 8.2.1 | [#98](https://github.com/maritonx/easy-cms/issues/98) |
| L7 | preview token อ่านตามสิทธิ์ของผู้ออก | 8.2.2 | [#98](https://github.com/maritonx/easy-cms/issues/98) |
| L8 | ตอบ 404 แทน 403 เมื่อไม่มีสิทธิ์ | 8.2.2 | [#98](https://github.com/maritonx/easy-cms/issues/98) |
| L9 | ออร์เดอร์โอนเงินที่ไม่จ่ายหมดอายุและคืนสต็อก | 2.3.1 | [#100](https://github.com/maritonx/easy-cms/issues/100) |
| L10 | ล้างข้อมูลในเบราว์เซอร์เมื่อ logout (`Clear-Site-Data`) | 14.3.1 | [#99](https://github.com/maritonx/easy-cms/issues/99) |
| L11 | HSTS และเอกสาร deploy | 3.4.1, 12.2.1 | [#99](https://github.com/maritonx/easy-cms/issues/99) |
| L12 | cookie prefix `__Host-`, `Secure` ของ cookie tenant | 3.3.1 | [#99](https://github.com/maritonx/easy-cms/issues/99) |
| L14 | GraphQL introspection บน production | 4.3.2 | [#101](https://github.com/maritonx/easy-cms/issues/101) |
| L15 | charset ของไฟล์ข้อความ | 4.1.1 | [#99](https://github.com/maritonx/easy-cms/issues/99) |
| L16 | backup: เข้ารหัส, `.gitignore` | V14 | [#101](https://github.com/maritonx/easy-cms/issues/101) |
| L17 | SMTP บังคับ STARTTLS | 12.3 | [#101](https://github.com/maritonx/easy-cms/issues/101) |
| L18 | audit log: ค่าเริ่มต้นและการตรวจรายการท้าย | V16 | [#101](https://github.com/maritonx/easy-cms/issues/101) |
| L19 | `x-forwarded-host` และ Host ใน sitemap/robots ที่ cache | V3 | [#99](https://github.com/maritonx/easy-cms/issues/99) |
| L20 | rate limit ของฟอร์มเมื่อไม่มี IP | 2.3 | [#101](https://github.com/maritonx/easy-cms/issues/101) |
| L21 | multi-tenant: ข้อมูล membership, unique ใน group/array, `audit/verify`, คำเตือนการตั้งค่า | 8.4.1 | [#102](https://github.com/maritonx/easy-cms/issues/102) |
| L22 | ตาราง Supported versions ใน `SECURITY.md` (#73) | — | [#73](https://github.com/maritonx/easy-cms/issues/73) |

## 4. สิ่งที่ผ่าน

- **Session:** token 256 บิตจาก CSPRNG เก็บเป็น SHA-256, cookie HttpOnly + SameSite=Lax + Secure บน https/production,
  logout และปิดบัญชีแล้ว session หมด, เปลี่ยนรหัสแล้ว session อื่นหมด
- **Token:** ทุกตัวลงลายเซ็น HMAC-SHA256 แยก prefix ตามจุดประสงค์ มีวันหมดอายุ เทียบแบบเวลาคงที่; API key 256 บิต เก็บเป็น hash
- **รหัสผ่าน:** scrypt N=2^17, ขั้นต่ำ 8 ตัว ไม่มีกฎผสมตัวอักษร ไม่ตัดความยาว, เช็คหลอกเมื่อไม่มีอีเมล
- **SSO:** PKCE S256, `state`, `nonce`, ตรวจ ID token ด้วย oauth4webapi, redirect ได้เฉพาะในเว็บ
- **สิทธิ์:** ตัดสินที่ Local API ทุกทาง (REST, GraphQL, MCP, populate) ด้วย `overrideAccess: false`;
  สิทธิ์ระดับ field ใช้กับผลลัพธ์ การกรอง และการเรียงด้วย
- **Mass assignment:** `createdBy`, role/active/emailVerified, tenant, ราคาและสถานะออร์เดอร์แก้จาก client ไม่ได้
- **ร้านค้า:** ราคาและยอดรวมคำนวณที่ server, ตัดสต็อกแบบ atomic, เปลี่ยนสถานะแบบมีเงื่อนไข, ตรวจลายเซ็น webhook ของ Stripe และยอดเงิน
- **Injection:** query แบบ parameterized และเช็คชื่อ field กับ config, ไม่มี `eval`, rich text เก็บเป็น JSON และ render แบบ allowlist,
  หน้า admin ไม่มี `v-html`, JSON-LD และอีเมล escape ถูกต้อง, CSV กัน formula
- **หน้าเว็บ:** CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `nosniff` บนหน้า admin; CSRF (Origin + token) ทุก request ที่เปลี่ยนข้อมูล
  รวม endpoint ของ plugin; CORS เริ่มต้นปิด
- **ไฟล์:** ตรวจชนิดจากเนื้อหา, นามสกุลมาจากชนิดที่ตรวจได้, ชื่อไฟล์สุ่มต่อท้าย, ไม่มี path traversal,
  ไฟล์ที่ Easy CMS เสิร์ฟเองมี `nosniff` + CSP `sandbox`, ไฟล์ส่วนตัวต้องมีลิงก์ที่เซ็นหรือสิทธิ์
- **Error และ log:** production ไม่ส่ง stack trace, response ที่ต้อง login เป็น `no-store`, `passwordHash` และ token ไม่ออกใน response,
  audit log ลงลายเซ็นทีละรายการ
- **SSRF:** อัปโหลดจากลิงก์ปิดเป็นค่าเริ่มต้น, เช็ค host, กันที่อยู่ภายในหลัง resolve DNS ทุกครั้งที่ redirect; webhook ใช้ URL จาก config เท่านั้น

## 5. สิ่งที่การ deploy ต้องทำ

- production ใช้ HTTPS พร้อม HSTS และ redirect จาก HTTP
- ตั้ง `EASY_CMS_SETUP_CODE` ก่อน deploy ครั้งแรก
- `secret` สุ่ม ยาวอย่างน้อย 32 ตัว (การเปลี่ยนทำให้ทุกคน logout); `cronSecret` ยาวและสุ่มเหมือนกัน
- เปิด `trustProxy` เฉพาะหลัง proxy ที่เพิ่มที่อยู่ลงใน `X-Forwarded-For` (Vercel และ Netlify ไม่ต้องเปิด)
- อนุญาต SVG (`image/svg+xml`) เฉพาะเมื่อไว้ใจคนที่อัปโหลด และเสิร์ฟ bucket สาธารณะจาก domain อื่น
- `backups.storage` ต้องไม่เป็น bucket สาธารณะ

## 6. ยังไม่ได้ตรวจ

- การทดสอบกับบริการจริง (Google, Vercel Blob, Stripe): #67–#69
- pentest จากภายนอก: หลัง 1.0 เมื่อมีผู้ใช้ production
