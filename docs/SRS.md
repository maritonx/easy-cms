# Software Requirements Specification — Easy CMS

- **เวอร์ชันเอกสาร:** 3.16
- **วันที่:** 2026-10-08
- **ผู้เขียน:** Kanawoot K.
- **ครอบคลุม:** v0.1 (baseline) ถึง v0.41
- **สถานะ:** Living document (อัปเดตทุกครั้งที่เพิ่มฟีเจอร์)
- **เอกสารที่เกี่ยวข้อง:** [DESIGN.md](DESIGN.md), [ADRs](adr/)

---

## 1. บทนำ

### 1.1 วัตถุประสงค์
เอกสารนี้กำหนดความต้องการของซอฟต์แวร์ Easy CMS ทั้งด้านฟังก์ชันและด้านที่ไม่ใช่ฟังก์ชัน ใช้เป็นเกณฑ์สำหรับการพัฒนา การทดสอบ และการตรวจรับ
ส่วน *วิธี* สร้างระบบอยู่ใน [DESIGN.md](DESIGN.md) และเหตุผลของการตัดสินใจแต่ละเรื่องอยู่ใน [ADRs](adr/)

หัวข้อ 3.1–3.14 คือความต้องการของ v0.1 (ปรับให้ตรงกับพฤติกรรมปัจจุบันแล้ว) ส่วนหัวข้อ 3.15 เป็นต้นไปคือฟีเจอร์ที่เพิ่มหลัง v0.1 แต่ละข้อระบุเวอร์ชันที่เริ่มมี

### 1.2 ขอบเขต
Easy CMS เป็น Headless CMS แบบ open source (MIT) ที่ติดตั้งผ่าน npm แล้วฝังเข้าไปในแอป Nuxt หรือ Next.js ของผู้ใช้ หรือรันเป็น server ของตัวเอง (standalone) ระบบประกอบด้วย:
- Core library สำหรับนิยาม content แบบ code-first และจัดการข้อมูล
- Local API, REST API และการสร้าง TypeScript types
- หน้า Admin สำหรับ editor
- Adapter สำหรับ Nuxt, Next.js และโหมด standalone
- Database adapter (SQLite, PostgreSQL) และ storage adapter (local disk, S3-compatible)
- CLI สำหรับติดตั้ง, migration, generate types, สำรองและย้ายข้อมูล
- Official plugins: `@easy-cms/plugin-seo`, `@easy-cms/plugin-mcp`, `@easy-cms/plugin-redirects` และ `@easy-cms/plugin-form-builder`
- Email adapter: `@easy-cms/email-smtp`

**นอกขอบเขต (ปัจจุบัน):** UI สร้าง content type, GraphQL, Edge runtime, MySQL, auth ภายนอก (OAuth/SSO), ลืมรหัสผ่านผ่าน email, MCP แบบ stdio, หน้าเต็มและ widget บน dashboard จาก plugin, BreadcrumbList, บริการ hosting

### 1.3 คำศัพท์

| คำ | ความหมาย |
|---|---|
| **Host app** | แอป Nuxt หรือ Next.js ของผู้ใช้ที่ติดตั้ง Easy CMS ไว้ |
| **Standalone** | Easy CMS ที่รันเป็น server ของตัวเอง (`easy-cms serve`) ให้ frontend ใดก็ได้เรียกผ่าน REST |
| **Collection** | ประเภท content ที่มีได้หลายรายการ เช่น `posts` |
| **Global** | Content แบบมีรายการเดียว เช่น `site` settings |
| **Document** | ข้อมูล 1 รายการใน collection หรือ global |
| **Field** | คุณสมบัติหนึ่งของ document เช่น `title` |
| **Block** | แถวหนึ่งใน field `blocks` ที่มีชนิด (`blockType`) และ field ของชนิดนั้น |
| **Local API** | ฟังก์ชันที่เรียกได้ตรงใน server ของ host app โดยไม่ผ่าน HTTP |
| **Adapter** | Package ที่เชื่อม Easy CMS กับ framework, database หรือ storage |
| **Access function** | ฟังก์ชันใน config ที่ตัดสินว่าผู้ใช้ทำ operation หนึ่งได้หรือไม่ |
| **Draft / Published** | สถานะของ document ก่อนและหลังการเผยแพร่ |
| **Version** | สำเนาของ document ที่ถูกบันทึกไว้ในประวัติ (เมื่อเปิด `versions`) |
| **Locale** | ภาษาของเนื้อหา (เมื่อเปิด `localization`) แยกจากภาษาของหน้า Admin |
| **Webhook** | HTTP POST ที่ระบบส่งไปยัง URL ภายนอกเมื่อเนื้อหาเปลี่ยน |
| **Plugin** | ฟังก์ชัน `(config) => config` ที่เพิ่ม field, hook, endpoint หรือ admin component |
| **Endpoint** | REST route ที่ developer หรือ plugin เพิ่มใต้ `routes.api` |
| **Admin component** | Web Component (tag ขึ้นต้นด้วย `ecms-`) ที่ plugin ใส่ลงในหน้า Admin |
| **API key** | Token ถาวรที่ทำงานในนามผู้ใช้หนึ่งคน โดยมีสิทธิ์เท่าที่ key กำหนด |
| **MCP** | Model Context Protocol ช่องทางที่ผู้ช่วย AI ใช้เรียก tool ของระบบ |

### 1.4 ระดับความสำคัญ
- **MUST**: ต้องมี
- **SHOULD**: ควรมี แต่เลื่อนได้ถ้ามีเหตุผล
- **MAY**: มีก็ดี ไม่บังคับ

ในหัวข้อ 3.1–3.14 ระดับความสำคัญอ้างอิงกับ v0.1 ส่วนหัวข้อ 3.15 เป็นต้นไปอ้างอิงกับเวอร์ชันที่ฟีเจอร์นั้นเริ่มมี (คอลัมน์ "ตั้งแต่")

---

## 2. ภาพรวมของระบบ

### 2.1 บริบทของผลิตภัณฑ์
Easy CMS ทำงานภายใน process ของ host app ใช้ database เดียวกันหรือแยกกันก็ได้ และเสิร์ฟหน้า Admin กับ REST API ผ่าน route ของ host app
ในโหมด standalone ระบบเสิร์ฟ Admin และ REST API เอง ส่วน frontend อยู่คนละ origin และเรียกผ่าน CORS

```
Editor ─────► /admin ─────────┐
Browser ────► /api/cms ───────┤
Host app ───► Local API ──────┼─► Adapter ─► Easy CMS Core ─► Database (SQLite / Postgres)
Script ─────► REST + API key ─┤                     │        └► Storage (Local / S3)
AI assistant ► /api/cms/mcp ──┘                     └──► Webhooks ─► บริการภายนอก
```

### 2.2 กลุ่มผู้ใช้

| กลุ่ม | คำอธิบาย | ทักษะ |
|---|---|---|
| **Developer** | ติดตั้ง, เขียน config, กำหนดสิทธิ์, ติดตั้ง plugin, deploy | TypeScript, Nuxt, Next.js หรือ frontend อื่น |
| **Admin** | Editor ที่มีสิทธิ์สูงสุด จัดการ user และ API key ของทุกคนได้ | ไม่จำเป็นต้องมีทักษะเทคนิค |
| **Editor** | สร้าง แก้ไข แปล ตั้งเวลา และเผยแพร่ content | ไม่จำเป็นต้องมีทักษะเทคนิค |
| **Script / แอปอื่น** | ระบบอัตโนมัติที่อ่านหรือเขียนเนื้อหาผ่าน REST ด้วย API key | — |
| **ผู้ช่วย AI** | Claude, Cursor, VS Code และอื่นๆ ที่เชื่อมผ่าน MCP ด้วย API key | — |
| **Public visitor** | ผู้เข้าชมเว็บที่อ่าน content ผ่าน host app หรือ frontend | — |

### 2.3 สภาพแวดล้อมการทำงาน
- Node.js ≥ 22.12 (22 Maintenance LTS, 24 Active LTS) บน Linux, macOS และ Windows
- Nuxt ≥ 3 หรือ Next.js ≥ 14 (App Router) ส่วนเวอร์ชันที่แน่นอนระบุใน `peerDependencies` หรือ frontend ใดก็ได้เมื่อใช้โหมด standalone
- SQLite (ไฟล์หรือ Turso ผ่าน libSQL) หรือ PostgreSQL ≥ 14 (หรือ PGlite สำหรับ dev/test)
- Storage: local disk หรือบริการที่เข้ากันได้กับ S3 (AWS S3, Cloudflare R2, MinIO)
- Browser สำหรับหน้า Admin: Chrome, Edge, Firefox, Safari (2 เวอร์ชันล่าสุด)

### 2.4 ข้อจำกัด
- **C-1** ผู้พัฒนามีคนเดียวและทำเป็นงานเสริม (~10–15 ชม./สัปดาห์)
- **C-2** License MIT, dependency ทุกตัวต้องมี license ที่เข้ากันได้กับ MIT
- **C-3** ไม่รองรับ Edge runtime
- **C-4** ต้องมี server-side runtime: SPA หรือเว็บ static ต้องใช้โหมด standalone เป็น backend
- **C-5** Package ทุกตัวใช้เวอร์ชันเดียวกัน (Changesets fixed group)

### 2.5 สมมติฐาน
- **A-1** Developer มีสิทธิ์รันคำสั่ง migration บน environment ที่ deploy
- **A-2** ถ้าใช้ local storage ต้อง deploy บน server ที่มี filesystem ถาวร ส่วน serverless ต้องใช้ S3 storage คู่กับ Postgres ภายนอก
- **A-3** Plugin ที่ติดตั้งเป็นโค้ดที่เชื่อถือได้ เหมือน dependency ทั่วไป (admin module ทำงานด้วยสิทธิ์ของผู้ที่ login)

---

## 3. Functional Requirements

### 3.1 การติดตั้งและ CLI (INS)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-INS-01 | `npx create-easy-cms` ต้องตรวจได้ว่าโปรเจกต์ปัจจุบันเป็น Nuxt หรือ Next.js ถ้าเป็นโฟลเดอร์ใหม่หรือว่างให้ตั้งเป็น standalone ส่วนโปรเจกต์อื่นต้องใส่ `--standalone` หรือยืนยันใน terminal | MUST |
| FR-INS-02 | `create-easy-cms` ต้องติดตั้ง package ที่จำเป็น, สร้าง `easy-cms.config.ts` ตัวอย่าง และลงทะเบียน route `/admin` กับ `/api/cms` | MUST |
| FR-INS-03 | `create-easy-cms` ต้องถามชนิด database (SQLite/Postgres) และเพิ่ม `EASY_CMS_SECRET` ที่สุ่มขึ้นมาลงใน `.env` ถ้ายังไม่มี | MUST |
| FR-INS-04 | `easy-cms create-admin` ต้องสร้าง user ที่มี role `admin` จาก email และ password ที่รับเข้ามา | MUST |
| FR-INS-05 | `easy-cms generate:types` ต้องสร้างไฟล์ `easy-cms-types.ts` ที่มี type ของทุก collection และ global | MUST |
| FR-INS-06 | `easy-cms migrate:create <name>` ต้องสร้าง migration file จากส่วนต่างระหว่าง config กับ schema ปัจจุบัน | MUST |
| FR-INS-07 | `easy-cms migrate` ต้องรัน migration ที่ยังไม่ได้รันตามลำดับ และบันทึกผลไว้ใน DB | MUST |
| FR-INS-08 | ทุกคำสั่งต้องมี `--help` และคืน exit code ≠ 0 เมื่อเกิด error | MUST |
| FR-INS-09 | `easy-cms migrate:status` ต้องแสดง migration ทั้งหมดและบอกว่ารันแล้วหรือยัง | SHOULD |

คำสั่ง `serve`, `run-scheduled`, `backup` และ `copy` อยู่ในหัวข้อ 3.15, 3.21 และ 3.26

### 3.2 Configuration (CFG)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-CFG-01 | ระบบต้องอ่าน config จาก `easy-cms.config.ts` ที่ export `defineConfig({...})` | MUST |
| FR-CFG-02 | Config ต้องกำหนดได้: `secret`, `db`, `admin`, `collections`, `globals`, `plugins`, `upload`, `auth`, `routes`, `serverURL` และตัวเลือกของฟีเจอร์ที่เพิ่มภายหลัง (`cors`, `localization`, `webhooks`, `cronSecret`, `endpoints`, `apiKeys`) | MUST |
| FR-CFG-03 | ระบบต้องตรวจ config ตอน start และแจ้ง error ที่ระบุตำแหน่งชัดเจน เช่น slug ซ้ำ, field name ซ้ำ, relationship ชี้ไป collection ที่ไม่มี | MUST |
| FR-CFG-04 | ระบบต้องไม่ start ถ้าไม่มี `secret` หรือ secret สั้นกว่า 32 ตัวอักษร | MUST |
| FR-CFG-05 | Plugin คือฟังก์ชัน `(config) => config` และต้องรันตามลำดับก่อนการตรวจ config | MUST |
| FR-CFG-06 | Collection `users` ต้องถูกเพิ่มให้อัตโนมัติ และ developer เพิ่ม field ของตัวเองเข้าไปได้ | MUST |
| FR-CFG-07 | `routes.api` กำหนด path ของ REST API (default `/api/cms`) และ `serverURL` ทำให้ URL ของไฟล์เป็นแบบเต็ม | MUST |

