# ADR-0023: ระบบอีเมลใน core และ plugin form builder

- **สถานะ:** Accepted
- **วันที่:** 2026-09-29

## บริบท

ต้องการ form builder แบบ Payload: ผู้แก้เนื้อหาสร้างฟอร์มเอง ผู้เข้าชมส่งข้อมูล และมีอีเมลแจ้งเตือน แต่ core ยังส่งอีเมลไม่ได้
และฟอร์มที่เปิดให้คนทั่วไปส่งต้องมีตัวกันสแปม

## การตัดสินใจ

**อีเมลใน core**
- `email: EmailAdapter` (`from?`, `send(message)`) แบบเดียวกับ storage adapter เพราะจะใช้ซ้ำ เช่น ลืมรหัสผ่าน
  `consoleEmail()` สำหรับ dev และแพ็กเกจ `@easy-cms/email-smtp` (nodemailer) ที่อ่านค่าตอนส่งฉบับแรก ไม่ใช่ตอนสร้าง
- `cms.sendEmail()` บันทึกลงคิว `email-deliveries` ก่อนแล้วส่งเบื้องหลัง ส่งไม่สำเร็จจะลองใหม่ผ่าน `runJobs()`
  (1 นาทีถึง 12 ชั่วโมง) เหมือน webhook ตารางถูกเพิ่มเฉพาะเมื่อตั้ง `email` ไม่มี adapter แล้วส่งจะเตือนและข้าม

**CSRF สำหรับ origin ใน `cors`**
- request ที่ไม่มี session cookie จาก origin ใน `cors` เขียนได้ เพราะ CSRF กันการใช้ cookie ของผู้ใช้ และ request แบบนี้
  ไม่มี cookie ให้ใช้ กฎสิทธิ์ของ collection ยังเป็นตัวตัดสิน ส่วน request ที่มี cookie ยังต้องเป็น origin ใน `trustedOrigins`
  frontend คนละ origin จึงส่งฟอร์มได้โดยไม่ต้องให้สิทธิ์ส่ง cookie
- endpoint ของ plugin ได้ `ip` จาก adapter สำหรับ rate limit

**`@easy-cms/plugin-form-builder`**
- collection `forms`: ช่องกรอกเป็น field `blocks` (text, textarea, email, number, phone, select, checkbox, date, message)
  เพราะ blocks รองรับการเรียง การแปล และ validation อยู่แล้ว มี drafts และรับข้อมูลเฉพาะฟอร์มที่เผยแพร่
  `emails` อ่านได้เฉพาะผู้ที่ login (field access) ที่อยู่อีเมลจึงไม่หลุดออก API
- `form-submissions`: `data` เป็น JSON เพื่อให้แก้ฟอร์มได้โดยไม่ต้องสร้าง migration สร้างได้ทางเดียวคือ endpoint ของฟอร์ม
  (REST create ปิด) ไม่เก็บ IP
- endpoint ขึ้นต้นด้วย slug ของ collection ไม่ได้ จึงใช้ `/form/:slug`, `/form/:slug/submit`,
  `/form/:slug/submissions.csv` และ `/form/element.js`
- ลำดับการตรวจ: honeypot → ข้อมูลที่กรอก → token เวลา → Turnstile → rate limit ตรวจข้อมูลก่อนเวลาขั้นต่ำ
  เพราะคนที่กดส่งฟอร์มว่างเร็วๆ ต้องได้รับ error ไม่ใช่ "สำเร็จ" ปลอม (พบจาก e2e) บอทที่ติดกับดักได้ "สำเร็จ" แต่ข้อมูลไม่ถูกบันทึก
- token เวลาเป็น HMAC ของ slug และเวลาที่โหลด (อายุ 2 วินาทีถึง 24 ชั่วโมง) ไม่ต้องเก็บ state
- rate limit นับจากข้อมูลที่บันทึกแล้วด้วย `rateKey` = HMAC ของ IP, ฟอร์ม และช่วงเวลา (ใช้ได้บน serverless)
  field ถูกซ่อนด้วย field access แทน `hidden` เพราะ `hidden` รับค่าจาก Local API ไม่ได้
- อีเมลที่ส่งไปที่อยู่ของผู้ส่งฟอร์ม (`{{email}}`) แทนค่าได้เฉพาะช่องสั้นและตัดที่ 100 ตัวอักษร ไม่มี `{{*}}`
  เพื่อไม่ให้ฟอร์มกลายเป็นช่องทางส่งสแปม
- CSV มี byte-order mark และ escape ค่าที่ขึ้นต้นด้วย `= + - @` กัน CSV injection
- `<easy-form>` เป็น Web Component ใน light DOM (CSS ของเว็บใช้ได้) ส่งโดยไม่มี cookie (`credentials: 'omit'`)
  ผู้แก้ที่ login อยู่จึงส่งแบบผู้เข้าชมทั่วไปและไม่ติด CSRF CMS เสิร์ฟ element ที่ `/form/element.js` ให้เว็บ static
- แถบข้างของฟอร์ม (admin component) แสดงจำนวน ลิงก์ และ CSV แทนแท็บ เพราะ plugin ยังเพิ่มหน้าหรือแท็บไม่ได้
  หน้า list ของ admin จึงรับ `?f_<field>=<id>` สำหรับ relationship ด้วย

## ผลที่ตามมา

- ✅ ฟอร์มติดต่อ สมัครกิจกรรม และแบบสอบถาม พร้อมอีเมลและตัวกันสแปม โดยไม่ต้องเขียนโค้ดฝั่ง server
- ✅ อีเมลใช้ได้กับ hook และ plugin อื่น
- ❌ ยังไม่มีการแนบไฟล์ เงื่อนไขซ่อนหรือแสดง field และ payment
- ❌ rate limit นับเฉพาะข้อมูลที่บันทึกแล้ว บอทที่ติดกับดักจึงไม่ถูกนับ (แต่ก็ไม่ได้บันทึกอะไร)
- ❌ แพ็กเกจใหม่สองตัวต้อง publish ครั้งแรกจากเครื่องของเจ้าของ
