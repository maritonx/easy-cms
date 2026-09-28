# ADR-0018: Endpoint ของ plugin, admin components และ plugin SEO

- **สถานะ:** Accepted
- **วันที่:** 2026-09-28

## บริบท

เริ่มทำ ecosystem ของ plugin (SEO ก่อน แล้วตามด้วย MCP ใน 0.14) ระบบ plugin เดิมเป็นแค่ `(config) => config`
ซึ่งเพิ่ม field และ hook ได้ แต่เพิ่ม route ไม่ได้ และหน้า admin build มาสำเร็จแล้ว (ADR-0002) plugin จึงใส่ UI เองไม่ได้
plugin SEO ต้องการทั้งสองอย่าง: endpoint สำหรับปุ่ม Generate และ UI (ตัวนับความยาว ตัวอย่างผลการค้นหา)

## การตัดสินใจ

**Plugin ยังเป็น `(config) => config`**
- ไม่เปลี่ยนเป็น object (`{ name, config(), onInit }`) ของเดิมไม่พัง ความสามารถใหม่อยู่ใน config ซึ่งผู้ใช้ใช้เองได้ด้วย
- `applyPlugins(config)` รัน plugin โดยไม่ตรวจ config ให้เครื่องมือตอน build (Nuxt module) อ่านสิ่งที่ plugin เพิ่มได้

**Endpoint (`endpoints: [{ path, method, handler }]`)**
- อยู่ใต้ `routes.api` ผ่าน REST handler เดิม จึงได้ auth (cookie/Bearer), CSRF, CORS และรูปแบบ error เดียวกัน
- handler ได้ `{ request, url, params, user, cms, json() }` คืนค่าเป็น JSON หรือ `Response`
- segment แรกห้ามชนกับ API ในตัว (`users`, `globals`, `admin`, `jobs`, `media`, slug ของ collection) ตรวจตอนเริ่มระบบ
- segment ที่ตายตัวชนะ parameter, path ถูกแต่ method ผิดได้ 405 พร้อม `Allow`

**Admin components เป็น Web Components**
- เลือก custom element แทนการแชร์ Vue ผ่าน import map หรือการ build หน้า admin ใหม่ สัญญาระหว่างหน้า admin กับ plugin
  เล็กและคงที่ (property เข้า, event ออก) เปลี่ยนเวอร์ชัน Vue หรือโค้ดภายในของหน้า admin ได้โดย plugin ไม่พัง
  plugin เขียนด้วย framework อะไรก็ได้ แลกกับการที่ plugin ใช้ component ของหน้า admin ไม่ได้ (แต่ใช้ CSS variable ได้)
- ตำแหน่ง: แทนช่องกรอก (`admin.component`), ต่อท้าย field (`admin.after`), กล่องในแถบข้าง (`admin.sidebar` ของ collection/global)
  หน้าเต็มและ widget บน dashboard ยังไม่ทำ
- ชื่อ tag ต้องขึ้นต้นด้วย `ecms-` ส่วน `props` ส่งเป็น JSON (function หายไป) และไปถึง element เป็น `options`
- สัญญาเวอร์ชัน 1: property `apiVersion, value, path, field, label, doc, collection, global, id, locale, uiLocale,
  readOnly, options, api` และ event `change` (ค่าใหม่), `set-field` (`{ path, value }`) รับเฉพาะ `CustomEvent`
  ที่มาจาก element เอง เพื่อไม่สับสนกับ event `change` ของ input ข้างใน
- หน้า admin รอ `customElements.whenDefined` ก่อนสร้าง element (ถ้าตั้ง property ก่อน upgrade จะบัง accessor ของ class)
  ถ้า module โหลดไม่ได้หรือไม่มี tag นั้น จะแสดงข้อความแทนที่ว่าง
- `doc` และ `value` ส่งเป็นสำเนา plugin แก้ state ของหน้า admin ตรงๆ ไม่ได้ ต้องผ่าน event

**การโหลด module (`admin.modules`)**
- ระบุเป็น export ของแพ็กเกจหรือ path จาก root ของโปรเจกต์ ห้ามใช้ URL (ตรวจตอนเริ่มระบบ) server หาไฟล์ด้วย
  `createRequire(<cwd>/package.json)` แล้วลองจาก entry ของ server (`process.argv[1]`) ต่อ
  เลือกแบบนี้แทนการให้ plugin ส่ง path จาก `import.meta.url` เพราะ Next.js รวมโค้ด server เป็นไฟล์เดียวทำให้ path เพี้ยน
- ส่งผ่าน REST API ที่ `<api>/admin/modules/<n>.js` เฉพาะผู้ใช้ที่ login แล้ว (ทั้งสาม adapter มี REST handler อยู่แล้ว
  จึงไม่ต้องแก้ส่วนส่งไฟล์ของหน้า admin ในแต่ละ adapter) อ่านไฟล์ทุก request พร้อม ETag ให้แก้ไฟล์ตอน dev แล้วเห็นทันที
  CSP ของหน้า admin (`script-src 'self'`) ไม่ต้องเปลี่ยนเพราะเป็น origin เดียวกัน
- module ต้องเป็นไฟล์ ES module ไฟล์เดียว (ไม่ import ต่อ) หน้า admin import ทุก module หลัง login
- Nuxt module รัน `applyPlugins` ตอน build แล้วเพิ่มไฟล์ module ใน `traceInclude` ส่วน Next.js `output: 'standalone'`
  ผู้ใช้ต้องเพิ่มเองใน `outputFileTracingIncludes`

**`@easy-cms/plugin-seo`**
- เพิ่ม group `meta` (title, description, image) ท้าย field หรือแถบข้าง, `localized` ตาม `localization`
  ไม่มีตัวเลือก `uploadsCollection` เพราะ field `upload` ชี้ไปที่ `media` เสมอ
- ปุ่ม Generate เรียก `POST <api>/seo/generate` ส่งค่าในฟอร์มที่ยังไม่บันทึก (ต้อง login) generator ได้
  `{ doc, id, locale, collection | global, cms, user }` และ `autoGenerate` เติมช่องว่างตอนบันทึกผ่าน `beforeChange`
  (update ที่ไม่ส่ง `meta` มาจะไม่ถูกแตะ)
- นับความยาวเป็น grapheme (`Intl.Segmenter`) สระและวรรณยุกต์ไทยนับรวมกับตัวอักษรที่มันอยู่
- `seoMeta(doc)` คืน `nuxt` (สำหรับ `useSeoMeta`) และ `next` (สำหรับ `generateMetadata`) ตัวแพ็กเกจไม่ import core ตอนรัน
  หน้าเว็บที่ใช้แค่ `seoMeta` จึงไม่ดึงโค้ด server เข้า bundle (endpoint ตอบ error เป็น `Response` แทน error class ของ core)
- admin module เป็น TypeScript ธรรมดา ไม่มี framework (ประมาณ 9 KB) ใช้ shadow DOM กับ CSS variable ของหน้า admin

## ผลที่ตามมา

- plugin จากคนนอกเพิ่ม route และ UI ได้โดยไม่ต้อง fork หน้า admin
- สัญญาของ admin components กลายเป็น API สาธารณะ: เปลี่ยนแบบไม่เข้ากันได้ต้องเพิ่ม `apiVersion`
- โค้ดของ admin module ทำงานด้วยสิทธิ์ของผู้ที่ login จึงต้องเชื่อถือ plugin ที่ติดตั้ง (เหมือน dependency ทั่วไป)
- sitemap/robots, หน้าเต็มจาก plugin และ widget บน dashboard ยกไปรอบหลัง