### 3.3 Content Modeling (MOD)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-MOD-01 | ต้องรองรับ field types: `text, textarea, number, boolean, date, select, slug, email, json, richText, upload, relationship, array, group` (และ `blocks` ตั้งแต่ 0.6 ดู FR-BLK) | MUST |
| FR-MOD-02 | ทุก field ต้องรองรับ option `name`, `label`, `required`, `defaultValue` | MUST |
| FR-MOD-03 | `text`/`textarea` รองรับ `minLength`, `maxLength` ส่วน `number` รองรับ `min`, `max` | MUST |
| FR-MOD-04 | `select` ต้องรองรับ `options` และ `hasMany` | MUST |
| FR-MOD-05 | `slug` ต้องสร้างค่าจาก field ที่ระบุใน `from` ได้อัตโนมัติ และต้องไม่ซ้ำกันภายใน collection (แยกตามภาษาเมื่อ localized) | MUST |
| FR-MOD-06 | `relationship` ต้องรองรับ `to` (collection เดียว) และ `hasMany` | MUST |
| FR-MOD-07 | `array` และ `group` ต้องซ้อน field อื่นได้ | MUST |
| FR-MOD-08 | Field ต้องรองรับ `unique` และ `index` | SHOULD |
| FR-MOD-09 | Field ต้องรองรับ `validate: (value, ctx) => true \| string` สำหรับ validation เพิ่มเติม | SHOULD |
| FR-MOD-10 | Collection ต้องกำหนด `useAsTitle` ได้ เพื่อใช้เป็นชื่อที่แสดงในหน้า Admin | SHOULD |

### 3.4 Data Management (DAT)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-DAT-01 | ระบบต้องสร้าง schema ของ DB จาก config และทุกตารางต้องมี prefix ที่กำหนดได้ (default `ecms_`) | MUST |
| FR-DAT-02 | ในโหมด development ระบบต้อง sync schema ให้อัตโนมัติเมื่อ config เปลี่ยน | MUST |
| FR-DAT-03 | ในโหมด production ระบบต้องไม่แก้ schema อัตโนมัติ ถ้าพบว่า schema ไม่ตรงกับ config ต้องแจ้ง error ที่ระบุ migration ที่ต้องรัน | MUST |
| FR-DAT-04 | Migration ต้องแตะเฉพาะตารางที่มี prefix ของ Easy CMS | MUST |
| FR-DAT-05 | ทุก document ต้องมี `id`, `createdAt`, `updatedAt` อัตโนมัติ | MUST |
| FR-DAT-06 | ต้องรองรับ SQLite และ PostgreSQL | MUST |
| FR-DAT-07 | ตารางภายในของฟีเจอร์เสริม (versions, scheduled jobs, webhook deliveries, API keys) ต้องถูกสร้างเฉพาะเมื่อเปิดฟีเจอร์นั้น โปรเจกต์ที่ไม่ใช้จึงไม่ต้องสร้าง migration ใหม่ | MUST |

### 3.5 Local API (LAPI)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-LAPI-01 | ต้องมี `find`, `findById`, `create`, `update`, `delete`, `count` สำหรับ collection และ `findGlobal`, `updateGlobal` สำหรับ global (คำสั่งของฟีเจอร์ที่เพิ่มภายหลังอยู่ในหัวข้อของฟีเจอร์นั้น) | MUST |
| FR-LAPI-02 | `find` ต้องรองรับ `where` (`equals, not_equals, in, not_in, gt, gte, lt, lte, like, exists`, `and`, `or`), `sort`, `limit`, `page` | MUST |
| FR-LAPI-03 | `find` ต้องคืนผลพร้อมข้อมูล pagination: `docs, totalDocs, page, totalPages, hasNextPage` | MUST |
| FR-LAPI-04 | ต้องรองรับ `depth` สำหรับดึงข้อมูลของ relationship และ upload มาด้วย (default 1, สูงสุด 3) | MUST |
| FR-LAPI-05 | Type ของค่าที่คืนต้องอนุมานจาก config ได้โดยไม่ต้อง generate types | MUST |
| FR-LAPI-06 | Local API ต้องข้ามการตรวจ access เป็น default และต้องมี option `overrideAccess: false, user` สำหรับบังคับตรวจ | MUST |
| FR-LAPI-07 | Adapter ต้องให้ host app เข้าถึง instance ของ CMS ได้ Nuxt ผ่าน `useEasyCMS()` ฝั่ง server และ Next ผ่าน `getEasyCMS()` โดยทั้ง server ต้องมี instance เดียว (ข้าม HMR และข้าม server layer ของ Next.js) | MUST |

### 3.6 REST API (REST)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-REST-01 | ต้องมี endpoints ต่อไปนี้ภายใต้ `/api/cms`: `GET/POST /:collection`, `GET/PATCH/DELETE /:collection/:id`, `GET/POST /globals/:slug` | MUST |
| FR-REST-02 | Query string ต้องรองรับ `where`, `sort`, `limit`, `page`, `depth` ให้มีความหมายเดียวกับ Local API | MUST |
| FR-REST-03 | REST ต้องตรวจ access ทุก request เสมอ | MUST |
| FR-REST-04 | Error ต้องคืน JSON รูปแบบ `{ errors: [{ message, field? }] }` พร้อม status code ที่เหมาะสม (400, 401, 403, 404, 405, 409, 413, 429, 500) | MUST |
| FR-REST-05 | ต้องมี auth endpoints: `POST /users/login`, `POST /users/logout`, `GET /users/me`, `GET /users/init` (มี user แล้วหรือยัง), `POST /users/first-register` (สร้าง admin คนแรก) | MUST |
| FR-REST-06 | Error 500 ต้องไม่ส่ง stack trace กลับไปใน production | MUST |
| FR-REST-07 | ต้องรับ `Authorization: Bearer <token>` สำหรับ client ที่ไม่ใช่ browser (ไม่ต้องใช้ CSRF token) ทั้ง session token และ API key (FR-KEY) | SHOULD |
| FR-REST-08 | `POST /media` (multipart, field `file`) สำหรับอัปโหลด และ `GET /media/file/:key` สำหรับเสิร์ฟไฟล์แบบ public พร้อม CSP `sandbox` | MUST |

### 3.7 Authentication (AUTH)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-AUTH-01 | User ต้อง login ด้วย email และ password ได้ | MUST |
| FR-AUTH-02 | Password ต้อง hash ด้วย scrypt พร้อม salt แยกต่อ user และต้องไม่เก็บ plain text หรือคืนค่า hash ออกทาง API | MUST |
| FR-AUTH-03 | เมื่อ login สำเร็จ ระบบต้องออก session cookie แบบ httpOnly, Secure (ใน production), SameSite=Lax ที่ลงนามด้วย `secret` | MUST |
| FR-AUTH-04 | Session ต้องหมดอายุตามค่าที่กำหนด (default 7 วัน) และ logout ต้องทำให้ session ใช้ไม่ได้ทันที | MUST |
| FR-AUTH-05 | ต้องจำกัดจำนวนครั้งที่ login ผิด (default 5 ครั้งต่อ 15 นาทีต่อ email + IP) และคืน 429 เมื่อเกิน IP มาจาก adapter (`getClientIp`) ถ้าไม่มีจะนับตาม email อย่างเดียว | MUST |
| FR-AUTH-06 | Password ต้องยาวอย่างน้อย 8 ตัวอักษร | MUST |
| FR-AUTH-07 | Admin ต้องสร้าง, แก้ไข, ปิดการใช้งานและรีเซ็ต password ของ user อื่นได้ผ่านหน้า Admin | MUST |
| FR-AUTH-08 | User ต้องเปลี่ยน password ของตัวเองได้ | MUST |
| FR-AUTH-09 | ลืมรหัสผ่านผ่าน email | MAY (ยังไม่มี) |
| FR-AUTH-10 | Role กำหนดได้ผ่าน `auth.roles` (ต้องมี `admin`) และระบบต้องไม่ยอมให้ลด role, ปิดใช้งาน หรือลบ admin คนสุดท้ายที่ยังใช้งานอยู่ | MUST |

### 3.8 Access Control (ACL)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-ACL-01 | Collection ต้องกำหนด access function แยกต่อ operation ได้: `read, create, update, delete` และ global กำหนด `read, update` | MUST |
| FR-ACL-02 | Access function รับ `{ user, id?, doc?, data? }` และคืน `boolean` หรือ `where` query เพื่อกรองรายการที่เห็นได้ | MUST |
| FR-ACL-03 | ถ้าไม่ได้กำหนด access ไว้ default ต้องเป็น "เฉพาะ user ที่ login แล้ว" ส่วนผู้ที่ไม่ได้ login ต้องถูกปฏิเสธ | MUST |
| FR-ACL-04 | ต้องมี helper `isAdmin`, `isLoggedIn`, `anyone` | MUST |
| FR-ACL-05 | Field ต้องกำหนด `access: { read, update }` ระดับ field ได้ | SHOULD |
| FR-ACL-06 | หน้า Admin ต้องซ่อนเมนูและปุ่มของ operation ที่ user ไม่มีสิทธิ์ | MUST |
| FR-ACL-07 | เมื่อเปิด `auth.rbac` admin ต้องเพิ่ม เปลี่ยนชื่อ คัดลอก และลบบทบาทได้จาก ตั้งค่า → Roles และติ๊กสิทธิ์ของแต่ละบทบาทได้ ทั้ง collection/global × read/create/update/delete/publish และหน้าใน admin (status, deliveries, หน้าและกล่องของ plugin) โดยไม่ต้องเขียนโค้ด พร้อมเก็บประวัติการแก้ ([ADR-0036](adr/0036-roles-from-the-admin.md)) | SHOULD |
| FR-ACL-08 | สิทธิ์ของบทบาทต้องตรวจฝั่ง server ซ้อนกับ access ในโค้ด (ต้องผ่านทั้งคู่) admin ทำได้ทุกอย่างเสมอ ผู้ที่ไม่ได้ login ใช้ access อย่างเดียว ทุกคนเข้าถึงบัญชีของตัวเองได้ และ API key ทำได้ไม่เกินบทบาทของเจ้าของ | MUST |
| FR-ACL-10 | เมื่อเปิด `auth.rbac` ทุก collection ยกเว้น users ต้องบันทึกผู้สร้าง (`createdBy`) ที่ request แก้ไม่ได้ และ collection กำหนด field เจ้าของเองได้ (`admin.ownerField`) ([ADR-0037](adr/0037-own-documents-and-field-permissions.md)) | MUST |
| FR-ACL-11 | admin ต้องจำกัด อ่าน แก้ไข ลบ และเผยแพร่ ของบทบาทให้เป็น "เฉพาะเอกสารของตัวเอง" ได้ต่อ collection และบทบาทนั้นต้องเปลี่ยนเจ้าของเอกสารไม่ได้ | SHOULD |
| FR-ACL-12 | admin ต้องตั้ง field ชั้นบนสุดเป็นแก้ได้ อ่านอย่างเดียว หรือซ่อน ต่อบทบาทได้ field ที่บังคับกรอกต้องแก้ได้เสมอสำหรับบทบาทที่สร้างเอกสาร และ field ที่อ่านไม่ได้ (จากบทบาทหรือ `access.read`) ต้องใช้กรองหรือเรียงไม่ได้ | SHOULD |
| FR-ACL-13 | การลบผู้ใช้ต้องโอนเอกสารที่ผู้ใช้เป็นเจ้าของให้ผู้ใช้อีกคนได้ (`transferTo`) หรือให้ไม่มีเจ้าของ และหน้า admin ต้องให้เลือกก่อนลบ | SHOULD |
| FR-ACL-14 | เมื่อเปิด `upload.folders` กับ `auth.rbac` admin ต้องกำหนดได้ต่อโฟลเดอร์ว่าแต่ละบทบาท ดู แก้ไข หรือจัดการได้ (ไม่อยู่ในรายการ = ไม่เห็น) โฟลเดอร์ย่อยใช้ตามแม่จนกว่าจะตั้งเอง สิทธิ์โฟลเดอร์ต้องจำกัดสิทธิ์ Media ของบทบาทให้แคบลงเท่านั้น ตรวจฝั่ง server ไม่มีผลกับ API key และผู้ที่ไม่ได้ login และการเปลี่ยนต้องบันทึกใน audit log ([ADR-0041](adr/0041-media-folders.md)) | SHOULD |
| FR-ACL-15 | API key ต้องจำกัดให้ใช้ media ได้เฉพาะบางโฟลเดอร์ (รวมโฟลเดอร์ย่อย) ทั้งการอ่าน เขียน อัปโหลด และอ่านไฟล์ส่วนตัว ([ADR-0043](adr/0043-private-files.md)) | SHOULD |
| FR-ACL-09 | บทบาทใน `auth.roles` ต้องลบไม่ได้ บทบาทที่ยังมีผู้ใช้ต้องลบไม่ได้ เมื่อเปิดใช้ครั้งแรกบทบาทเดิมต้องได้สิทธิ์เท่าที่เคยมี และ collection/global ที่เพิ่มภายหลังต้องเริ่มแบบไม่อนุญาต | MUST |

### 3.9 Drafts และ Publishing (DRF)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-DRF-01 | Collection และ global ที่ตั้ง `drafts: true` ต้องมี field `status` เป็น `draft` หรือ `published` | MUST |
| FR-DRF-02 | บันทึกแบบ draft ต้องข้ามการตรวจ `required` แต่ยังตรวจ type ของข้อมูล | MUST |
| FR-DRF-03 | Publish ต้องตรวจ validation ครบทุกข้อ | MUST |
| FR-DRF-04 | Local API และ REST ต้องรองรับ `draft: true` เพื่อดึงข้อมูลที่รวม draft และ default ต้องคืนเฉพาะ `published` เมื่อไม่ได้ login | MUST |
| FR-DRF-05 | ต้อง unpublish (เปลี่ยนกลับเป็น draft) ได้ | MUST |
| FR-DRF-06 | ถ้า**ไม่ได้**เปิด `versions` เอกสารมีฉบับเดียว การบันทึกเอกสารที่ published เป็น draft จึงเท่ากับ unpublish ถ้าเปิด `versions` ฉบับร่างจะแยกจากฉบับที่เผยแพร่ (FR-VER-03) | MUST |

