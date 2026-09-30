# ADR-0024: หน้าย่อย (plugin nested docs) และความสามารถของ core ที่รองรับ

- **สถานะ:** Accepted
- **วันที่:** 2026-09-30

## บริบท

เว็บส่วนใหญ่มีหน้าซ้อนกัน เช่น เกี่ยวกับเรา → ทีมงาน หรือเอกสารที่มีบทและหัวข้อ ต้องการแบบ nested docs ของ Payload
คือแต่ละเอกสารมีหน้าแม่ใน collection เดียวกัน พร้อม breadcrumbs และที่อยู่เต็ม แต่ core ยังขาดหลายอย่าง:
- slug ห้ามซ้ำทั้ง collection `/about/team` กับ `/careers/team` จึงอยู่พร้อมกันไม่ได้
- ช่องเลือก relationship กรองตัวเลือกไม่ได้ (ต้องไม่ให้เลือกตัวเองหรือหน้าลูกหลานเป็นหน้าแม่)
- หน้ารายการของ admin เป็นตารางแบนอย่างเดียว
- การแก้เอกสารที่มี draft ค้าง (separate drafts) เข้าไปที่ draft เสมอ plugin จึงแก้ค่าของเวอร์ชันที่เผยแพร่อยู่ไม่ได้
- ไม่มีทางให้ plugin เพิ่มคำสั่ง CLI

## การตัดสินใจ

**ชื่อ:** `@easy-cms/plugin-nested-docs` คู่กับ `nestedDocsPlugin()` ตามแบบแผนการตั้งชื่อ plugin ทางการตามชื่อ Payload
ส่วนในเอกสารและ admin ใช้คำว่า "หน้าย่อย / Nested pages", "หน้าแม่ / Parent page"

**ความสามารถใหม่ของ core (ใช้ได้ทั่วไป ไม่ผูกกับ plugin)**
- `SlugField.uniqueWithin`: slug ห้ามซ้ำเฉพาะเอกสารที่มีค่าของ field นั้นเหมือนกัน (field เดี่ยว ไม่ localized)
  index ใน DB ของ slug แบบนี้จึงไม่ unique
- `RelationshipField.filterOptions({ id, user, cms }) => Where | true` ทำงานฝั่ง server เพราะฟังก์ชันใน config
  ส่งไป admin ไม่ได้ ช่องเลือกของ admin ส่ง `?filterFor=<collection>.<path>&filterId=<id>` (หรือ `filterForGlobal`)
  REST นำผลไป AND กับ `where` เดิม (แคบลงอย่างเดียว ไม่ขยายสิทธิ์) และตรวจซ้ำตอนบันทึก
- `admin.list: { tree, sort }`: หน้ารายการเป็นต้นไม้ตาม relationship ไปหา collection เดียวกัน โหลดระดับบนก่อน
  (`exists: false`) แล้วโหลดลูกทีละระดับเมื่อกดขยาย (ระดับละหนึ่ง request ล่วงหน้าหนึ่งระดับเพื่อรู้ว่าแถวไหนขยายได้)
  เมื่อค้นหาหรือกรองจะกลับเป็นรายการแบน
- `update(…, { live: true })`: ดูแลค่าของเวอร์ชันที่เผยแพร่อยู่ draft ที่ค้างยังค้างอยู่ status คงเดิม และไม่เพิ่ม version
  เพราะเป็นงานดูแลข้อมูลไม่ใช่การแก้ของ editor (ถ้าเพิ่ม version จะบัง draft ที่ค้างอยู่ด้วย)
- `commands` ใน config: plugin เพิ่มคำสั่ง `easy-cms <name>` ได้ คำสั่งในตัวมาก่อนเสมอ

**ข้อมูลของ plugin**
- เพิ่ม `parent` (relationship ไปหาตัวเอง ใช้ field เดิมถ้า collection มีอยู่แล้ว), `path` (text มี index) และ
  `breadcrumbs` (array ของ `{ doc, label, url }` รวมหน้าตัวเองเป็นขั้นสุดท้าย) ทั้ง `path` และ `breadcrumbs`
  แยกตามภาษาเมื่อ slug เป็น localized ส่วน `parent` ใช้ร่วมกันทุกภาษา
- เก็บค่าที่คำนวณแล้วแทนการคำนวณตอนอ่าน เพราะหน้าเว็บต้องหาหน้าจาก URL เต็มแทบทุก request
  (`where[path][equals]` ใช้ได้เลยทั้ง Local API และ REST)
