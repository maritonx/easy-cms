# Easy CMS คืออะไร {#what-is-easy-cms}

::: info หน้านี้สอนอะไร
Easy CMS คืออะไร แต่ละส่วนทำงานร่วมกันอย่างไร คำศัพท์ที่คู่มือนี้ใช้ และเมื่อไหร่ที่เหมาะ (หรือไม่เหมาะ) กับงานของคุณ
:::

Easy CMS คือ headless CMS ที่ติดตั้งเข้าไปในแอป Nuxt หรือ Next.js ด้วย npm และทำงานอยู่ใน server
ของแอปคุณเอง จึงไม่ต้องมีบริการ CMS แยกให้ดูแล จ่ายเงิน หรือคอย sync ข้อมูล:

- **กำหนดเนื้อหาด้วยโค้ด** collection, field, กฎสิทธิ์ และ hook อยู่ใน `easy-cms.config.ts`
  ซึ่ง review และเก็บเวอร์ชันได้เหมือนโค้ดส่วนอื่น
- **ผู้แก้เนื้อหาได้หน้า admin** ที่ `/admin`: รายการ ฟอร์มที่สร้างให้อัตโนมัติ rich text คลังสื่อ
  ฉบับร่าง ประวัติ และตัวอย่างสด เป็นภาษาไทยและอังกฤษ
- **หน้าเว็บอ่านเนื้อหา** ผ่าน [Local API](./local-api) ที่มี type บน server (`useEasyCMS()` ใน Nuxt,
  `getEasyCMS(config)` ใน Next.js) และ client ใดก็ใช้ [REST API](./rest-api) ที่ `/api/cms` ได้
- **ข้อมูลอยู่ในฐานข้อมูลของคุณ**: SQLite (ไฟล์ หรือ Turso) หรือ Postgres (server หรือ PGlite
  สำหรับพัฒนาในเครื่อง) Easy CMS ยุ่งเฉพาะตารางที่ขึ้นต้นด้วย prefix ของมัน (`ecms_`)

<Screenshot name="edit" alt="การแก้ไขบทความในหน้า admin ของ Easy CMS" />

## ส่วนต่างๆ ทำงานร่วมกันอย่างไร {#how-it-fits-together}

```
┌────────────────── แอป Nuxt / Next.js ของคุณ ──────────────────┐
│  หน้าเว็บ ──► Local API (มี type)    browser ──► /api/cms      │
│  ผู้แก้เนื้อหา ──► /admin                                       │
│                  @easy-cms/nuxt | @easy-cms/next              │
│                        @easy-cms/core                         │
│          SQLite / Postgres (ตาราง ecms_) · ไฟล์อัปโหลด           │
└───────────────────────────────────────────────────────────────┘
```

- `@easy-cms/core` รวมทุกอย่างที่สำคัญไว้: config, การตรวจสอบข้อมูล, สิทธิ์, hook, ฉบับร่าง,
  Local API และ REST API เป็น TypeScript ธรรมดาบน `Request`/`Response` แบบ Web standard ไม่มี framework อยู่ข้างใน
- **adapter** ติดตั้ง core เข้ากับ framework: [Nuxt module](./nuxt), [route handler ของ Next.js](./next)
  หรือ [standalone server](./standalone) สำหรับ frontend อื่นๆ
- **adapter ฐานข้อมูล** (`@easy-cms/db-sqlite` หรือ `@easy-cms/db-postgres`) เก็บเอกสารเป็นตารางและคอลัมน์จริง
  คุณจึงยัง query ด้วย SQL ได้
- **หน้า admin** (`@easy-cms/admin`) เป็นแอป Vue ที่ build มาแล้ว คุณไม่ต้อง build เอง มันอ่าน config
  จาก API แล้ววาดฟอร์มให้

## คำศัพท์ในคู่มือนี้ {#words-used-in-this-guide}

| คำ | ความหมาย |
|---|---|
| **Collection** | ประเภทเนื้อหาที่มีหลายเอกสาร เช่น บทความ สินค้า หน้าเว็บ |
| **Global** | เอกสารเดียว เช่น การตั้งค่าเว็บไซต์ เมนู footer |
| **Field** | ค่าหนึ่งค่าของเอกสาร เช่น ชื่อเรื่อง วันที่ รูป ดู [Fields](./fields) |
| **เอกสาร (document)** | รายการหนึ่งใน collection มี `id`, `createdAt` และ `updatedAt` |
| **ฉบับร่าง (draft)** | เวอร์ชันที่ยังไม่เผยแพร่ ผู้แก้ทำต่อได้ ดู [ฉบับร่าง](./drafts) |
| **Local API** | ฟังก์ชันอย่าง `cms.find()` ที่เรียกในโค้ดฝั่ง server ไม่ผ่าน HTTP |
| **REST API** | การทำงานชุดเดียวกันผ่าน HTTP ที่ `/api/cms` สำหรับ browser และแอปอื่น |
| **กฎสิทธิ์ (access rule)** | ฟังก์ชันที่ตัดสินว่าใครอ่านหรือแก้อะไรได้ ดู [การควบคุมสิทธิ์](./access-control) |
| **Hook** | โค้ดของคุณที่ทำงานเมื่อเอกสารเปลี่ยน ดู [Hooks](./hooks) |
| **Plugin** | ฟังก์ชันที่เพิ่ม field, endpoint หรือ UI ในหน้า admin ดู [Plugins](./plugins) |

## เมื่อไหร่ที่เหมาะ {#when-it-fits}

- คุณทำเว็บด้วย Nuxt หรือ Next.js และอยากได้ระบบแก้เนื้อหาโดยไม่ต้องมีบริการเพิ่ม
- คุณทำเว็บด้วย Vite, React, Vue หรือ static site generator และอยากได้ backend CMS ขนาดเล็กที่ดูแลเอง:
  รันเป็น [standalone server](./standalone)
- คุณชอบให้ schema อยู่ใน TypeScript และใน git ผ่าน review ใน pull request
- คุณ deploy แอป server หนึ่งตัวคู่กับฐานข้อมูล (VPS, container, แพลตฟอร์มอย่าง Railway หรือ Render
  หรือ serverless คู่กับ Postgres)
- ผู้แก้เนื้อหาทำงานเป็นภาษาไทย อังกฤษ หรือทั้งสองภาษา

## เมื่อไหร่ที่ไม่เหมาะ {#when-it-doesnt}

- ผู้แก้เนื้อหาต้องเปลี่ยนโครงสร้างเนื้อหาเองโดยไม่มีนักพัฒนา เพราะที่นี่โครงสร้างคือโค้ด
- คุณต้องใช้ GraphQL หรือ edge runtime (Easy CMS ต้องใช้ Node.js 22.12 ขึ้นไป)
- คุณต้องการ integration สำเร็จรูปจำนวนมากตั้งแต่วันนี้

## ขั้นต่อไป {#next-steps}

- [เริ่มใช้งาน](./getting-started): เพิ่ม Easy CMS ให้โปรเจกต์ในไม่กี่นาที
- [การตั้งค่า](./configuration): ตัวเลือกทั้งหมดของ `easy-cms.config.ts`