### 3.10 Media / Upload (UPL)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-UPL-01 | ต้องมี collection `media` ในตัว เก็บ `filename, mimeType, filesize, width, height, alt, url` | MUST |
| FR-UPL-02 | ไฟล์ต้องเก็บไว้ที่ local disk ใน directory ที่กำหนดได้ หรือใน S3 storage (FR-S3) | MUST |
| FR-UPL-03 | ต้องตรวจ MIME type จากเนื้อหาไฟล์ (ไม่ใช่นามสกุล) เทียบกับ allowlist ที่กำหนดได้ | MUST |
| FR-UPL-04 | ต้องจำกัดขนาดไฟล์ (default 10 MB) และคืน 413 เมื่อเกิน | MUST |
| FR-UPL-05 | ชื่อไฟล์ที่บันทึกต้องผ่านการ sanitize และไม่ซ้ำกัน เพื่อป้องกัน path traversal และการเขียนทับ | MUST |
| FR-UPL-06 | ถ้าติดตั้ง `sharp` ไว้ ระบบต้องสร้าง thumbnail ตาม `imageSizes` ที่กำหนด | SHOULD |
| FR-UPL-07 | Storage ต้องเป็น interface (`put/get/delete/url`) เพื่อเพิ่ม adapter อื่นได้ | MUST |
| FR-UPL-15 | (0.41) เมื่อ storage รองรับ (S3/R2/MinIO, Vercel Blob) admin ต้องส่งไฟล์ที่ใหญ่กว่า 4 MB จาก browser ตรงไปที่ storage ผ่านใบอัปโหลดที่เซ็น (`POST <api>/media/uploads`, `/complete`) โดย server ตรวจสิทธิ์ก่อนส่ง และตรวจขนาดกับชนิดจากเนื้อหาหลังส่ง ไฟล์ที่ไม่ผ่านต้องถูกลบ ([ADR-0044](adr/0044-direct-uploads.md)) | SHOULD |
| FR-UPL-16 | (0.41) การเปลี่ยนความเป็นส่วนตัวของโฟลเดอร์ (รวมการย้ายและการลบ) ต้องปฏิเสธเมื่อมีไฟล์ต้องย้ายข้าม storage เกิน 200 ไฟล์ | MUST |
| FR-UPL-13 | (0.40) admin ต้องตั้งโฟลเดอร์เป็นส่วนตัวได้ (สืบทอดลงไป) ไฟล์ส่วนตัวต้องเก็บใน storage ที่ไม่มี URL สาธารณะ (`upload.privateStorage`) เสิร์ฟเฉพาะผ่าน `<api>/media/private/<key>` ให้ผู้ที่อ่านเอกสารนั้นได้หรือมีลิงก์ที่เซ็นจาก `cms.signedMediaURL()` (สูงสุด 7 วัน) ไม่แสดงต่อผู้ที่ไม่ได้ login และย้ายข้าม storage เมื่อความเป็นส่วนตัวเปลี่ยน โดย admin เตือนก่อนพร้อมจำนวนเอกสารที่ใช้ ([ADR-0043](adr/0043-private-files.md)) | SHOULD |
| FR-UPL-14 | (0.40) upload field ต้องระบุโฟลเดอร์ด้วย key ได้ (`folder`, สร้างให้เมื่อใช้ครั้งแรก) ให้ตัวเลือกไฟล์เปิดและอัปโหลดลงที่นั่น และ `folderOnly` ต้องจำกัดการเลือกและตรวจตอนบันทึก | SHOULD |
| FR-UPL-10 | (0.39) ต้องตรวจชนิดจากเนื้อหาได้เพิ่ม: docx, xlsx, pptx, odt, ods, odp, zip, MP3, WAV, Ogg, M4A, WebM, MOV และ CSV (แยกจากข้อความด้วยชื่อไฟล์) และ `mimeTypes` ต้องรับกลุ่ม `documents`, `office`, `archives` ([ADR-0042](adr/0042-media-types-and-previews.md)) | SHOULD |
| FR-UPL-11 | (0.39) admin ต้องอัปโหลดหลายไฟล์พร้อมกันได้ (ครั้งละ 3 ไฟล์) พร้อมความคืบหน้าของแต่ละไฟล์ ยกเลิกและลองใหม่ได้ทีละไฟล์ ปฏิเสธไฟล์ที่ใหญ่เกินก่อนส่ง และเลือกไฟล์ที่เพิ่งอัปไว้ | SHOULD |
| FR-UPL-12 | (0.39) admin ต้องแสดง icon และสีตามชนิดไฟล์ มุมมองกริดและตารางในหน้า Media และตัวอย่างตามชนิดในหน้าไฟล์ (รูป ตัวเล่นเสียง/วิดีโอ ตัวอ่าน PDF ส่วนต้นของข้อความและ CSV) โดยไม่ส่งไฟล์ไปบริการภายนอก และ PDF ต้องเสิร์ฟโดยไม่มี CSP sandbox | SHOULD |
| FR-UPL-09 | (0.38) เมื่อตั้ง `upload.folders` คลังสื่อต้องมีโฟลเดอร์ซ้อนกันได้ (`media-folders`) ไฟล์หนึ่งอยู่ได้โฟลเดอร์เดียว ชื่อไม่ซ้ำในโฟลเดอร์เดียวกัน ย้ายไฟล์และโฟลเดอร์ได้โดย URL ของไฟล์ไม่เปลี่ยน การลบโฟลเดอร์ต้องย้ายของข้างในขึ้นไปที่โฟลเดอร์แม่ และหน้า admin ต้องเรียกดู สร้าง เปลี่ยนชื่อ ย้าย (ลากวางและ "ย้ายไป…") ได้ทั้งในคลังสื่อและตัวเลือกไฟล์ ([ADR-0041](adr/0041-media-folders.md)) | SHOULD |
| FR-UPL-08 | (0.28) เมื่อตั้ง `upload.fromURL` ผู้ใช้ต้องอัปโหลดจากลิงก์ได้ (`cms.uploadFromURL`, `POST <api>/media` แบบ JSON `{ url }`, ช่อง "จากลิงก์" และการวางลิงก์ใน admin) โดยไฟล์ผ่านการตรวจเดียวกับการอัปโหลดปกติ | MUST |

### 3.11 Rich Text (RTX)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-RTX-01 | Field `richText` ต้องเก็บข้อมูลเป็น Tiptap JSON | MUST |
| FR-RTX-02 | Editor ต้องรองรับ heading (H2–H4), paragraph, bold, italic, underline, link, bullet/ordered list, blockquote, code, image (จาก media) | MUST |
| FR-RTX-03 | `@easy-cms/richtext` ต้องมี `renderRichText(json)` ที่คืน HTML ที่ escape แล้วและปลอดภัยจาก XSS | MUST |

### 3.12 Hooks (HOOK)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-HOOK-01 | Collection ต้องรองรับ hooks: `beforeValidate`, `beforeChange`, `afterChange`, `beforeDelete`, `afterDelete`, `afterRead` | MUST |
| FR-HOOK-02 | Hooks ต้องเป็น async ได้ และรันตามลำดับใน array | MUST |
| FR-HOOK-03 | `beforeChange` ต้องแก้ข้อมูลที่จะบันทึกได้ และถ้า throw ต้องยกเลิก operation | MUST |
| FR-HOOK-04 | Hooks ต้องทำงานเหมือนกันไม่ว่าจะเรียกผ่าน Local API, REST, หน้า Admin, API key หรือ MCP | MUST |
| FR-HOOK-05 | Global ต้องรองรับ `beforeChange`, `afterChange`, `afterRead` | MUST |

### 3.13 หน้า Admin (ADM)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-ADM-01 | หน้า Admin ต้องเข้าถึงได้ที่ path ที่กำหนด (default `/admin`) และ redirect ไปหน้า login ถ้ายังไม่ได้ login | MUST |
| FR-ADM-02 | ถ้ายังไม่มี user ในระบบ หน้า Admin ต้องแสดงฟอร์มสร้าง admin คนแรก | MUST |
| FR-ADM-03 | Sidebar ต้องแสดงรายการ collections และ globals ตาม access ของ user | MUST |
| FR-ADM-04 | หน้า list ต้องแสดงตาราง, ค้นหาจาก `useAsTitle`, เรียงลำดับ, แบ่งหน้า และลบได้ทั้งแบบรายการเดียวและหลายรายการ | MUST |
| FR-ADM-05 | หน้า edit ต้องสร้างฟอร์มจาก config ได้อัตโนมัติ และมี input ที่เหมาะกับทุก field type ใน FR-MOD-01 | MUST |
| FR-ADM-06 | ต้องแสดง validation error ที่ field ที่ผิด | MUST |
| FR-ADM-07 | ถ้าเปิด drafts ต้องมีปุ่ม "Save draft" และ "Publish" แยกกัน และแสดงสถานะปัจจุบัน | MUST |
| FR-ADM-08 | ต้องเตือนก่อนออกจากหน้าเมื่อมีข้อมูลที่ยังไม่ได้บันทึก | SHOULD |
| FR-ADM-09 | ต้องมีหน้า Media library สำหรับอัปโหลด ดู และเลือกไฟล์ | MUST |
| FR-ADM-10 | Field `relationship` ต้องมีตัวเลือกที่ค้นหาได้ | MUST |
| FR-ADM-11 | ต้องสลับภาษา UI ระหว่าง TH/EN ได้ และตั้ง default ผ่าน `admin.locale` | MUST |
| FR-ADM-12 | Label ใน config ต้องกำหนดแยกต่อภาษาได้ เช่น `label: { th: 'ชื่อเรื่อง', en: 'Title' }` | SHOULD |
| FR-ADM-13 | ต้องมีหน้า Account สำหรับเปลี่ยน password ของตัวเอง | MUST |

ความต้องการของหน้า Admin ที่เพิ่มหลัง v0.1 อยู่ในหัวข้อ 3.27

### 3.14 Adapters (ADP)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-ADP-01 | `@easy-cms/nuxt` ต้องเป็น Nuxt module ที่ลงทะเบียน server routes สำหรับ REST และเสิร์ฟหน้า Admin | MUST |
| FR-ADP-02 | `@easy-cms/next` ต้องมี route handler สำหรับ App Router ที่ประกาศ `runtime = 'nodejs'` | MUST |
| FR-ADP-03 | ทุก adapter (Nuxt, Next และ standalone) ต้องผ่านชุด E2E test เดียวกันทั้งหมด | MUST |
| FR-ADP-04 | Adapter ต้องไม่มี business logic และเรียกใช้ core handler เท่านั้น | MUST |
| FR-ADP-05 | Adapter ต้องรวมไฟล์ที่ต้องใช้ตอนรัน (admin app, migrations, admin modules ของ plugin) ไว้ใน build output ของ framework | MUST |

### 3.15 Standalone และ CORS (STA) — [ADR-0011](adr/0011-standalone-mode.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-STA-01 | `easy-cms serve` ต้องเสิร์ฟ REST API (`routes.api`), หน้า Admin (`admin.path`), `/healthz` และ redirect `/` ไปหน้า Admin โดยไม่ต้องมี Nuxt หรือ Next | 0.2 | MUST |
| FR-STA-02 | `--port`, `--host` กำหนดที่อยู่ได้ และ `--watch` ต้องสร้าง instance ใหม่เมื่อไฟล์ `.ts/.js` เปลี่ยน ถ้า config ใหม่ผิดให้ใช้ของเดิมต่อ | 0.2 | MUST |
| FR-STA-03 | `--trust-proxy` ต้องใช้ `X-Forwarded-For` (rate limit) และ `X-Forwarded-Proto` (cookie `Secure`) | 0.2 | MUST |
| FR-STA-04 | `cors` ใน config ต้องเปิดให้ origin ที่ระบุเรียกแบบไม่มี cookie ได้ ส่วน origin ใน `auth.trustedOrigins` ต้องได้ `allow-credentials` และ preflight ต้องตอบก่อนตรวจ auth | 0.2 | MUST |
| FR-STA-05 | Handler ของ standalone ต้องเป็น Web-standard (`createStandaloneHandler`) เพื่อนำไปใช้กับ runtime อื่นได้ | 0.2 | SHOULD |

### 3.16 S3 Storage (S3) — [ADR-0010](adr/0010-s3-storage.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-S3-01 | `@easy-cms/storage-s3` ต้องเก็บไฟล์บน AWS S3, Cloudflare R2, MinIO และบริการที่เข้ากันได้กับ S3 | 0.2 | MUST |
| FR-S3-02 | Credentials ต้องอ่านตอน `init()` (ไม่ใช่ตอนสร้าง adapter) และมีค่า default จาก `AWS_*` | 0.2 | MUST |
| FR-S3-03 | Default ต้องเสิร์ฟไฟล์ผ่าน API จาก bucket แบบ private พร้อม header เดียวกับ local storage ส่วน `publicUrl` ต้องชี้ไป CDN หรือ bucket โดยตรงได้ | 0.2 | MUST |