- path คำนวณจาก path ที่เก็บไว้ของหน้าแม่ (เวอร์ชันที่เผยแพร่อยู่) บวก slug ของตัวเอง ใน `beforeChange`
  หลัง core ทำ slug ให้ไม่ซ้ำแล้ว ส่วน `beforeValidate` ล้าง breadcrumbs เดิมก่อน เพื่อไม่ให้ขั้นที่ชี้ไปยังหน้าที่ถูกลบ
  ทำให้การบันทึกล้ม หน้าใหม่บันทึกซ้ำหนึ่งครั้งเพื่อใส่ id ของตัวเองในขั้นสุดท้าย (แบบเดียวกับ Payload)

**การไล่อัปเดต**
- `afterChange` เทียบค่าที่หน้าลูกควรได้กับที่เก็บไว้ และบันทึกเฉพาะหน้าที่ต่าง (`live: true`) hook ของหน้าลูกจะไล่ต่อระดับถัดไปเอง
  hook ของ plugin redirects จึงทำงานกับทุกหน้าที่ย้าย ได้ redirect อัตโนมัติโดยไม่ต้องเชื่อมกันเป็นพิเศษ
- draft ของหน้าแม่ไม่ทำให้หน้าลูกเปลี่ยน เพราะค่าที่ควรได้คำนวณจากเวอร์ชันที่เผยแพร่อยู่ ที่อยู่ที่คนเข้าชมอยู่จึงเปลี่ยนเมื่อเผยแพร่เท่านั้น
- ไล่ทันทีใน hook (ไม่ใช้ job queue) เพราะเว็บส่วนใหญ่มีหน้าย่อยหลักสิบถึงร้อย และผลลัพธ์คาดเดาได้
  core ไม่ย้อนการบันทึกเมื่อ after-hook ล้ม จึงมี `rebuildNestedDocs()` และ `easy-cms nested:rebuild` ไว้ซ่อมและใช้กับข้อมูลเดิม

**กติกา**
- วนลูป: `filterOptions` ตัดหน้าตัวเองและลูกหลาน (หาแบบทีละระดับจาก `parent` ไม่พึ่ง breadcrumbs) และ `beforeChange` ตรวจซ้ำ
- `maxDepth` ค่าเริ่มต้น 10 และ path ห้ามซ้ำ (ตรวจแยกตามภาษา)
- ลบหน้าที่มีหน้าลูก: ค่าเริ่มต้น `restrict` เพราะ core ไม่มี cascade หรือ set null ถ้าปล่อยไว้ หน้าลูกจะเก็บ id ที่ไม่มีอยู่
  และบันทึกครั้งต่อไปไม่ได้ `orphan` ย้ายหน้าลูกขึ้นระดับบน

**ส่วนอื่น**
- `findByPath()`, `getTree()` และ endpoint `GET <api>/tree/:collection` (สิทธิ์อ่านของ collection เฉพาะหน้าที่เผยแพร่
  หน้าที่อยู่ใต้หน้าที่ไม่ได้เผยแพร่ไม่แสดง) helper รับ `NestedCMS` แบบ structural เพื่อให้ instance ที่มี type จาก config ส่งเข้าได้
- plugin SEO: `seoMeta({ breadcrumbs })` สร้าง BreadcrumbList JSON-LD (ใช้ได้ทั่วไป ไม่ผูกกับ plugin นี้)
- admin component `ecms-nested-breadcrumbs` แสดงตำแหน่งของหน้าและจำนวนหน้าย่อยพร้อมลิงก์ `?f_parent=<id>`

## ผลที่ตามมา

- ✅ หน้าแบบลำดับชั้น ที่อยู่เต็ม breadcrumbs เมนู และ redirect เมื่อย้ายหน้า ครบทั้ง Nuxt, Next และ standalone
- ✅ `filterOptions`, `uniqueWithin`, tree list, `live` และ `commands` ใช้ได้กับ collection และ plugin อื่น
- ❌ ยังเรียงลำดับหน้าพี่น้องด้วยการลากวางไม่ได้ (ใช้ field ตัวเลขกับ `admin.list.sort` แทน)
- ❌ type ที่อนุมานจาก config ไม่รู้จัก field ที่ plugin เพิ่ม (`parent`, `path`, `breadcrumbs`)
- ❌ การไล่อัปเดตไม่อยู่ใน transaction เดียวกับการบันทึกหน้าแม่ ถ้าล้มกลางทางต้องรัน `nested:rebuild`
