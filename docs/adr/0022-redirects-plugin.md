# ADR-0022: Plugin redirects และกลุ่มตั้งค่าในเมนู

- **สถานะ:** Accepted
- **วันที่:** 2026-09-28

## บริบท

เมื่อ slug ของหน้าเปลี่ยน ลิงก์เก่าจะกลายเป็น 404 และหน้าเสียอันดับในการค้นหา ([ADR-0020](0020-seo-sitemap-robots-root-endpoints.md)
ยกเรื่องนี้ไว้) ผู้แก้เนื้อหายังต้องการสร้าง redirect เองด้วย เช่น ตอนย้ายเว็บหรือทำลิงก์สั้น

## การตัดสินใจ

**แพ็กเกจแยก `@easy-cms/plugin-redirects`** ไม่รวมใน plugin SEO เพราะใช้กับงานอื่นได้ และคนที่ไม่ใช้ SEO ไม่ต้องติดตั้งทั้งก้อน

**ข้อมูล**
- collection `redirects`: `from` (path ที่ normalize แล้ว คือเอาเฉพาะ pathname ไม่มี `/` ท้าย, unique), `to` (path หรือ URL),
  field relationship `to_<collection>` หนึ่งช่องต่อ collection ใน `collections`, `locale` (เมื่อมี localization) และ `type`
  (301/302/307/308 ค่าเริ่มต้น 301)
- relationship ของ core ชี้ได้ collection เดียว จึงใช้หนึ่ง field ต่อ collection แทน relationship แบบหลายชนิด และตรวจว่ามี
  ปลายทางอย่างเดียวพอดี (`to` หรือเอกสาร)
- redirect ที่ชี้ไปเอกสารคำนวณที่อยู่ตอนอ่านด้วย `url` ของ plugin เอง (ไม่พึ่ง plugin SEO) จึงตามเอกสารไปเมื่อย้ายอีก
  เอกสารที่ไม่ได้เผยแพร่ทำให้ redirect นั้นไม่ทำงาน

**redirect อัตโนมัติ** (ค่าเริ่มต้นเปิด สำหรับ `collections`)
- อ่านที่อยู่ของหน้าที่เผยแพร่อยู่ทุกภาษาใน `beforeChange` แล้วเทียบกับหลังบันทึก สร้าง redirect เฉพาะเมื่อหน้ายังออนไลน์และที่อยู่เปลี่ยน
  การบันทึกฉบับร่าง (versions เก็บหน้าที่ออนไลน์ไว้เหมือนเดิม) จึงไม่สร้าง redirect
- redirect ชี้ไปที่เอกสาร ไม่ใช่ URL จึงไม่ต่อกันเป็นทอด และลบ redirect ที่ `from` เท่ากับที่อยู่ใหม่ เพื่อไม่ให้วนกลับ
- ภาษาที่ใช้ที่อยู่เดียวกันได้ redirect เดียว

**การเสิร์ฟ**
- `resolveRedirect(cms, url)` อ่าน redirect ทั้งหมดครั้งเดียวแล้วเก็บเป็น Map ในหน่วยความจำ ผูกกับ instance ด้วย
  `Symbol.for(…)` (ไม่ใช่ตัวแปรระดับ module เพราะ Next.js bundle plugin แยกตาม layer) ล้างทันทีเมื่อ redirect หรือเอกสารปลายทางเปลี่ยน
  และหมดอายุตาม `cacheTTL` (60 วินาที) สำหรับ instance อื่น
- query string ของผู้เข้าชมถูกส่งต่อ ถ้าปลายทางไม่มี query ของตัวเอง
- Nuxt ใช้ server middleware, Next.js 16 ใช้ `proxy.ts` (ทำงานบน Node.js) ส่วน frontend อื่นเรียก `GET <api>/resolve-redirect?path=`
  (endpoint ขึ้นต้นด้วย slug ของ collection ไม่ได้ จึงไม่ใช้ `/redirects/resolve`)
- ยังไม่ export เป็นไฟล์ของ host (`_redirects`, `vercel.json`) และยังไม่รองรับ pattern หรือ wildcard

**กลุ่มตั้งค่าในเมนู (core)**
- `admin.group: 'settings'` บน collection ให้แสดงใต้ตั้งค่าคู่กับ Users และ API keys แทนการเขียนชื่อ collection ตายตัวในหน้า admin
  admin schema ส่ง `group` ไปให้ (users และ api-keys ได้ค่านี้เอง)

## ผลที่ตามมา

- ✅ ลิงก์เก่าไม่เสียเมื่อเปลี่ยน slug และผู้แก้เนื้อหาจัดการ redirect เองได้
- ✅ plugin อื่นวาง collection ไว้ใต้ตั้งค่าได้
- ❌ redirect ทั้งหมดอยู่ในหน่วยความจำของแต่ละ server (เหมาะกับหลักพันถึงหลักหมื่นรายการ)
- ❌ การแก้ไขเอกสารใน `collections` อ่านที่อยู่เพิ่มก่อนและหลังบันทึก (ทุกภาษา)
- ❌ แพ็กเกจใหม่ต้อง publish ครั้งแรกจากเครื่องของเจ้าของ แล้วตั้ง npm trusted publishing