### 3.17 Version history (VER) — [ADR-0012](adr/0012-versions.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-VER-01 | `versions: true \| { max }` ต่อ collection/global ต้องเก็บเวอร์ชันทุกครั้งที่บันทึก (default สูงสุด 50 เวอร์ชันต่อเอกสาร) โดยไม่เก็บ field ที่ `hidden` | 0.3 | MUST |
| FR-VER-02 | ต้องมี `findVersions`, `findVersion`, `restoreVersion` (และชุดเดียวกันของ global) โดยอ่านเวอร์ชันได้เฉพาะผู้ที่มีสิทธิ์ `update` เอกสารนั้น การกู้คืนต้องผ่านสิทธิ์, hooks และ validation เหมือน `update` | 0.3 | MUST |
| FR-VER-03 | เมื่อมีทั้ง `drafts` และ `versions` การบันทึกฉบับร่างของเอกสารที่เผยแพร่อยู่ต้องไม่เปลี่ยนสิ่งที่ผู้เข้าชมเห็นจนกว่าจะ publish และการอ่านแบบ `draft: true` ต้องได้ฉบับร่างนั้น | 0.3 | MUST |
| FR-VER-04 | ต้องมี `unpublish` และ `discardDraft` ทั้ง Local API และ REST (`/unpublish`, `/discard-draft`, `/versions[/:v[/restore]]`) | 0.3 | MUST |
| FR-VER-05 | หน้า Admin ต้องมีแผง History (ดูแบบอ่านอย่างเดียวและกู้คืน), badge "Unpublished changes" และปุ่ม Publish changes / Save draft / Discard changes / Unpublish | 0.3 | MUST |

### 3.18 Live preview (PRV) — [ADR-0013](adr/0013-live-preview.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-PRV-01 | `preview: ({ doc, locale }) => url \| null` ต่อ collection/global ต้องเพิ่มแผง Preview ในหน้า edit ที่แสดงหน้าเว็บจริง | 0.4 | MUST |
| FR-PRV-02 | Preview ต้องอัปเดตตามฟอร์มโดยไม่บันทึก (`cms.preview`, `previewGlobal`, `POST …/preview`) และได้เอกสารรูปเดียวกับการอ่านปกติ (populate, afterRead, สิทธิ์ของ field) | 0.4 | MUST |
| FR-PRV-03 | ข้อมูลต้องส่งผ่าน `postMessage` ที่ระบุ targetOrigin และ helper ฝั่งหน้าเว็บ (`@easy-cms/core/live-preview`, `useLivePreview` ของ Nuxt และ Next) ต้องตรวจ origin ของผู้ส่ง | 0.4 | MUST |
| FR-PRV-04 | Preview token ต้องเปิดฉบับร่างของเอกสารเดียว (หรือ global เดียว) ได้โดยไม่ต้อง login ลงลายเซ็นด้วย `secret` และหมดอายุใน 1 ชั่วโมง | 0.5 | MUST |

### 3.19 Localization (LOC) — [ADR-0014](adr/0014-localization.md), [ADR-0016](adr/0016-blocks-and-localized-lists.md), [ADR-0017](adr/0017-durable-webhooks-block-queries-locale-moves.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-LOC-01 | `localization: { locales, defaultLocale, fallback }` และ `localized: true` บน field ต้องเก็บค่าแยกต่อภาษาในเอกสารเดียว | 0.5 | MUST |
| FR-LOC-02 | Local API และ REST ต้องรองรับ `locale` (รวมถึง `'all'`) และ `fallbackLocale` และ where/sort ต้องใช้ค่าของภาษาที่เลือก | 0.5 | MUST |
| FR-LOC-03 | `required` และ validate ต้องตรวจเฉพาะภาษาที่กำลังเขียน ส่วน slug และ `unique` ต้องแยกตามภาษา | 0.5 | MUST |
| FR-LOC-04 | Array, hasMany และ blocks ต้องตั้ง `localized` ได้ (หนึ่ง list ต่อภาษา) และค้นหาตามภาษาได้ เช่น `tags.en` | 0.6 | MUST |
| FR-LOC-05 | การเปิด localized กับ field เดิมและการเปลี่ยน `defaultLocale` ต้องไม่ทำให้ข้อมูลหาย (migration ย้ายค่าให้) | 0.5 / 0.7 | MUST |
| FR-LOC-06 | หน้า Admin ต้องมีตัวสลับภาษาของเนื้อหา (แยกจากภาษา UI) และแสดงว่า field ไหนยังไม่ได้แปล | 0.5 | MUST |

### 3.20 Blocks (BLK) — [ADR-0016](adr/0016-blocks-and-localized-lists.md), [ADR-0017](adr/0017-durable-webhooks-block-queries-locale-moves.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-BLK-01 | Field `blocks` (`blocks: [{ slug, labels, fields }]`) ต้องเก็บแถวต่างชนิดกันตามลำดับ (`{ id, blockType, ...fields }`) พร้อม validate, populate และ type แบบ union | 0.6 | MUST |
| FR-BLK-02 | หน้า Admin ต้องเพิ่ม ลบ และเรียงลำดับบล็อกได้ | 0.6 | MUST |
| FR-BLK-03 | `where` ต้องค้นข้างในบล็อกได้ (`layout.blockType`, `layout.<field>`, `layout.<group>.<field>`, `layout.<field>.<locale>`, `layout: { exists }`) รวมถึง list ที่ซ้อนอยู่ในบล็อก และ sort ตาม field ในบล็อกได้ | 0.7 / 0.9 | SHOULD |

### 3.21 Webhooks และการตั้งเวลา (WHK) — [ADR-0015](adr/0015-webhooks-and-scheduling.md), [ADR-0017](adr/0017-durable-webhooks-block-queries-locale-moves.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-WHK-01 | `webhooks: [{ url, events?, collections?, globals?, secret?, headers? }]` ต้องส่ง POST เมื่อเกิด event `create`, `update`, `delete`, `publish`, `unpublish`, `draft` | 0.6 | MUST |
| FR-WHK-02 | Body ต้องลงลายเซ็น `x-easy-cms-signature: sha256=<HMAC>` และมี `x-easy-cms-delivery` ที่เหมือนเดิมทุกครั้งที่ส่งซ้ำ | 0.6 | MUST |
| FR-WHK-03 | การส่งต้องไม่ทำให้การบันทึกช้าหรือล้ม และต้องบันทึกลงคิวในฐานข้อมูลก่อนส่งครั้งแรก ส่งซ้ำเมื่อล้มนานประมาณหนึ่งวันแล้วจึงเป็น `failed` | 0.6 / 0.7 / 0.8 | MUST |
| FR-WHK-04 | `flushWebhooks()` และ `destroy()` ต้องรอการส่งที่ค้างอยู่ สำหรับ serverless | 0.6 | MUST |
| FR-SCH-01 | `schedule: true` บน collection/global ที่มี drafts ต้องตั้งเวลาเผยแพร่หรือยกเลิกได้ (`cms.schedule`, ปุ่ม Schedule ในหน้า Admin) และงานต้องผ่าน hooks, versions และ webhooks ปกติ | 0.6 | MUST |
| FR-SCH-02 | Server ที่รันต่อเนื่องต้องรันงานที่ถึงเวลาทุกนาที ส่วน serverless ต้องเรียก `GET <api>/jobs/run` ด้วย `Bearer <cronSecret \| CRON_SECRET>` หรือ `easy-cms run-scheduled` ได้ | 0.6 | MUST |

### 3.22 Plugin endpoints และ admin components (PLG) — [ADR-0018](adr/0018-plugin-endpoints-admin-components.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-PLG-01 | `endpoints: [{ path, method, handler }]` ต้องเพิ่ม route ใต้ `routes.api` ที่ได้ auth, CSRF, CORS และรูปแบบ error เดียวกับ API ในตัว handler ได้ `{ request, url, params, user, cms, json() }` | 0.13 | MUST |
| FR-PLG-02 | Path ของ endpoint ต้องไม่ชนกับ API ในตัวหรือ slug ของ collection (ตรวจตอน start) segment ที่ตายตัวต้องชนะ parameter และ method ที่ผิดต้องได้ 405 พร้อม `Allow` | 0.13 | MUST |
| FR-PLG-03 | `admin.modules` ต้องโหลด ES module จาก export ของแพ็กเกจหรือ path ในโปรเจกต์ (ห้ามเป็น URL) และเสิร์ฟที่ `<api>/admin/modules/<n>.js` เฉพาะผู้ที่ login พร้อม ETag | 0.13 | MUST |
| FR-PLG-04 | Web Component (tag ขึ้นต้นด้วย `ecms-`) ต้องวางได้ที่ `admin.component` (แทนช่องกรอก), `admin.after` (ต่อท้าย field) และ `admin.sidebar` ของ collection/global | 0.13 | MUST |
| FR-PLG-05 | สัญญาเวอร์ชัน 1 ต้องส่ง property `apiVersion, value, path, field, label, doc, collection, global, id, locale, uiLocale, readOnly, options, api` และรับ event `change` กับ `set-field` การเปลี่ยนแบบไม่เข้ากันได้ต้องเพิ่ม `apiVersion` | 0.13 | MUST |
| FR-PLG-06 | ถ้า module โหลดไม่ได้หรือไม่มี tag ที่ระบุ หน้า Admin ต้องแสดงข้อความแทนที่ว่าง | 0.13 | MUST |
| FR-PLG-07 | `applyPlugins(config)` ต้องรัน plugin โดยไม่ตรวจ config เพื่อให้เครื่องมือตอน build อ่านสิ่งที่ plugin เพิ่มได้ | 0.13 | MUST |
| FR-PLG-09 | Plugin ต้องประกาศสิ่งที่เพิ่ม (field ของ collection/global และ collection) ในระดับ type ได้ด้วย `definePlugin` และ type ที่อนุมานจาก config ต้องรวมสิ่งเหล่านั้น plugin ทางการทุกตัวต้องประกาศ type ของตัวเอง | 0.25 | MUST |
| FR-PLG-10 | แพ็กเกจต้องเพิ่มชนิด field ได้ผ่าน `fieldTypes` (`defineFieldType`) โดยต่อยอดจากชนิด scalar ในตัว (เก็บ ค้นหา และ REST แบบชนิดฐาน) มี `validate`, `checkOptions`, input (`admin.component`) และ cell ในหน้ารายการ (`admin.cell`) ของตัวเอง ชื่อที่ซ้ำชนิดในตัวหรือซ้ำกันต้องเป็น config error และ type ต้องขยายได้ด้วย `CustomFieldTypes` แพ็กเกจ `@easy-cms/fields` ต้องมีชนิด `color` (`#rrggbb` / `#rrggbbaa`, `presets`) | 0.26 | MUST |
| FR-PLG-11 | plugin ต้องเพิ่มหน้าของตัวเอง (`admin.pages` ที่ `<admin>/p/<path>` พร้อม `label`, `icon`, `group: 'content' \| 'settings' \| false`) และกล่องบนแดชบอร์ด (`admin.dashboard` แบบ `half`/`full`) ได้ด้วย Web Component โดย `access` ต้องตรวจฝั่ง server และไม่ส่งหน้าหรือกล่องที่ผู้ใช้ไม่มีสิทธิ์ไปให้ admin, `path` ที่ซ้ำหรือผิดรูปต้องเป็น config error, element ต้องได้ `user` และ (บนหน้า) `route` และส่ง `navigate` ได้ form builder ต้องมีหน้า "ภาพรวมฟอร์ม" และกล่อง "7 วันล่าสุด" จาก `GET <api>/form/stats.json` ที่นับวันตามเขตเวลาของผู้ใช้ | 0.27 | MUST |
| FR-PLG-12 | plugin ต้องประกาศชื่อและเวอร์ชันได้ด้วย `definePlugin(fn, { name, version })` (ไม่บังคับ) plugin ทางการทุกตัวต้องประกาศ โดยเวอร์ชันมาจาก `package.json` ตอน build | 0.29 | MUST |
| FR-PLG-08 | Endpoint ที่ตั้ง `root: true` ต้องเสิร์ฟจาก root ของเว็บใน standalone server (`createRootEndpointHandler`) ด้วย auth และ CSRF เดียวกัน และ path ต้องไม่ชนกับ `routes.api`, `admin.path` หรือ `/healthz` | 0.17 | MUST |

### 3.23 SEO plugin (SEO) — [ADR-0018](adr/0018-plugin-endpoints-admin-components.md), [ADR-0020](adr/0020-seo-sitemap-robots-root-endpoints.md), [ADR-0021](adr/0021-seo-for-ai.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-SEO-01 | `seoPlugin()` ต้องเพิ่ม group `meta` (title, description, image) ท้าย field หรือในแถบข้าง และเป็น `localized` เมื่อเปิด localization | 0.13 | MUST |
| FR-SEO-02 | หน้า Admin ต้องแสดงตัวนับความยาว (นับเป็น grapheme สำหรับภาษาไทย) และตัวอย่างผลการค้นหา | 0.13 | MUST |
| FR-SEO-03 | ปุ่ม Generate ต้องเรียก `POST <api>/seo/generate` ด้วยค่าในฟอร์มที่ยังไม่บันทึก และ `autoGenerate` ต้องเติมช่องว่างตอนบันทึก | 0.13 | SHOULD |
| FR-SEO-04 | `seoMeta(doc)` ต้องคืนค่าสำหรับ `useSeoMeta` ของ Nuxt และ `generateMetadata` ของ Next โดยไม่ดึงโค้ด server เข้า bundle | 0.13 | MUST |
| FR-SEO-05 | `sitemap(cms)` และ `sitemapXml(cms)` ต้องรวมเฉพาะหน้าที่ผู้เข้าชมเห็นได้ (อ่านแบบไม่ login), มี URL จาก `generateURL` และไม่ได้ตั้ง noindex พร้อม `lastmod`, `xhtml:link` ของทุกภาษา และแบ่งเป็น index เมื่อเกิน 50,000 URL | 0.17 | MUST |
| FR-SEO-06 | `robotsTxt()` ต้องกัน crawler จาก admin และ API (ยกเว้นไฟล์อัปโหลด) และชี้ไปที่ sitemap มี `disallowAll` สำหรับ staging | 0.17 | MUST |
| FR-SEO-07 | Field `meta.noindex` ต้องทำให้หน้ามี `robots: noindex` และไม่อยู่ใน sitemap | 0.17 | MUST |
| FR-SEO-09 | `robotsTxt()` ต้องตั้ง crawler ของ AI เป็นกลุ่มได้ (`training`, `search`, `user`) โดยอนุญาตทั้งหมดเป็นค่าเริ่มต้น และทุกกลุ่มต้องได้กฎของ admin และ API | 0.18 | MUST |
| FR-SEO-10 | `llmsTxt()` ต้องสร้าง llms.txt จากหน้าชุดเดียวกับ sitemap ในภาษาเดียว และ `llmsFullTxt()` ต้องรวม Markdown ของทุกหน้าโดยหยุดที่ประมาณ 5 MB | 0.18 | MUST |
| FR-SEO-11 | `docMarkdown()` ต้องสร้าง Markdown ของเอกสารจากชื่อ คำอธิบาย วันที่ rich text ข้อความยาว และข้อความใน blocks/array และเขียนเองต่อ collection ได้ ส่วน `renderMarkdown()` ของ `@easy-cms/richtext` ต้อง escape และตัด URL ที่ไม่ปลอดภัย | 0.18 | MUST |
| FR-SEO-12 | `indexNow: { key }` ต้องส่ง URL (ทุกภาษา) เมื่อหน้าถูกเผยแพร่ แก้ไขขณะเผยแพร่ ยกเลิกเผยแพร่ หรือลบ รวมเป็นชุด ส่งเฉพาะ URL `https` สาธารณะ และเสิร์ฟไฟล์ key ที่ `/<key>.txt` | 0.18 | SHOULD |
| FR-SEO-08 | `seoMeta` ต้องสร้าง hreflang (รวม `x-default`), `og:locale`, `og:type: article` พร้อมเวลาเผยแพร่/แก้ไข และ JSON-LD (BlogPosting/WebPage) ส่วน `siteJsonLd()` ต้องสร้าง Organization + WebSite และ `jsonLdScript()` ต้อง escape ให้ปลอดภัยใน `<script>` | 0.17 | MUST |

