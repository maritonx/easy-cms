# Easy CMS คืออะไร? {#what-is-easy-cms}

Easy CMS คือ headless CMS ที่ติดตั้งลงในแอป Nuxt หรือ Next.js ของคุณด้วย npm โดยทำงานอยู่ภายใน
server ของแอป จึงไม่ต้องโฮสต์บริการ CMS แยกต่างหาก:

- **กำหนดเนื้อหาด้วยโค้ด** collection, field, กฎการเข้าถึง และ hook อยู่ใน
  `easy-cms.config.ts` ซึ่งรีวิวและจัดการเวอร์ชันได้เหมือนโค้ดทั่วไป
- **ผู้แก้ไขเนื้อหาได้หน้า admin** ที่ `/admin`: รายการ, ฟอร์มที่สร้างให้อัตโนมัติ, rich text, คลัง media,
  ฉบับร่าง (draft), ภาษาไทยและภาษาอังกฤษ
- **หน้าเว็บของคุณอ่านเนื้อหา** ผ่าน [Local API](./local-api) ที่มี type บน server
  (`useEasyCMS()` ใน Nuxt, `getEasyCMS(config)` ใน Next.js) และ client ใดก็ได้สามารถใช้
  [REST API](./rest-api) ที่ `/api/cms`
- **ข้อมูลอยู่ในฐานข้อมูลของคุณ**: SQLite (ไฟล์ หรือ Turso) หรือ Postgres (server หรือ PGlite
  สำหรับช่วงพัฒนา (development) บนเครื่อง) Easy CMS แตะเฉพาะตารางที่มี prefix ของตัวเอง (`ecms_`)

```
┌────────────────── your Nuxt / Next.js app ──────────────────┐
│  pages ──► Local API (typed)      browsers ──► /api/cms      │
│  editors ──► /admin                                          │
│                  @easy-cms/nuxt | @easy-cms/next             │
│                        @easy-cms/core                        │
│          SQLite / Postgres (ecms_ tables) · uploads          │
└──────────────────────────────────────────────────────────────┘
```

## เหมาะกับกรณีใด {#when-it-fits}

- คุณสร้างเว็บด้วย Nuxt หรือ Next.js และต้องการระบบแก้ไขเนื้อหาโดยไม่ต้องมีบริการเพิ่ม
- คุณสร้างเว็บด้วย Vite, React, Vue หรือ static site generator และต้องการ CMS backend ขนาดเล็กที่
  โฮสต์เองได้: รันเป็น [standalone server](./standalone)
- คุณชอบเก็บ schema ไว้ใน TypeScript และใน git
- คุณ deploy ด้วย app server ตัวเดียวพร้อมฐานข้อมูล

## ข้อจำกัดปัจจุบัน {#current-limits}

- ยังไม่มี GraphQL และการแปลเนื้อหาหลายภาษา (localization)
- Node.js ≥ 22.12; ไม่รองรับ edge runtime
