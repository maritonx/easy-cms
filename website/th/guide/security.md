# ความปลอดภัย {#security}

สิ่งที่ Easy CMS ทำให้:

- **รหัสผ่าน** ถูก hash ด้วย scrypt (N=2¹⁷) session token สุ่มขึ้น ลงลายเซ็น และจัดเก็บ
  เป็นค่า hash เท่านั้น
- **Cookie** เป็น HttpOnly, SameSite=Lax และ Secure ใน production
- **CSRF**: การเขียนที่ยืนยันตัวตนด้วย cookie ต้องมี CSRF token ของ session และ Origin ที่เชื่อถือได้
- **จำกัดอัตราการเข้าสู่ระบบ** แยกตามอีเมล (และ IP เมื่อทราบ)
- **ปิดการเข้าถึงเป็นค่าเริ่มต้น**: หากไม่มีกฎ เฉพาะผู้ใช้ที่เข้าสู่ระบบแล้วเท่านั้นที่อ่านหรือเขียนได้
- **ไฟล์ที่อัปโหลด** ถูกตรวจสอบจากเนื้อหา จำกัดขนาด เปลี่ยนชื่อ และส่งพร้อม CSP แบบ sandbox
- **การแสดงผล rich text** escape เนื้อหาและตัด URL ที่ไม่ปลอดภัยทิ้ง
- **หน้า admin** ส่ง Content Security Policy แบบเข้มงวดและ `X-Frame-Options: DENY`
- **ข้อผิดพลาด** ซ่อนรายละเอียดใน production

สิ่งที่คุณควรทำ:

- เก็บ `EASY_CMS_SECRET` เป็นความลับและให้ยาวพอ
- เขียนกฎการควบคุมสิทธิ์อย่างตั้งใจ โดยเฉพาะ `read`
- ให้ role `editor` แก่ผู้แก้ไขเนื้อหา ไม่ใช่ `admin`
- ตรวจทาน migration และอัปเดต dependency อยู่เสมอ

รายงานช่องโหว่แบบส่วนตัวตามที่อธิบายไว้ใน
[SECURITY.md](https://github.com/maritonx/easy-crm/blob/main/SECURITY.md)