### 3.23b Redirects plugin (RDR) — [ADR-0022](adr/0022-redirects-plugin.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-RDR-01 | `redirectsPlugin()` ต้องเพิ่ม collection `redirects` (from, to หรือเอกสาร, type 301/302/307/308) ใต้ตั้งค่าในหน้า Admin แก้ไขใน drawer | 0.19 | MUST |
| FR-RDR-02 | `from` ต้อง normalize เป็น pathname ที่ไม่มี `/` ท้ายและไม่ซ้ำ และ redirect ต้องมีปลายทางอย่างเดียวพอดี | 0.19 | MUST |
| FR-RDR-03 | `resolveRedirect(cms, url)` ต้องคืนปลายทางจาก cache ในหน่วยความจำ ล้างทันทีเมื่อมีการแก้ไขบน server เดียวกัน หมดอายุตาม `cacheTTL` และส่งต่อ query string | 0.19 | MUST |
| FR-RDR-04 | เมื่อที่อยู่ของเอกสารที่เผยแพร่อยู่ใน `collections` เปลี่ยน ต้องสร้าง redirect จากที่อยู่เดิม (ทุกภาษา) ไปยังเอกสาร โดยไม่ต่อกันเป็นทอดและไม่วนกลับ ปิดได้ด้วย `autoRedirect: false` | 0.19 | MUST |
| FR-RDR-05 | ต้องมี `GET <api>/resolve-redirect?path=` สำหรับ frontend อื่น | 0.19 | SHOULD |
| FR-ADM-19 | Collection ที่ตั้ง `admin.group: 'settings'` ต้องแสดงใต้ตั้งค่าในเมนู | 0.19 | SHOULD |

### 3.23c Email และ Form builder (EML, FRM) — [ADR-0023](adr/0023-email-and-form-builder.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-EML-01 | `email: EmailAdapter` ต้องส่งอีเมลให้ plugin และโค้ดของผู้ใช้ผ่าน `cms.sendEmail()` และมี `consoleEmail()` สำหรับ dev | 0.20 | MUST |
| FR-EML-02 | อีเมลต้องถูกบันทึกลงคิวก่อนส่ง ส่งไม่สำเร็จต้องลองใหม่ผ่าน `runJobs()` และ `flushEmails()` ต้องรอการส่งที่ค้างอยู่ | 0.20 | MUST |
| FR-EML-03 | `@easy-cms/email-smtp` ต้องส่งผ่าน SMTP โดยอ่านค่าตอนส่งฉบับแรก | 0.20 | MUST |
| FR-EML-04 | admin ต้องดู email adapter และค่าที่ใช้อยู่ได้ที่ ตั้งค่า → อีเมล (`EmailAdapter.describe()` ไม่มีความลับ) ตรวจการเชื่อมต่อได้ (`verify()`) และส่งอีเมลทดสอบได้ทันทีโดยไม่ผ่านคิว (ไม่เกิน 5 ครั้งใน 10 นาที) พร้อมคำแนะนำสำหรับ error ที่พบบ่อย | 0.31 | MUST |
| FR-FRM-01 | `formBuilderPlugin()` ต้องเพิ่ม `forms` (ช่องกรอกเป็น blocks 9 ชนิด, drafts, หลายภาษา, ข้อความหรือ redirect หลังส่ง, อีเมลแจ้งเตือน) และ `form-submissions` | 0.20 | MUST |
| FR-FRM-02 | การส่งฟอร์มต้องผ่าน endpoint `POST <api>/form/:slug/submit` เท่านั้น ตรวจข้อมูลตามนิยามของฟอร์มฝั่ง server และไม่เก็บ IP | 0.20 | MUST |
| FR-FRM-03 | ต้องกันสแปมด้วย honeypot, เวลาขั้นต่ำ, rate limit ต่อผู้เข้าชมต่อฟอร์ม และ Turnstile แบบเลือกเปิด บอทต้องได้คำตอบเหมือนสำเร็จโดยไม่บันทึกข้อมูล | 0.20 | MUST |
| FR-FRM-04 | อีเมลที่ส่งไปที่อยู่ของผู้ส่งฟอร์มต้องใส่ได้เฉพาะช่องสั้นและไม่มีตารางของทุกช่อง | 0.20 | MUST |
| FR-FRM-05 | `<easy-form>` ต้องแสดงฟอร์ม ส่ง และแสดง error ต่อช่องได้ใน Nuxt, Next และหน้า static และ CMS ต้องเสิร์ฟ element ที่ `/form/element.js` | 0.20 | MUST |
| FR-FRM-06 | ต้อง export ข้อมูลเป็น CSV ต่อฟอร์ม (BOM, กัน CSV injection) และมี `retentionDays` ลบข้อมูลเก่า | 0.20 | SHOULD |
| FR-STA-06 | request ที่ไม่มี session cookie จาก origin ใน `cors` ต้องผ่านการตรวจ CSRF ได้ | 0.20 | MUST |

### 3.23d หน้าย่อย / Nested docs (NST) — [ADR-0024](adr/0024-nested-docs.md)

| ID | Requirement | Release | Priority |
|---|---|---|---|
| FR-NST-01 | `nestedDocsPlugin({ collections })` ต้องเพิ่ม `parent` (relationship ไปหา collection เดียวกัน), `path` และ `breadcrumbs` ให้แต่ละ collection และใช้ `parent` เดิมถ้ามีอยู่แล้ว | 0.21 | MUST |
| FR-NST-02 | `path` และ `breadcrumbs` ต้องคำนวณจากหน้าแม่ที่เผยแพร่อยู่และ slug ของหน้า แยกตามภาษาเมื่อ slug เป็น localized | 0.21 | MUST |
| FR-NST-03 | เมื่อ slug, ชื่อ หรือหน้าแม่ของหน้าที่เผยแพร่เปลี่ยน หน้าลูกหลานทุกหน้าต้องได้ค่าใหม่ draft ของหน้าแม่ต้องไม่เปลี่ยนหน้าลูก และ draft ที่ค้างของหน้าลูกต้องยังค้างอยู่ | 0.21 | MUST |
| FR-NST-04 | ต้องไม่ให้เลือกหน้าตัวเองหรือหน้าลูกหลานเป็นหน้าแม่ ต้องจำกัดความลึก (`maxDepth`) และ path ต้องไม่ซ้ำ | 0.21 | MUST |
| FR-NST-05 | การลบหน้าที่มีหน้าลูกต้องถูกปฏิเสธเป็นค่าเริ่มต้น หรือย้ายหน้าลูกขึ้นระดับบนเมื่อตั้ง `onDeleteParent: 'orphan'` | 0.21 | MUST |
| FR-NST-06 | ต้องมี `findByPath()`, `getTree()` และ `GET <api>/tree/:collection` (เฉพาะหน้าที่เผยแพร่ ตามสิทธิ์อ่าน) | 0.21 | MUST |
| FR-NST-07 | ต้องมี `rebuildNestedDocs()` และคำสั่ง `easy-cms nested:rebuild` สำหรับข้อมูลเดิมและการซ่อม | 0.21 | SHOULD |
| FR-MOD-11 | Relationship ต้องรองรับ `filterOptions` ที่ทำงานฝั่ง server: ช่องเลือกใน admin แสดงเฉพาะเอกสารที่ผ่าน และการบันทึกต้องปฏิเสธเอกสารที่ไม่ผ่าน | 0.21 | MUST |
| FR-MOD-12 | Slug ต้องรองรับ `uniqueWithin` ห้ามซ้ำเฉพาะเอกสารที่มีค่าของอีก field เหมือนกัน | 0.21 | MUST |
| FR-ADM-20 | Collection ที่ตั้ง `admin.list.tree` ต้องแสดงหน้ารายการเป็นต้นไม้ (ขยายทีละระดับ) และกลับเป็นรายการแบนเมื่อค้นหาหรือกรอง `admin.list.sort` ต้องกำหนดลำดับเริ่มต้น | 0.21 | MUST |
| FR-LAPI-08 | `update(…, { live: true })` ต้องแก้เวอร์ชันที่เผยแพร่อยู่โดยไม่แตะ draft ที่ค้าง ไม่เปลี่ยน status และไม่เพิ่ม version | 0.21 | MUST |
| FR-INS-10 | CLI ต้องรันคำสั่งจาก `commands` ใน config (เช่นจาก plugin) โดยคำสั่งในตัวมาก่อน | 0.21 | SHOULD |
| FR-INS-11 | `create-easy-cms` ต้องรองรับ npm, pnpm, Yarn (1 และ 2+ แบบ node-modules) และ Bun: เลือกจาก `--pm`, `packageManager`, lockfile หรือ user agent ติดตั้งและแสดงขั้นต่อไปด้วยคำสั่งของตัวนั้น และบอกวิธีติดตั้งเมื่อไม่พบ | 0.22 | MUST |
| FR-INS-12 | CI ต้องทดสอบการสร้างโปรเจกต์ ติดตั้ง migrate และรัน server ด้วยทั้ง 4 ตัวจาก registry จำลอง | 0.22 | MUST |
| FR-INS-13 | บล็อกคำสั่งในเอกสารต้องมีแท็บ npm, pnpm, Yarn และ Bun ที่แปลงด้วยกฎเดียวกับ CLI และจำตัวที่เลือก | 0.22 | SHOULD |
| FR-INS-14 | ต้องมีปุ่ม Deploy to Vercel และ Deploy to Netlify ที่ได้เว็บพร้อมหน้า admin ฐานข้อมูล Postgres และที่เก็บไฟล์ โดยกรอกแค่รหัส setup ([ADR-0040](adr/0040-one-click-deploy.md)) | 0.37 | SHOULD |
| FR-INS-15 | CI ต้องทดสอบ template ของปุ่ม deploy กับ package ของ commit นั้น (build, start, หน้าเว็บ) และการออกรุ่นต้องอัปเดตเวอร์ชันใน template | 0.37 | MUST |
| FR-SEO-13 | `seoMeta({ breadcrumbs })` ต้องสร้าง BreadcrumbList JSON-LD | 0.21 | SHOULD |

### 3.23e Upload หลายไฟล์ (UPL) — [ADR-0026](adr/0026-upload-has-many.md)

| ID | Requirement | Release | Priority |
|---|---|---|---|
| FR-MOD-13 | `upload` ต้องรองรับ `hasMany` (เรียงลำดับได้ แยกตามภาษาได้) และ `mimeTypes` ที่ตรวจฝั่ง server ส่วน upload และ relationship แบบ hasMany ต้องรองรับ `minRows` / `maxRows` | 0.23 | MUST |
| FR-ADM-21 | upload แบบ hasMany ใน admin ต้องเลือกหลายไฟล์จากคลังได้ อัปโหลดหลายไฟล์ได้ เรียงลำดับด้วยการลากและด้วยคีย์บอร์ด และนำออกได้ | 0.23 | MUST |
| FR-ADM-22 | แดชบอร์ดต้องแสดงให้ admin เท่านั้น: กล่อง "ต้องดูแล" เมื่อมี webhook ที่ล้มใน 7 วัน อีเมลค้างเกิน 1 ชั่วโมงหรือล้ม งานกำหนดเวลาช้าเกิน 10 นาที ไม่มี `email` หรือ production ไม่มี `serverURL` (แต่ละรายการลิงก์ไปวิธีแก้) และกล่อง "ระบบ" (เวอร์ชัน ฐานข้อมูล ที่เก็บไฟล์ อีเมล plugin และชนิด field) ข้อมูลมาจาก `GET <api>/admin/status` ที่ตอบเฉพาะ admin และไม่ติดต่อออกไปข้างนอก | 0.29 | MUST |
| FR-ADM-23 | admin ต้องดู webhook และอีเมลที่ล้มหรือรอส่งได้ที่ ตั้งค่า → การส่ง (webhook พร้อม body อีเมลไม่แสดงเนื้อความ) ส่งซ้ำทันทีทีละรายการหรือทั้งหมด และลบได้ ผ่าน `<api>/admin/deliveries` ที่ตอบเฉพาะ admin และรายการที่ล้มเกิน 30 วันต้องถูกลบอัตโนมัติ | 0.30 | MUST |

### 3.23f ลืมรหัสผ่านและคำเชิญ (PWD) — [ADR-0027](adr/0027-password-links.md)

| ID | Requirement | Release | Priority |
|---|---|---|---|
| FR-AUTH-11 | เมื่อมี `email` ผู้ใช้ต้องขอลิงก์ตั้งรหัสใหม่ได้จากหน้า login ลิงก์ใช้ได้ครั้งเดียว หมดอายุ (ค่าเริ่มต้น 1 ชั่วโมง) และคำตอบต้องไม่บอกว่าอีเมลมีบัญชีหรือไม่ | 0.24 | MUST |
| FR-AUTH-12 | admin ต้องเชิญผู้ใช้ใหม่ทางอีเมลได้ (สร้างโดยไม่มีรหัสผ่าน) และส่งลิงก์ตั้งรหัสให้ผู้ใช้ที่มีอยู่ได้ | 0.24 | MUST |
| FR-AUTH-13 | การตั้งรหัสจากลิงก์ต้องยกเลิก session ทุกเครื่อง login ในเบราว์เซอร์นั้น และแจ้งเจ้าของบัญชีทางอีเมลเมื่อเป็นการ reset | 0.24 | MUST |
| FR-AUTH-14 | ผู้ใช้ต้องเข้าสู่ระบบหน้า admin ด้วยผู้ให้บริการใน `auth.providers` ได้ (OIDC, Google, Microsoft, GitHub) จับคู่ด้วย `sub` หรืออีเมลที่ยืนยันแล้ว และสร้างผู้ใช้ใหม่ได้เฉพาะโดเมนใน `allowSignUp` ([ADR-0038](adr/0038-single-sign-on.md)) | 0.35 | SHOULD |
| FR-AUTH-15 | `auth.password: false` ต้องให้เฉพาะ admin ใช้รหัสผ่าน และคำเชิญต้องชี้ไปที่การเข้าสู่ระบบด้วยผู้ให้บริการ | 0.35 | SHOULD |
| FR-AUTH-16 | ผู้ใช้ต้องเชื่อมและยกเลิกบัญชีภายนอกได้ในหน้า Account (ยกเลิกทางเข้าสุดท้ายไม่ได้) และ admin ต้องเห็น callback URL ใน ตั้งค่า → SSO | 0.35 | SHOULD |
| FR-AUTH-17 | ถ้าตั้ง `auth.setupCode` (`EASY_CMS_SETUP_CODE`) การสร้าง admin คนแรกต้องใช้รหัสนั้น และจำกัดจำนวนครั้งที่ลองผิด ([ADR-0040](adr/0040-one-click-deploy.md)) | 0.37 | MUST |
| NFR-SEC-12 | การเข้าสู่ระบบด้วยผู้ให้บริการต้องใช้ Authorization Code + PKCE + `state` + `nonce` ตรวจ ID token ด้วย key ของผู้ให้บริการ redirect ได้เฉพาะหน้าใน admin และการเชื่อมบัญชีต้องผ่าน CSRF | 0.35 | MUST |
| NFR-SEC-11 | บน production ลิงก์ต้องสร้างจาก `serverURL` เท่านั้น ไม่ใช้ Host ของ request และต้องจำกัดจำนวนคำขอต่ออีเมลและ IP | 0.24 | MUST |

### 3.24 API keys (KEY) — [ADR-0019](adr/0019-api-keys-and-mcp.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-KEY-01 | `apiKeys: true` ต้องเพิ่ม collection `api-keys` ที่ **ตั้งค่า → API keys** ในหน้า Admin โดยแสดง key ครั้งเดียวตอนสร้าง (`cms.createApiKey`, `POST <api>/api-keys`) | 0.15 | MUST |
| FR-KEY-02 | Key ต้องมีรูปแบบ `ecms_<prefix>_<secret>` และเก็บแค่ SHA-256 ของ secret (เทียบแบบเวลาคงที่) | 0.15 | MUST |
| FR-KEY-03 | Key ต้องทำงานในนามเจ้าของ โดยได้สิทธิ์เท่ากับส่วนที่ซ้อนกันระหว่างสิทธิ์ของ key กับสิทธิ์ของเจ้าของ แยกตาม collection/global และการกระทำ `read, create, update, delete, publish` (`create` ของ media คือการอัปโหลด) | 0.15 | MUST |
| FR-KEY-04 | การตรวจสิทธิ์ของ key ต้องอยู่ใน Local API ทุกช่องทางที่ส่ง `{ user, overrideAccess: false }` (REST, MCP, โค้ดของผู้ใช้) จึงได้กฎเดียวกัน | 0.15 | MUST |
| FR-KEY-05 | Key ต้องเข้าถึง `users` และ `api-keys` ไม่ได้และสร้าง key ไม่ได้ ผู้ใช้ต้องเห็นเฉพาะ key ของตัวเอง ส่วน admin เห็นทั้งหมด | 0.15 | MUST |
| FR-KEY-06 | Key ที่ผิด หมดอายุ ถูกลบ หรือเจ้าของถูกปิดใช้งาน ต้องได้ 401 (ไม่ถือเป็นผู้ที่ไม่ได้ login) การเพิกถอนคือการลบ key | 0.15 | MUST |
| FR-KEY-07 | `lastUsedAt` ต้องอัปเดตอย่างมากนาทีละครั้ง และ key ตั้ง `expiresAt` ได้ | 0.15 | SHOULD |

### 3.25 MCP plugin (MCP) — [ADR-0019](adr/0019-api-keys-and-mcp.md)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-MCP-01 | `mcpPlugin()` ต้องเปิด MCP server ที่ `POST <api>/mcp` (Streamable HTTP แบบ stateless) และต้องใช้ `apiKeys: true` | 0.16 | MUST |
| FR-MCP-02 | ต้องเชื่อมต่อด้วย API key เท่านั้น (session cookie ใช้ไม่ได้) และ tool ที่แสดงต้องมีเฉพาะที่ key อนุญาต: `find_`, `get_`, `create_`, `update_`, `delete_`, `publish_`/`unpublish_`, `schedule_`, `upload_media`, `get_global_`, `update_global_`, `publish_global_` | 0.16 | MUST |
| FR-MCP-03 | Input schema ของ tool ต้องสร้างจาก field ของ collection/global | 0.16 | MUST |
| FR-MCP-04 | ใน collection ที่มี drafts `create_` และ `update_` ต้องบันทึกเป็นฉบับร่างเสมอ มีแต่ `publish_` ที่ทำให้ขึ้นเว็บ | 0.16 | MUST |
| FR-MCP-05 | Rich text ต้องรับข้อความธรรมดาได้ และ upload ต้องรับเฉพาะ base64 (ห้ามดาวน์โหลด URL) | 0.16 | MUST |
| FR-MCP-06 | Error ต้องกลับเป็นข้อความที่ผู้ช่วยนำไปแก้ได้ (เช่น field ที่ validation ไม่ผ่าน) และต้องไม่มี tool ของ users, api-keys หรือการแก้ schema | 0.16 | MUST |
| FR-MCP-07 | ตัวเลือก `path`, `name`, `instructions`, `collections`, `globals` ต้องปรับ server ได้ | 0.16 | SHOULD |

### 3.26 สำรองและย้ายข้อมูล (OPS)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-OPS-01 | `easy-cms backup <file>` ต้องสำเนาฐานข้อมูล SQLite ที่สอดคล้องกันได้ขณะที่ CMS ยังทำงาน (`db.backup`) ส่วน Postgres ใช้ `pg_dump` | 0.10 | MUST |
| FR-OPS-02 | `easy-cms copy --from <config>` ต้องคัดลอกเอกสาร เวอร์ชัน ผู้ใช้ และ global ทั้งหมดข้ามฐานข้อมูล (เช่น SQLite → Postgres) โดย id คงเดิม | 0.14 | MUST |
| FR-OPS-03 | `copy` ต้องปฏิเสธเมื่อ schema ของสองฝั่งไม่ตรงกันหรือปลายทางไม่ว่าง และต้องตั้ง sequence ของ Postgres ต่อจาก id ที่คัดลอกมา | 0.14 | MUST |
| FR-OPS-04 | admin ต้อง backup ฐานข้อมูลได้จาก ตั้งค่า → Backups ทั้งกดเองและตามรอบ (`backups.every`) เป็นไฟล์ SQLite บีบอัดไฟล์เดียวสำหรับทุกฐานข้อมูล เก็บในที่ส่วนตัว (ไม่ใช่ uploads) เก็บตามจำนวน `keep` ดาวน์โหลดได้เฉพาะ admin พร้อมบันทึกผู้ดาวน์โหลด และแดชบอร์ดต้องเตือนเมื่อ backup ตามรอบล้มหรือหยุด | MUST |
| FR-OPS-05 | เมื่อเปิด `audit` ระบบต้องบันทึกการเปลี่ยนเนื้อหา (field ที่เปลี่ยนพร้อมค่าก่อนและหลัง ยกเว้น field ที่ซ่อน) การเข้าสู่ระบบ และการจัดการระบบ พร้อมผู้กระทำ ช่องทาง IP และเวลา และ admin (หรือบทบาทที่ได้รับสิทธิ์) ต้องกรอง ดู และส่งออก CSV ได้ ([ADR-0039](adr/0039-audit-log.md)) | 0.36 | SHOULD |
| NFR-SEC-13 | audit log ต้องแก้หรือลบผ่านระบบไม่ได้ (ยกเว้นตามอายุ `keep`) แต่ละรายการต้องลงลายเซ็นด้วย secret ให้ตรวจพบการแก้ในฐานข้อมูลได้ และแดชบอร์ดต้องเตือนเมื่อ login ไม่สำเร็จเกินเกณฑ์ บันทึกไม่สำเร็จ หรือพบรายการถูกแก้ | 0.36 | MUST |

### 3.27 หน้า Admin หลัง v0.1 (ADM)

| ID | ความต้องการ | ตั้งแต่ | ระดับ |
|---|---|---|---|
| FR-ADM-14 | ต้องมีธีม light / dark / system และปรับแบรนด์ได้ (`admin.brand`) | 0.11 | SHOULD |
| FR-ADM-15 | หน้า list ต้องกรองตามสถานะและ field แบบ select, เลือกคอลัมน์ และ publish / unpublish / ลบหลายรายการพร้อมกันได้ | 0.11 | SHOULD |
| FR-ADM-16 | เมนูและหน้า list ต้องใช้งานบนมือถือได้ | 0.11 | SHOULD |
| FR-ADM-17 | Collection ที่ตั้ง `editIn: 'drawer'` ต้องสร้างและแก้ไขเอกสารในแผงเหนือหน้า list ได้ โดย back และ reload ยังทำงาน | 0.12 | MAY |
| FR-ADM-18 | Dashboard ต้องแสดงจำนวนเอกสารในเมนูและลิงก์ "View site" (`admin.siteUrl`) และหน้า list/edit ต้องมี breadcrumb | 0.12 | MAY |

---

## 4. Non-Functional Requirements

### 4.1 Performance (PERF)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-PERF-01 | Local API `find` (limit 10, depth 1) บน Postgres ที่มีข้อมูล 10,000 รายการ ต้องตอบภายใน p95 < 50 ms (ไม่รวมเวลาเครือข่าย) | SHOULD |
| NFR-PERF-02 | REST `GET /:collection` ต้องตอบภายใน p95 < 150 ms ภายใต้เงื่อนไขเดียวกัน | SHOULD |
| NFR-PERF-03 | Bundle ของหน้า Admin (gzip) โหลดครั้งแรกต้อง < 500 KB โดย Rich text editor ต้อง lazy-load | SHOULD |
| NFR-PERF-04 | การเพิ่ม Easy CMS ต้องทำให้เวลา cold start ของ host app เพิ่มขึ้นไม่เกิน 300 ms | SHOULD |
| NFR-PERF-05 | ฟีเจอร์ที่ไม่ได้เปิด (versions, localization, webhooks, schedule, API keys) ต้องไม่เพิ่มงานต่อ request | SHOULD |

> ผลวัดจริง (M6, `pnpm --filter easy-cms-integration-tests bench`): Postgres 17 ได้ Local API p95 2.7 ms และ REST p95 4.3 ms, PGlite ได้ 3.5 / 4.0 ms, SQLite ได้ 0.4 / 0.4 ms

### 4.2 Security (SEC)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-SEC-01 | Request ที่เปลี่ยนแปลงข้อมูลด้วย cookie auth ต้องผ่านการป้องกัน CSRF (ตรวจ `Origin` + CSRF token) รวมถึง endpoint ของ plugin | MUST |
| NFR-SEC-02 | Query ทุกตัวต้องใช้ parameterized query ผ่าน Drizzle ห้ามต่อ string เป็น SQL | MUST |
| NFR-SEC-03 | Input จาก REST และ MCP ต้องผ่าน validation ตาม config ก่อนถึง DB | MUST |
| NFR-SEC-04 | หน้า Admin ต้องส่ง header `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy` และ admin module ของ plugin ต้องโหลดจาก origin เดียวกัน (`script-src 'self'`) | MUST |
| NFR-SEC-05 | Secret, password hash, session token และ API key ต้องไม่ปรากฏใน log หรือ error response | MUST |
| NFR-SEC-06 | ต้องมี `SECURITY.md` ที่ระบุช่องทางรายงานช่องโหว่ | MUST |
| NFR-SEC-07 | CI ต้องสแกนหา dependency ที่มีช่องโหว่ (`pnpm audit` หรือเทียบเท่า) | SHOULD |
| NFR-SEC-08 | Token ที่ออกให้ภายนอก (API key, preview token, `cronSecret`) ต้องจำกัดขอบเขตและตรวจแบบเวลาคงที่ ส่วน API key และ session เก็บเป็น hash เท่านั้น | MUST |
| NFR-SEC-09 | Server ต้องไม่ดาวน์โหลด URL ที่ได้รับจาก client หรือผู้ช่วย AI (กัน SSRF) ยกเว้นอัปโหลดจากลิงก์ที่เปิดด้วย `upload.fromURL` (0.28) ซึ่งต้องรับเฉพาะ `http(s)` ตรวจ host กับ `allowedHosts` และปฏิเสธที่อยู่ในเครือข่ายภายในหลัง resolve DNS ทุกครั้งที่ redirect (เว้นแต่ `allowPrivate`) และจำกัดเวลาและขนาด | MUST |
| NFR-SEC-10 | Webhook ต้องลงลายเซ็น HMAC เพื่อให้ปลายทางตรวจได้ว่ามาจากระบบจริง | MUST |

### 4.3 Usability (USE)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-USE-01 | Developer ที่รู้จัก Nuxt หรือ Next ต้องติดตั้งจนถึง login หน้า Admin ได้ภายใน 2 นาทีด้วย SQLite | MUST |
| NFR-USE-02 | Error message ของ config และ CLI ต้องบอกสาเหตุและวิธีแก้ | MUST |
| NFR-USE-03 | หน้า Admin ต้องใช้งานได้บนหน้าจอกว้างตั้งแต่ 768 px ขึ้นไป และงานหลัก (เมนู, list, edit) ต้องใช้บนมือถือได้ตั้งแต่ 0.11 | MUST |
| NFR-USE-04 | หน้า Admin ต้องผ่านเกณฑ์ WCAG 2.1 AA สำหรับ contrast, การใช้งานด้วย keyboard และ label ของฟอร์ม | SHOULD |

### 4.4 Reliability (REL)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-REL-01 | Operation ที่เขียนข้อมูลหลายตาราง (เช่น array, hasMany) ต้องทำใน transaction เดียว | MUST |
| NFR-REL-02 | Migration ที่ล้มเหลวต้อง rollback และไม่ถูกบันทึกว่ารันแล้ว | MUST |
| NFR-REL-03 | ถ้า `afterChange` hook throw ข้อมูลต้องยังถูกบันทึก และ error ต้องถูก log | MUST |
| NFR-REL-04 | Webhook ต้องไม่หายเมื่อ process ดับหรือ serverless หยุด (คิวในฐานข้อมูล) | MUST |
| NFR-REL-05 | การเขียน SQLite พร้อมกันทั้งใน process เดียวและข้าม process ต้องไม่ล้มด้วย `SQLITE_BUSY` ในงานปกติ (คิวการเขียนต่อไฟล์ และ busy timeout) | MUST |
| NFR-REL-06 | งานตั้งเวลาและคิว webhook ต้องไม่ถูกส่งพร้อมกันจากหลาย process (จองรายการก่อนส่ง) | SHOULD |

### 4.5 Maintainability (MNT)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-MNT-01 | เขียนด้วย TypeScript แบบ `strict` ทั้งหมด | MUST |
| NFR-MNT-02 | `@easy-cms/core` ต้องมี test coverage ≥ 80% (lines) | SHOULD |
| NFR-MNT-03 | ทุก package ต้องใช้ semver และมี changelog ที่สร้างจาก Changesets | MUST |
| NFR-MNT-04 | `@easy-cms/core` ต้องไม่ import จาก Nuxt, Next หรือ Vue | MUST |
| NFR-MNT-05 | สัญญาสาธารณะของ plugin (config, endpoint, admin component `apiVersion`) ต้องเปลี่ยนแบบเข้ากันได้ หรือเพิ่มเวอร์ชันของสัญญา | MUST |

### 4.6 Compatibility และ Portability (CMP)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-CMP-01 | ต้องทำงานบน Node.js 22 และ 24 ทั้งบน Linux, macOS และ Windows (CI รันทั้งสามระบบ) | MUST |
| NFR-CMP-02 | ต้อง publish เป็น ESM พร้อม type declarations | MUST |
| NFR-CMP-03 | ควรทำงานบน Bun ได้ (best-effort ไม่บังคับใน CI) | MAY |
| NFR-CMP-04 | Migration files ต้องใช้ได้ข้ามเวอร์ชัน การเปิดฟีเจอร์ใหม่ต้องมีแค่ migration เพิ่ม ไม่ต้องสร้างใหม่ทั้งหมด | MUST |

### 4.7 Documentation (DOC)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-DOC-01 | ต้องมีเว็บ docs (VitePress) ภาษาอังกฤษและไทย ครอบคลุม: Getting started (Nuxt/Next/Standalone), tutorial, คู่มือทุกฟีเจอร์และ plugin, recipes, Deployment, Backups, และ API Reference (config, fields, Local API, CLI) | MUST |
| NFR-DOC-02 | ต้องมี `examples/nuxt-blog`, `examples/next-blog` และ `examples/standalone` ที่รันได้ | MUST |
| NFR-DOC-03 | Public API ทุกตัวต้องมี TSDoc | SHOULD |
| NFR-DOC-04 | หน้า API Reference ต้องมี test ที่เทียบกับ type ของ core และคำสั่งของ CLI เพื่อไม่ให้เอกสารล้าสมัย | SHOULD |

---

## 5. External Interfaces

### 5.1 User Interface
- หน้า Admin เป็น Vue 3 SPA เสิร์ฟที่ `admin.path`
- หน้าหลัก: Login, สร้าง admin คนแรก, Dashboard, List, Edit (พร้อมแผง History และ Preview), Global edit, Media library, Account, ตั้งค่า (Users, API keys)
- ส่วนขยายจาก plugin: Web Components ใน field และแถบข้าง

### 5.2 Software Interfaces

| Interface | รายละเอียด |
|---|---|
| Nuxt | Nuxt module (`modules: ['@easy-cms/nuxt']`) |
| Next.js | Route handler ใน App Router + helper `getEasyCMS()` และ `withEasyCMS()` |
| Standalone | `easy-cms serve` (Node `http`) หรือ `createStandaloneHandler` แบบ Web-standard |
| SQLite | ผ่าน Drizzle + `@libsql/client` |
| PostgreSQL | ผ่าน Drizzle + postgres.js หรือ PGlite |
| S3-compatible | `@easy-cms/storage-s3` ผ่าน aws4fetch |
| sharp | Optional peer dependency |
| MCP | `@modelcontextprotocol/sdk` (Streamable HTTP) |

### 5.3 Communication Interfaces
- REST ผ่าน HTTP(S), JSON (UTF-8), upload ผ่าน `multipart/form-data`
- Auth ด้วย session cookie หรือ `Authorization: Bearer` (session token หรือ API key)
- CORS สำหรับ frontend ที่อยู่คนละ origin
- Webhook: HTTP POST ออกไปยัง URL ที่กำหนด พร้อม HMAC signature
- Live preview: `window.postMessage` ระหว่างหน้า Admin กับ iframe ของหน้าเว็บ
- MCP: JSON-RPC ผ่าน Streamable HTTP ที่ `<api>/mcp`

---

## 6. Data Requirements

### 6.1 ตารางในตัว

| ตาราง | คำอธิบาย | มีเมื่อ |
|---|---|---|
| `ecms_users` | ผู้ใช้หลังบ้าน: email (unique), password hash, role, active, createdAt, updatedAt | เสมอ |
| `ecms_sessions` | session ที่ยังใช้ได้ สำหรับ logout/revoke | เสมอ |
| `ecms_login_attempts` | การ login ที่ผิด สำหรับ rate limit | เสมอ |
| `ecms_media` | metadata ของไฟล์ | เสมอ |
| `ecms_migrations` | ประวัติ migration ที่รันแล้ว | เสมอ |
| `ecms_globals` | ข้อมูลของ globals | เสมอ |
| `ecms_<collection>` | 1 ตารางต่อ collection + ตารางย่อยสำหรับ array/hasMany (คอลัมน์ `<column>__<locale>` และ `_locale` เมื่อ localized) | เสมอ |
| `ecms_document_versions` | snapshot ของแต่ละเวอร์ชัน | มี `versions` |
| `ecms_scheduled_jobs` | งานเผยแพร่/ยกเลิกที่ตั้งเวลาไว้ | มี `schedule` |
| `ecms_webhook_deliveries` | คิวการส่ง webhook | มี `webhooks` |
| `ecms_api_keys` | API key (เก็บ hash), สิทธิ์ เจ้าของ วันหมดอายุ | `apiKeys: true` |

### 6.2 การเก็บรักษาข้อมูล
- ลบ document แล้วต้องลบออกจาก DB จริง (ยังไม่มี soft delete) เวอร์ชันเก่ายังอยู่ในประวัติจนถึงขีดจำกัด `max`
- ลบ media แล้วต้องลบไฟล์และ thumbnail ออกจาก storage ด้วย
- Session ที่หมดอายุต้องถูกล้างออกเป็นระยะ
- Webhook ที่ส่งสำเร็จต้องถูกลบออกจากคิว และรายการของ URL ที่ถูกลบจาก config ต้องถูกล้างทิ้ง

---

## 7. เกณฑ์ตรวจรับ

### 7.1 เกณฑ์ตรวจรับ v0.1

v0.1 ผ่านการตรวจรับเมื่อครบทุกข้อต่อไปนี้:

1. ทุก requirement ระดับ **MUST** ผ่าน test ที่เกี่ยวข้อง
2. `examples/nuxt-blog` และ `examples/next-blog` ทำสถานการณ์นี้ได้ทั้งคู่ และผ่าน Playwright E2E ใน CI:
   1. รัน `npx create-easy-cms` ในโปรเจกต์ใหม่
   2. สร้าง admin คนแรก → login
   3. สร้าง post พร้อมรูป cover และ rich text → บันทึกเป็น draft
   4. หน้าเว็บสาธารณะต้องไม่เห็น draft
   5. Publish → หน้าเว็บสาธารณะเห็น post ผ่าน Local API และ REST
   6. แก้ไข global `site` → หน้าเว็บแสดงค่าใหม่
   7. Editor (ไม่ใช่ admin) ต้องจัดการ users ไม่ได้
3. Integration test ผ่านบนทั้ง SQLite และ PostgreSQL
4. NFR-USE-01 (ติดตั้งจนถึง login ภายใน 2 นาที) ผ่านการทดสอบด้วยมือบน macOS และ Linux
5. เว็บ docs ครบตาม NFR-DOC-01 และ publish ทุก package ขึ้น npm ได้

**ผลการตรวจรับ v0.1 (2026-09-25)**

| เกณฑ์ | ผล |
|---|---|
| 1. ทุก requirement ระดับ MUST มี test | ✅ unit/integration 367 ข้อ (integration 101 ข้อ × SQLite, PGlite และ Postgres 17) |
| 2. สถานการณ์ E2E บน Nuxt และ Next | ✅ Playwright ชุดเดียวกัน 13 ข้อ × 2 (Nuxt + SQLite, Next + Postgres/PGlite) ครอบทั้งการสร้าง admin คนแรก, draft/publish, global, สิทธิ์ของ editor, upload และ rich text |
| 3. Integration บน SQLite และ PostgreSQL | ✅ รวมถึง Postgres 17 จริง (CI job `postgres`) |
| 4. NFR-USE-01 ติดตั้งจนถึง login ภายใน 2 นาที | ✅ ทดสอบด้วยมือบน macOS กับโปรเจกต์ Nuxt และ Next ที่สร้างใหม่: 6–7 วินาที (package อยู่ใน cache แล้ว ถ้าดาวน์โหลดจริงจะขึ้นกับความเร็วของ npm) ส่วน Linux ยังไม่ได้ทดสอบด้วยมือ แต่ CI รัน e2e บน Linux |
| 5. เว็บ docs และ publish ได้ | ✅ เว็บ docs ครบตาม NFR-DOC-01 (`website/`) และทุก package ผ่าน `publint` (publish 0.1.0 ขึ้น npm ภายหลังแล้ว) |

### 7.2 เกณฑ์สำหรับทุก release หลัง v0.1

1. ทุก requirement ระดับ MUST ของฟีเจอร์ใหม่มี test (unit หรือ integration บน SQLite, PGlite และ Postgres 17)
2. Playwright E2E ชุดเดียวกันผ่านบนทั้งสามแอป: Nuxt + SQLite, Next (production build) + Postgres/PGlite และ standalone + frontend คนละ origin
3. CI ผ่านบน Linux, macOS และ Windows (lint, typecheck, build, test)
4. มี changeset, เอกสาร EN/TH ของฟีเจอร์ใหม่ และ ADR เมื่อเป็นการตัดสินใจเชิงสถาปัตยกรรม
5. ทุก package publish ผ่าน npm Trusted Publishing ด้วยเวอร์ชันเดียวกัน
6. หน้าแรกของเว็บ docs (EN/TH) ตรงกับ release: badge "ใหม่ใน 0.x" การ์ดของ plugin ทางการทุกตัว และรูปที่ถ่ายใหม่ด้วย `pnpm docs:screenshots`
7. `README.md` และ README ของทุกแพ็กเกจตรงกับ release: ตาราง packages และ official plugins, features และคำสั่งติดตั้ง

**สถานะ ณ 0.16.0 (2026-09-28)**

| เกณฑ์ | ผล |
|---|---|
| E2E | ✅ 22 ข้อ × 3 แอป (66 ข้อ) รวม SEO, API keys และ MCP |
| Test ของ plugin | ✅ `plugin-seo` และ `plugin-mcp` มี test ของตัวเอง (MCP ทดสอบด้วย MCP client จริง) |
| เอกสาร | ✅ EN/TH ครบทุกฟีเจอร์ พร้อม tutorial, recipes 8 หน้า และ API Reference ที่มี test |
| Publish | ✅ ทุก package อยู่ที่ 0.16.0 บน npm |

---

## 8. Traceability

### 8.1 Milestones ของ v0.1

| Milestone | Requirements |
|---|---|
| M0 Foundation | FR-CFG-01..05, NFR-MNT-01, NFR-MNT-03, NFR-CMP-02 |
| M1 Core + DB | FR-MOD-*, FR-DAT-*, FR-LAPI-*, FR-INS-06..07, NFR-REL-01..02 |
| M2 Auth + Access + REST | FR-AUTH-*, FR-ACL-01..05, FR-REST-*, FR-CFG-06, NFR-SEC-01..05 |
| M3 Nuxt adapter | FR-ADP-01, FR-ADP-04 |
| M4 Admin UI | FR-ADM-01..13, FR-ACL-06, FR-RTX-*, NFR-PERF-03, NFR-USE-03..04 |
| M5 Upload + Drafts + Hooks | FR-UPL-*, FR-DRF-*, FR-HOOK-*, NFR-REL-03 |
| M6 Next adapter + Postgres | FR-ADP-02..03, FR-DAT-06 |
| M7 CLI + Docs + Release | FR-INS-01..05, FR-INS-08, NFR-DOC-*, NFR-USE-01..02, NFR-SEC-06 |

### 8.2 Releases หลัง v0.1

| เวอร์ชัน | เนื้อหา | Requirements | ADR |
|---|---|---|---|
| 0.2 | Standalone, CORS, S3 storage | FR-STA-*, FR-S3-*, FR-INS-01 | [0010](adr/0010-s3-storage.md), [0011](adr/0011-standalone-mode.md) |
| 0.3 | Version history | FR-VER-*, FR-DRF-06 | [0012](adr/0012-versions.md) |
| 0.4–0.5 | Live preview, preview token | FR-PRV-* | [0013](adr/0013-live-preview.md) |
| 0.5 | Localization | FR-LOC-01..03, 05, 06 | [0014](adr/0014-localization.md) |
| 0.6 | Blocks, localized lists, webhooks, การตั้งเวลา | FR-BLK-01..02, FR-LOC-04, FR-WHK-*, FR-SCH-* | [0015](adr/0015-webhooks-and-scheduling.md), [0016](adr/0016-blocks-and-localized-lists.md) |
| 0.7–0.9 | Webhook ที่ไม่หาย, ค้นในบล็อก, ย้ายภาษาเริ่มต้น, SQLite write queue | FR-BLK-03, FR-LOC-05, FR-WHK-03, NFR-REL-04..06 | [0017](adr/0017-durable-webhooks-block-queries-locale-moves.md) |
| 0.10 | `easy-cms backup` | FR-OPS-01 | — |
| 0.11–0.12 | Admin redesign, drawer | FR-ADM-14..18, NFR-USE-03 | — |
| 0.13 | Plugin endpoints, admin components, SEO plugin | FR-PLG-*, FR-SEO-*, FR-ADP-05 | [0018](adr/0018-plugin-endpoints-admin-components.md) |
| 0.14 | `easy-cms copy` | FR-OPS-02..03 | — |
| 0.15 | API keys | FR-KEY-*, NFR-SEC-08 | [0019](adr/0019-api-keys-and-mcp.md) |
| 0.16 | MCP plugin | FR-MCP-*, NFR-SEC-09 | [0019](adr/0019-api-keys-and-mcp.md) |
| 0.16.1 | Next.js: instance เดียวต่อ server | FR-LAPI-07 | — |
| 0.17 | SEO: sitemap, robots.txt, noindex, hreflang, JSON-LD; root endpoints | FR-SEO-05..08, FR-PLG-08 | [0020](adr/0020-seo-sitemap-robots-root-endpoints.md) |
| 0.18 | SEO สำหรับ AI: crawler ของ AI, llms.txt, Markdown, IndexNow | FR-SEO-09..12 | [0021](adr/0021-seo-for-ai.md) |
| 0.19 | Redirects plugin, `admin.group: 'settings'` | FR-RDR-*, FR-ADM-19 | [0022](adr/0022-redirects-plugin.md) |
| 0.20 | อีเมลใน core, email-smtp, form builder | FR-EML-*, FR-FRM-*, FR-STA-06 | [0023](adr/0023-email-and-form-builder.md) |
| 0.41 | อัปโหลดไฟล์ใหญ่ตรงไปที่ storage (S3, Vercel Blob) และจำกัดการย้ายไฟล์ 200 ไฟล์ | FR-UPL-15..16 | [0044](adr/0044-direct-uploads.md) |
| 0.40 | ไฟล์ส่วนตัว ลิงก์ที่เซ็น key ของโฟลเดอร์ใน upload field และ API key ตามโฟลเดอร์ | FR-UPL-13..14, FR-ACL-15 | [0043](adr/0043-private-files.md) |
| 0.39 | อัปโหลดหลายไฟล์ ชนิดไฟล์เอกสารและสื่อ icon ตัวอย่าง และมุมมองกริด | FR-UPL-10..12 | [0042](adr/0042-media-types-and-previews.md) |
| 0.38 | โฟลเดอร์ในคลังสื่อ และสิทธิ์ของบทบาทต่อโฟลเดอร์ | FR-UPL-09, FR-ACL-14 | [0041](adr/0041-media-folders.md) |
| 0.37 | Deploy ด้วยคลิกเดียว: template Next.js, Vercel Blob, Netlify Blobs, รหัส setup | FR-AUTH-17, FR-INS-14..15 | [0040](adr/0040-one-click-deploy.md) |
| 0.36 | Audit log: การเปลี่ยนแปลงระดับ field การเข้าสู่ระบบ การจัดการระบบ ลายเซ็น และการเตือน | FR-OPS-05, NFR-SEC-13 | [0039](adr/0039-audit-log.md) |
| 0.35 | Single sign-on: `@easy-cms/auth-oauth` (OIDC, Google, Microsoft, GitHub), `auth.password: false` | FR-AUTH-14..16, NFR-SEC-12 | [0038](adr/0038-single-sign-on.md) |
| 0.34 | เฉพาะเอกสารของตัวเอง (`createdBy`, `ownerField`), สิทธิ์ระดับ field, โอนเอกสารเมื่อลบผู้ใช้ | FR-ACL-10..13 | [0037](adr/0037-own-documents-and-field-permissions.md) |
| 0.33 | บทบาทและสิทธิ์จากหน้า admin (`auth.rbac`) | FR-ACL-07..09 | [0036](adr/0036-roles-from-the-admin.md) |
| 0.32 | Backups: ตามรอบและกดเอง ดาวน์โหลด การเก็บ เตือนเมื่อหยุดทำงาน | FR-OPS-04 | [0035](adr/0035-backups.md) |
| 0.31 | หน้า ตั้งค่า → อีเมล: ดูค่า ตรวจการเชื่อมต่อ ส่งอีเมลทดสอบ | FR-EML-04 | [0034](adr/0034-admin-email-settings.md) |
| 0.30 | หน้า "การส่ง": webhook และอีเมลที่ล้ม ส่งซ้ำ ลบ ลบอัตโนมัติ 30 วัน | FR-ADM-23 | [0033](adr/0033-admin-deliveries.md) |
| 0.29 | แดชบอร์ดสำหรับ admin: ต้องดูแล และระบบ (`/admin/status`), ชื่อและเวอร์ชันของ plugin | FR-ADM-22, FR-PLG-12 | [0032](adr/0032-admin-status.md) |
| 0.28 | อัปโหลดจากลิงก์ (`upload.fromURL`, `cms.uploadFromURL`) | FR-UPL-08, NFR-SEC-09 | [0031](adr/0031-upload-from-url.md) |
| 0.27 | หน้าของ plugin และกล่องบนแดชบอร์ด, ภาพรวมฟอร์ม | FR-PLG-11 | [0030](adr/0030-plugin-pages-and-dashboard.md) |
| 0.26 | ชนิด field ที่แพ็กเกจเพิ่มได้, `admin.cell`, `@easy-cms/fields` (`color`) | FR-PLG-10 | [0029](adr/0029-custom-field-types.md) |
| 0.25 | type ของ field และ collection ที่ plugin เพิ่ม (`definePlugin`) | FR-PLG-09 | [0028](adr/0028-typed-plugins.md) |
| 0.24 | ลืมรหัสผ่านและคำเชิญทางอีเมล | FR-AUTH-11..13, NFR-SEC-11 | [0027](adr/0027-password-links.md) |
| 0.23 | upload หลายไฟล์ (แกลเลอรี), `mimeTypes`, `minRows`/`maxRows` ของ hasMany | FR-MOD-13, FR-ADM-21 | [0026](adr/0026-upload-has-many.md) |
| 0.22 | npm, pnpm, Yarn และ Bun: `--pm`, คำสั่งตาม package manager, แท็บในเอกสาร, smoke test | FR-INS-11..13 | [0025](adr/0025-package-managers.md) |
| 0.21 | หน้าย่อย (nested docs), `filterOptions`, `uniqueWithin`, tree list, `live`, `commands`, BreadcrumbList | FR-NST-*, FR-MOD-11..12, FR-ADM-20, FR-LAPI-08, FR-INS-10, FR-SEO-13 | [0024](adr/0024-nested-docs.md) |

---

## 9. ประวัติการแก้ไข

| เวอร์ชัน | วันที่ | รายละเอียด |
|---|---|---|
| 1.0 | 2026-09-25 | ฉบับแรก จากการสรุปการออกแบบใน [DESIGN.md](DESIGN.md) |
| 1.1 | 2026-09-25 | เปลี่ยน Node ขั้นต่ำเป็น 22.12 เพราะ Node 20 EOL แล้ว |
| 1.2 | 2026-09-25 | M2: เพิ่ม FR-REST-05 (init, first-register), FR-REST-07 (Bearer), FR-AUTH-10 (roles, admin คนสุดท้าย) |
| 1.3 | 2026-09-25 | M5: FR-REST-08 (อัปโหลด/ไฟล์), FR-CFG-07 (`routes.api`, `serverURL`), ระบุว่า drafts ใน v0.1 ไม่มี version แยก |
| 1.4 | 2026-09-25 | M6: ผลวัด NFR-PERF-01/02 บน Postgres 17 (Local API p95 2.7 ms, REST p95 4.3 ms), Next.js adapter ใช้ `getEasyCMS(config)` |
| 1.5 | 2026-09-25 | M7: ผลตรวจรับ v0.1 (7.1) |
| 3.16 | 2026-10-08 | 0.41: FR-UPL-15..16 |
| 3.15 | 2026-10-07 | 0.40: FR-UPL-13..14, FR-ACL-15 |
| 3.14 | 2026-10-07 | 0.39: FR-UPL-10..12 |
| 3.13 | 2026-10-07 | 0.38: FR-UPL-09, FR-ACL-14 |
| 3.12 | 2026-10-06 | 0.37: FR-AUTH-17, FR-INS-14..15 |
| 3.11 | 2026-10-05 | 0.36: FR-OPS-05, NFR-SEC-13 |
| 3.10 | 2026-10-05 | 0.35: FR-AUTH-14..16, NFR-SEC-12 |
| 3.9 | 2026-10-05 | 0.34: FR-ACL-10..13 |
| 3.8 | 2026-10-05 | 0.33: FR-ACL-07..09 |
| 3.7 | 2026-10-04 | 0.32: FR-OPS-04 |
| 3.6 | 2026-10-04 | 0.31: FR-EML-04 |
| 3.5 | 2026-10-04 | 0.30: FR-ADM-23 |
| 3.4 | 2026-10-04 | 0.29: FR-ADM-22, FR-PLG-12; NFR-SEC-10 ที่ซ้ำ (ลิงก์ตั้งรหัสผ่าน) เปลี่ยนเป็น NFR-SEC-11 |
| 3.3 | 2026-10-04 | 0.28: FR-UPL-08, NFR-SEC-09 |
| 3.2 | 2026-10-04 | 0.27: FR-PLG-11 |
| 3.1 | 2026-10-04 | 0.26: FR-PLG-10 |
| 3.0 | 2026-10-04 | 0.25: FR-PLG-09 |
| 2.9 | 2026-10-03 | 0.24: FR-AUTH-11..13, NFR-SEC-11 |
| 2.8 | 2026-10-03 | 0.23: FR-MOD-13, FR-ADM-21 |
| 2.7 | 2026-10-01 | 7.2 ข้อ 7: README ตรงกับ release |
| 2.6 | 2026-10-01 | 0.22: FR-INS-11..13 |
| 2.5 | 2026-09-30 | 0.21: FR-NST-*, FR-MOD-11..12, FR-ADM-20, FR-LAPI-08, FR-INS-10, FR-SEO-13 |
| 2.4 | 2026-09-29 | 0.20: FR-EML-*, FR-FRM-*, FR-STA-06 |
| 2.3 | 2026-09-28 | 0.19: FR-RDR-*, FR-ADM-19 |
| 2.2 | 2026-09-28 | 0.18: FR-SEO-09..12 |
| 2.1 | 2026-09-28 | 0.17: FR-SEO-05..08, FR-PLG-08 |
| 2.0 | 2026-09-28 | ครอบคลุมถึง 0.16: ปรับขอบเขตและ FR เดิมให้ตรงกับปัจจุบัน (FR-DRF-06, FR-ADP-03, NFR-DOC-01, NFR-USE-03), เพิ่ม STA, S3, VER, PRV, LOC, BLK, WHK/SCH, PLG, SEO, KEY, MCP, OPS, ADM-14..18, NFR ใหม่, ตารางภายใน, เกณฑ์ตรวจรับ 7.2 และ traceability ของ release |
