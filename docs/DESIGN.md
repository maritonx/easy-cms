# Easy CMS — Design Document

- **สถานะ:** Accepted (living document)
- **วันที่:** 2026-10-01 (ฉบับแรก 2026-09-25)
- **ผู้เขียน:** Kanawoot K.
- **ครอบคลุม:** v0.1 ถึง v0.47
- **Requirements:** [SRS.md](SRS.md)

---

## 1. สรุป

Easy CMS เป็น **Headless CMS แบบ embedded และ code-first** ที่ติดตั้งผ่าน npm แล้วฝังเข้าไปในแอปของลูกค้าที่มี server อยู่แล้ว
จุดต่างหลักคือ **รองรับทั้ง Nuxt (Vue) และ Next.js (React) อย่างเท่าเทียม** ขณะที่เครื่องมือแนวเดียวกันอย่าง Payload ผูกกับ Next.js อย่างเดียว
และสำหรับ frontend อื่น (Vite, SPA, เว็บ static) รันเป็น server ของตัวเองได้ด้วยโหมด standalone

License MIT, ดูแลโดยนักพัฒนาคนเดียวแบบงานเสริม

## 2. ปัญหาและเป้าหมาย

**ปัญหา:** นักพัฒนาที่ใช้ Vue/Nuxt ไม่มี CMS แบบ embedded + code-first + type-safe ที่ดีพอ ต้องใช้ CMS แยก server (Strapi/Directus) หรือ SaaS (Contentful/Sanity)

**เป้าหมาย**
- `npx create-easy-cms` ในโปรเจกต์ Nuxt หรือ Next ที่มีอยู่แล้ว (หรือโฟลเดอร์ว่างสำหรับ standalone) ได้หน้า `/admin` ที่ login ได้ภายใน 2 นาที
- นิยาม content ด้วย TypeScript และได้ types ไปใช้ฝั่งหน้าเว็บทันที
- Editor ที่ไม่ใช่สายเทคนิคใช้หน้า Admin ได้ (TH/EN) รวมถึงร่าง แปล ตั้งเวลา และดูตัวอย่างก่อนเผยแพร่
- ต่อยอดได้ด้วย plugin และเปิดให้สคริปต์หรือผู้ช่วย AI ทำงานกับเนื้อหาได้อย่างปลอดภัย

**ไม่ใช่เป้าหมาย**
- UI สำหรับสร้าง content type แบบลากวาง (คงแนวทาง code-first)
- Edge runtime, MySQL (ยังไม่มีแผน)
- บริการ SaaS / hosting

## 3. ผู้ใช้

| กลุ่ม | ทำอะไร | ต้องการอะไร |
|---|---|---|
| **Developer** | ติดตั้ง, เขียน config, ติดตั้ง plugin, deploy | ตั้งค่าง่าย, type-safe, ไม่ผูกกับ framework |
| **Editor** | กรอก แปล และเผยแพร่ content | หน้า Admin ใช้ง่าย, มีภาษาไทย, มี draft, preview และประวัติ |
| **Script / ผู้ช่วย AI** | อ่านและเขียนเนื้อหาอัตโนมัติ | สิทธิ์ที่จำกัดได้ชัดเจน, ไม่ต้องใช้รหัสผ่านของคน |

## 4. สถาปัตยกรรม

```
┌──────────────── แอปลูกค้า (Nuxt / Next) หรือ easy-cms serve ─────────────────┐
│                                                                              │
│  หน้าเว็บ ─────► Local API: cms.find('posts')   (server-side)                 │
│  Browser ──────► REST: /api/cms/posts          (cookie หรือ CORS)             │
│  Script ───────► REST + Authorization: Bearer ecms_…  (API key)              │
│  ผู้ช่วย AI ───► /api/cms/mcp                   (plugin-mcp + API key)        │
│  Frontend ─────► /api/cms/graphql               (plugin-graphql)              │
│  Editor ───────► /admin  (Vue SPA ที่ build มาพร้อม package + Web Components) │
│                      │                                                       │
│    @easy-cms/nuxt  |  @easy-cms/next  |  standalone (CLI)  (adapter บางๆ)    │
│                      │                                                       │
│               @easy-cms/core                                                 │
│   handler(Request) => Response · config · plugins · access · hooks           │
│   versions · localization · webhooks · scheduled jobs · API keys             │
│                      │                                                       │
│     @easy-cms/drizzle ─► SQLite / Postgres (ตาราง prefix ecms_)               │
│     Storage ──────────► Local disk / S3-compatible                           │
│     Webhooks ─────────► บริการภายนอก (HMAC)                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Core เป็น Web-standard handler
`@easy-cms/core` เปิด handler ตามมาตรฐาน Web `(Request) => Promise<Response>` และ Local API
Adapter มีหน้าที่แค่ต่อ route ของ framework เข้ากับ handler และส่ง instance ของ CMS เข้า server context → ดู [ADR-0001](adr/0001-embedded-web-standard-core.md)

ทุกช่องทาง (Local API ที่ส่ง `user`, REST, GraphQL, MCP) ไปจบที่ Local API ชุดเดียว สิทธิ์ hooks validation versions และ webhooks จึงทำงานเหมือนกันเสมอ

### 4.2 Admin UI
เขียนด้วย Vue 3 + Vite, build เป็น static SPA และเสิร์ฟที่ `/admin` ใช้ได้เหมือนกันทั้งใน Nuxt, Next และ standalone → ดู [ADR-0002](adr/0002-prebuilt-vue-admin-spa.md), [ADR-0007](adr/0007-admin-ui.md)

ตั้งแต่ 0.11 มีธีม light/dark/system, ฟอนต์ Anuphan, ใช้บนมือถือได้ และปรับแบรนด์ได้ (`admin.brand`)
ส่วนขยายจาก plugin เป็น Web Components (หัวข้อ 4.4)

### 4.3 โหมด Standalone (0.2)
`easy-cms serve` ห่อ core ด้วย Node HTTP server (`createStandaloneHandler` แบบ Web-standard) รวม REST, admin, `/healthz` และ `--watch`
Frontend ที่อยู่คนละ origin เรียกผ่าน CORS (`cors` และ `auth.trustedOrigins`) → ดู [ADR-0011](adr/0011-standalone-mode.md)

### 4.4 Plugins (0.13)
Plugin ยังเป็น `(config) => config` เหมือน v0.1 ความสามารถใหม่อยู่ใน config ที่ plugin (และผู้ใช้) เติมได้ → ดู [ADR-0018](adr/0018-plugin-endpoints-admin-components.md)
- **`endpoints`**: route ใต้ `routes.api` ที่ได้ auth, CSRF, CORS และรูปแบบ error เดียวกับ API ในตัว
- **`admin.modules`**: ES module ที่ลงทะเบียน Web Components (`ecms-*`) เสิร์ฟผ่าน `<api>/admin/modules/<n>.js`
  วางได้ที่ `admin.component`, `admin.after` ของ field และ `admin.sidebar` ของ collection/global สัญญาเวอร์ชัน 1 คือ property เข้า event (`change`, `set-field`) ออก
- เลือก Web Components แทนการแชร์ Vue เพราะสัญญาเล็กและคงที่ เปลี่ยนภายในหน้า admin ได้โดย plugin ไม่พัง
- **root endpoints** (0.17): `root: true` เสิร์ฟจาก root ของเว็บใน standalone (เช่น `/robots.txt`) ส่วนแอป Nuxt/Next ใช้ helper ของ plugin ใน route ของตัวเอง → ดู [ADR-0020](adr/0020-seo-sitemap-robots-root-endpoints.md)
- **`commands`** (0.21): คำสั่ง `easy-cms <name>` จาก plugin และ **`filterOptions`**, **`admin.list.tree`**, **`update({ live })`** ที่ plugin nested docs ใช้ → ดู [ADR-0024](adr/0024-nested-docs.md)
- **`fieldTypes`** (0.26): ชนิด field จากแพ็กเกจ (`defineFieldType`) ต่อยอดจากชนิด scalar ในตัว `resolveConfig` แปลงเป็นชนิดฐานพร้อม `customType` จึงไม่ต้องแก้ database adapter มี `validate`, input และ `admin.cell` ในหน้ารายการของตัวเอง type ขยายด้วย `CustomFieldTypes` → ดู [ADR-0029](adr/0029-custom-field-types.md)
- **`admin.pages` และ `admin.dashboard`** (0.27): หน้าของ plugin ที่ `<admin>/p/<path>` (admin วาดส่วนหัว) และกล่องบนแดชบอร์ด ทั้งคู่เป็น Web Component มี `access` ที่ตรวจตอนสร้าง admin schema element ได้ `user`, `route` และส่ง `navigate` ได้ → ดู [ADR-0030](adr/0030-plugin-pages-and-dashboard.md)

### 4.5 API keys และ MCP (0.15–0.16)
- **API keys** อยู่ใน core (`apiKeys: true`): key ทำงานในนามเจ้าของ ได้สิทธิ์ส่วนที่ซ้อนกันของ key กับเจ้าของ ตรวจใน Local API จุดเดียว
- **`@easy-cms/plugin-mcp`** เป็น endpoint `POST <api>/mcp` แบบ stateless (สร้าง server ใหม่ทุก request) จึงใช้บน serverless ได้ tool สร้างจาก collection และสิทธิ์ของ key
→ ดู [ADR-0019](adr/0019-api-keys-and-mcp.md)

### 4.7 Multi-tenant และ context ของ request (0.44)
- **`onRequest`** ใน config หา `context` ของแต่ละ request และผู้ใช้ใน context นั้น ส่งต่อให้ access, hook, `filterOptions` และ Local API (`context`) ผู้ใช้ที่ `scoped` เป็น admin ของส่วนของตัวเองเท่านั้น (`isSystemAdmin`)
- **global ที่มี `scope`** เก็บค่าต่อ scope (`<slug>@<scope>`), **`uniqueWithin`** ใช้ได้ทุก field ที่ unique พร้อม index `(scope, field)`, **`admin.switcher`** ตัวเลือกด้านบนเมนูเก็บใน cookie
- **`@easy-cms/plugin-multi-tenant`** แยก tenant แบบ row-level ในฐานข้อมูลเดียว: collection `tenants`, field `tenant`, สมาชิกและบทบาทต่อ tenant, global ต่อ tenant, ตัวสลับ และหน้า Members → ดู [ADR-0047](adr/0047-multi-tenant.md)
- **0.47 ระบบจัดการ:** เมนูเป็นกลุ่มที่พับได้ (`admin.nav`, `admin.group`) สร้างต่อผู้ใช้ใน `AdminSchema.nav`, badge (`GET admin/counts`), command palette (`GET admin/search`) และคีย์ลัด, `admin.layout` (แท็บ ส่วนที่พับ แถว) และ `admin.condition` ที่ใช้ทั้ง admin และ server → ดู [ADR-0050](adr/0050-admin-navigation-and-layouts.md)
- **`@easy-cms/plugin-ecommerce`** ร้านค้า: สินค้าและตัวเลือก ราคาหลายสกุลเงิน ตะกร้า (guest ด้วย) ชำระเงินผ่าน Stripe หรือโอนเงิน คำสั่งซื้อที่สร้างครั้งเดียว สต็อก และบัญชีลูกค้า บนจุดต่อใหม่ใน core: `auth.members` และการสมัคร, `update` แบบมีเงื่อนไข, `increment`, `jobs`, `events` → ดู [ADR-0049](adr/0049-ecommerce.md)
- **0.45:** upload `filterOptions`, `uniqueWithin` หลาย field, `cms.uniqueScope()` ให้ plugin หาเอกสารตาม key ใน scope ที่ถูก (โฟลเดอร์, หน้าย่อย, redirects, ฟอร์ม), `audit.scope`, `admin.confirmDelete` และตัวเลือก field ใน admin (`defaultValue`, `column`, `allowCreate`) → ดู [ADR-0048](adr/0048-multi-tenant-follow-ups.md)

### 4.6 GraphQL (0.43)
- **`@easy-cms/plugin-graphql`** สร้าง schema จาก config ที่ resolve แล้ว ทุก resolver เรียก Local API ด้วย `overrideAccess: false` ความสัมพันธ์โหลดผ่าน DataLoader ต่อ request จำกัดความลึก 7 และ 2000 เอกสารต่อ request ต่อยอดด้วย `extend` และ `buildGraphQLSchema` → ดู [ADR-0046](adr/0046-graphql-plugin.md)

## 5. Packages

ทุก package ใช้เวอร์ชันเดียวกัน (Changesets fixed group) และ publish ผ่าน npm Trusted Publishing

| Package | หน้าที่ | ตั้งแต่ |
|---|---|---|
| `@easy-cms/core` | config, handler, Local API, access, hooks, validation, versions, localization, webhooks, jobs, API keys | 0.1 |
| `@easy-cms/admin` | Vue SPA ที่ build แล้ว | 0.1 |
| `@easy-cms/nuxt` | Nuxt module | 0.1 |
| `@easy-cms/next` | Next.js adapter (App Router, `runtime = 'nodejs'`) | 0.1 |
| `@easy-cms/drizzle` | Drizzle layer ที่ใช้ร่วมกัน: schema, where → SQL, CRUD, migrator, transfer | 0.1 |
| `@easy-cms/db-sqlite` | Drizzle + SQLite (libSQL) | 0.1 |
| `@easy-cms/db-postgres` | Drizzle + Postgres (postgres.js หรือ PGlite) | 0.1 |
| `@easy-cms/richtext` | `renderRichText()` แปลง Tiptap JSON → HTML และ `renderMarkdown()` (0.18) | 0.1 |
| `@easy-cms/storage-s3` | S3 / R2 / MinIO | 0.2 |
| `@easy-cms/plugin-seo` | field `meta`, ตัวนับความยาว, ตัวอย่างผลการค้นหา, `seoMeta()`, sitemap, robots.txt, hreflang, JSON-LD (0.17), crawler ของ AI, llms.txt, Markdown, IndexNow (0.18) | 0.13 |
| `@easy-cms/plugin-mcp` | MCP server สำหรับผู้ช่วย AI | 0.16 |
| `@easy-cms/plugin-graphql` | GraphQL API: query และ mutation ของทุก collection/global, `extend`, `generate:graphql` | 0.43 |
| `@easy-cms/plugin-multi-tenant` | หลาย tenant ใน CMS เดียว: เนื้อหา สมาชิก บทบาท และ global ต่อ tenant, ตัวสลับ, `tenants:assign` | 0.44 |
| `@easy-cms/plugin-redirects` | redirect ในหน้า admin, redirect อัตโนมัติเมื่อที่อยู่เปลี่ยน, `resolveRedirect()` | 0.19 |
| `@easy-cms/plugin-form-builder` | ฟอร์มในหน้า admin, submissions, อีเมลแจ้งเตือน, กันสแปม, `<easy-form>`, ภาพรวมฟอร์มและกล่องบนแดชบอร์ด (0.27) | 0.20 |
| `@easy-cms/email-smtp` | email adapter ผ่าน SMTP (nodemailer) | 0.20 |
| `@easy-cms/plugin-nested-docs` | หน้าแม่/ลูก, path และ breadcrumbs ที่ไล่อัปเดตเอง, `findByPath()`, `getTree()`, `nested:rebuild` | 0.21 |
| `@easy-cms/fields` | ชนิด field เพิ่มเติม: `color` (ตัวเลือกสี, สีแนะนำ, จุดสีในหน้ารายการ) | 0.26 |
| `easy-cms` (bin) | CLI และโหมด standalone | 0.1 |
| `create-easy-cms` | ตัว scaffold (Nuxt, Next, standalone) | 0.1 |

Repo: **pnpm workspaces + Turborepo + Changesets + Biome**

```
easy-cms/
├── packages/   core, admin, nuxt, next, drizzle, db-sqlite, db-postgres, richtext, storage-s3,
│               plugin-seo, plugin-mcp, plugin-graphql, plugin-multi-tenant, plugin-redirects, plugin-form-builder, plugin-nested-docs, fields, email-smtp, cli,
│               create-easy-cms, integration (test เท่านั้น)
├── examples/   nuxt-blog, next-blog, standalone   (ใช้เป็น fixture ของ E2E ด้วย)
├── e2e/        Playwright ชุดเดียวสำหรับทั้งสามแอป + สคริปต์ถ่าย screenshot ของเอกสาร
├── website/    VitePress (EN + TH)
└── docs/       SRS, DESIGN, ADRs
```

## 6. Config (Code-first)

```ts
// easy-cms.config.ts
import { defineConfig, isAdmin } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { seoPlugin } from '@easy-cms/plugin-seo'
import { mcpPlugin } from '@easy-cms/plugin-mcp'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET!,
  db: sqlite({ url: 'file:./cms.db' }),   // หรือ postgres({ url })
  admin: { path: '/admin', locale: 'th' },
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  apiKeys: true,
  webhooks: [{ url: process.env.DEPLOY_HOOK!, events: ['publish', 'unpublish'] }],
  collections: [
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      schedule: true,
      preview: ({ doc }) => `/posts/${doc.slug}`,
      access: {
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
        create: isAdmin,
        update: isAdmin,
      },
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'cover', type: 'upload' },
        { name: 'body', type: 'richText', localized: true },
        { name: 'layout', type: 'blocks', blocks: [/* hero, gallery, … */] },
        { name: 'author', type: 'relationship', to: 'users' },
      ],
    },
  ],
  globals: [
    { slug: 'site', fields: [{ name: 'siteName', type: 'text' }] },
  ],
  plugins: [seoPlugin({ collections: ['posts'] }), mcpPlugin()],
})
```

**Field types:** `text, textarea, number, boolean, date, select, slug, email, json, richText, upload, relationship, array, group, blocks`

ฟีเจอร์เสริมทุกตัว (`versions`, `localization`, `schedule`, `webhooks`, `apiKeys`) เป็นแบบ opt-in และจะเพิ่มตารางหรือคอลัมน์เฉพาะเมื่อเปิดใช้

## 7. Data layer

- **ORM:** Drizzle, ประกาศ schema อัตโนมัติจาก config ผ่าน `@easy-cms/drizzle` ที่ใช้ร่วมกันทุก dialect → ดู [ADR-0003](adr/0003-drizzle-sqlite-postgres.md), [ADR-0009](adr/0009-postgres-and-next.md)
- **DB:** SQLite (libSQL: ไฟล์หรือ Turso) และ Postgres (postgres.js หรือ PGlite)
- **DB ร่วมกับแอปลูกค้า:** ใช้ DB เดียวกันเป็น default และทุกตารางมี prefix `ecms_` (เปลี่ยนได้) Migration ของ Easy CMS แตะเฉพาะตารางที่มี prefix
- **Migration:**
  - Dev: sync schema อัตโนมัติ (push)
  - Prod: ใช้ migration files ที่ commit ลง git (`easy-cms migrate:create`, `easy-cms migrate`, `migrate:status`)
  - ถ้าพบ schema drift บน prod → แจ้ง error และ **ไม่** push อัตโนมัติ
- **รูปแบบตาราง:** collection → `ecms_<slug>`, array และ hasMany → ตารางลูก `ecms_<slug>__<field>`, globals → JSON ใน `ecms_globals`, ID เป็น integer, ไม่ใช้ foreign key → ดู [ADR-0005](adr/0005-storage-layout.md)
- **Blocks:** เก็บเป็นคอลัมน์ JSON (เพิ่มชนิดบล็อกไม่ต้องเปลี่ยน schema) ค้นหาข้างในด้วย `json_each` / `jsonb_array_elements` → ดู [ADR-0016](adr/0016-blocks-and-localized-lists.md), [ADR-0017](adr/0017-durable-webhooks-block-queries-locale-moves.md)
- **Localization:** หนึ่งคอลัมน์ต่อภาษา (`<column>__<locale>`, ภาษาเริ่มต้นใช้ชื่อเดิม) และคอลัมน์ `_locale` ในตารางลูก where/sort/unique/index จึงใช้กลไกเดิมได้ → ดู [ADR-0014](adr/0014-localization.md)
- **ตารางภายในแบบ opt-in:** `document_versions`, `scheduled_jobs`, `webhook_deliveries`, `api_keys` ใช้กลไก collection/migration เดิม และถูกเพิ่มเฉพาะเมื่อเปิดฟีเจอร์
- **SQLite เขียนทีละรายการ:** คิวการเขียนต่อไฟล์ใน process เดียว และ busy timeout ข้าม process เพื่อไม่ให้ล้มด้วย `SQLITE_BUSY` (ADR-0017)
- **Migration files:** `easy-cms/migrations/<timestamp>_<name>.sql` + `.json` ตอน production ตรวจด้วย hash ของ schema
- **สำรองและย้ายข้อมูล:** `easy-cms backup` (SQLite `VACUUM INTO` ขณะที่ระบบทำงาน) และ `easy-cms copy --from <config>` ที่อ่านและเขียนตารางดิบผ่าน `Database.transfer` ของแต่ละ dialect ต้องมี hash ของ schema ตรงกัน ปลายทางว่าง และตั้ง sequence ของ Postgres ต่อให้

## 8. API

| ชั้น | ใช้เมื่อ | ตัวอย่าง |
|---|---|---|
| **Local API** | Server-side ใน Nuxt/Next | `await cms.find('posts', { locale: 'en' })` |
| **REST** | Client-side / ภายนอก / standalone | `GET /api/cms/posts?where[slug][equals]=hello` |
| **REST + API key** | สคริปต์ แอปอื่น | `Authorization: Bearer ecms_…` |
| **GraphQL** | frontend ที่ใช้ Apollo/urql/Relay | `POST /api/cms/graphql` (plugin-graphql) |
| **MCP** | ผู้ช่วย AI | `POST /api/cms/mcp` (plugin-mcp) |
| **Webhooks** | แจ้งบริการภายนอกเมื่อเนื้อหาเปลี่ยน | POST ที่ลงลายเซ็น `x-easy-cms-signature` |
| **Types** | ฝั่งหน้าเว็บ | `easy-cms generate:types` → `easy-cms-types.ts` |

Local API อนุมาน type จาก config ได้เองแม้ยังไม่ได้ generate
Endpoint ของ plugin อยู่ใต้ `routes.api` เดียวกัน รวมถึง GraphQL (0.43)

**Next.js:** config ถูก bundle แยกตาม server layer (route handler กับ RSC) จึงได้ object ต่างกัน `getEasyCMS()` เทียบ config ด้วยโครงสร้าง (`configSignature()`, นับ function เป็นค่าเดียวกัน) เพื่อให้ทั้ง server มี instance เดียว (0.16.1)

## 9. Auth และ Access Control

- **Users ในตัว:** collection `users` แยกจาก user ของแอปลูกค้า, login ด้วย email + password
- **Session:** cookie แบบ httpOnly, Secure, SameSite=Lax, ลงนามด้วย `EASY_CMS_SECRET`; DB เก็บแค่ SHA-256 ของ token ใน collection ภายใน `sessions`
- **Bearer token:** client ที่ไม่ใช่ browser ส่ง `Authorization: Bearer <token>` ได้ ทั้ง session token และ API key (`ecms_…`)
- **API keys:** เก็บ SHA-256 ของ secret, สิทธิ์ต่อ collection/global × `read, create, update, delete, publish`, ตรวจใน Local API (`keyAllows()`) คู่กับกฎสิทธิ์ของเจ้าของ เข้าถึง `users` และ `api-keys` ไม่ได้เสมอ key ผิดได้ 401
- **CSRF:** request ที่เขียนข้อมูลต้องมี `Origin` เป็นของเราเองหรืออยู่ใน `auth.trustedOrigins` และถ้าใช้ cookie ต้องส่ง header `x-csrf-token` (HMAC ของ session ที่ได้จาก `GET /users/me`)
- **CORS:** `cors` เปิดให้ origin อื่นเรียกแบบไม่มี cookie ส่วน `auth.trustedOrigins` ได้ credentials ด้วย
- **Preview token:** HMAC ที่ผูกกับเอกสารเดียว หมดอายุ 1 ชั่วโมง สำหรับ frontend ที่อยู่คนละ origin → ดู [ADR-0013](adr/0013-live-preview.md)
- **Password:** scrypt (N=2^17, r=8, p=1) เก็บค่า cost ไว้ใน hash
- **Rate limit:** นับ login ที่ผิดใน collection ภายใน `login-attempts` จึงนับรวมได้แม้มีหลาย instance
- **Hidden fields:** `hidden: true` เก็บใน DB แต่ไม่ถูกส่งออกทาง API และรับเป็น input ไม่ได้ (ใช้กับ `passwordHash`, `keyHash`)
- **Field access:** ถ้า field ใน array ถูกจำกัดสิทธิ์ `update` การแก้ array นั้นจะแทนทั้ง array ทำให้ค่าของ field นั้นหายไป (ข้อจำกัดที่ยังมีอยู่)
- **Access:** เขียนเป็นฟังก์ชันต่อ operation ต่อ collection (`read/create/update/delete`), มี helper `isAdmin`, `isLoggedIn`, `anyone`
- **Default:** ทุก operation **ปิด** สำหรับผู้ที่ไม่ได้ login จนกว่า developer จะเปิดเอง
- **ภายหลัง:** `auth.strategy` สำหรับเสียบ auth ภายนอก (OAuth/SSO)

## 10. Media

- **Storage adapter interface:** `put / get / delete / url? / init?` และ `uploadURL? / getStart?` สำหรับไฟล์ใหญ่ที่ browser ส่งตรงไปที่ storage → ดู [ADR-0044](adr/0044-direct-uploads.md)
- **Local disk** (default) และ **S3-compatible** (`@easy-cms/storage-s3`, AWS S3, Cloudflare R2, MinIO ผ่าน aws4fetch) สำหรับ Vercel/serverless → ดู [ADR-0010](adr/0010-s3-storage.md)
- ไฟล์เสิร์ฟผ่าน `<api>/media/file/<key>` พร้อม CSP `sandbox` และ `nosniff` เป็น default ส่วน S3 ตั้ง `publicUrl` ไปที่ CDN ได้
- **รูปภาพ:** `sharp` เป็น optional dependency สำหรับสร้าง thumbnail และ resize
- ตรวจ MIME type จากเนื้อหาไฟล์และขนาดไฟล์ตอนอัปโหลด → ดู [ADR-0008](adr/0008-media-drafts-hooks.md) รวมถึงเอกสาร Office/OpenDocument, zip, เสียงและวิดีโอ และกลุ่ม `documents`/`office`/`archives` → ดู [ADR-0042](adr/0042-media-types-and-previews.md)
- **โฟลเดอร์** (`upload.folders`): collection `media-folders` ซ้อนได้ ไฟล์อยู่ได้โฟลเดอร์เดียว ไม่เปลี่ยน key ของไฟล์ และกับ `auth.rbac` admin กำหนดระดับ ดู/แก้ไข/จัดการ ของแต่ละบทบาทต่อโฟลเดอร์ (สืบทอดลงไป จำกัดสิทธิ์ Media ให้แคบลงเท่านั้น) → ดู [ADR-0041](adr/0041-media-folders.md) โฟลเดอร์ส่วนตัวเก็บไฟล์ใน `upload.privateStorage` ชื่อไฟล์มี `.private` และเสิร์ฟผ่าน `<api>/media/private/<key>` ให้ผู้มีสิทธิ์หรือลิงก์ที่เซ็น → ดู [ADR-0043](adr/0043-private-files.md)

## 11. Content features

| ฟีเจอร์ | ตั้งแต่ | ADR |
|---|---|---|
| Collections, Globals, Draft / Publish, Lifecycle hooks | 0.1 | [0008](adr/0008-media-drafts-hooks.md) |
| Plugins แบบ `(config) => config` | 0.1 | [0018](adr/0018-plugin-endpoints-admin-components.md) |
| Admin UI ภาษา TH/EN | 0.1 | [0007](adr/0007-admin-ui.md) |
| Version history และฉบับร่างที่แยกจากฉบับที่เผยแพร่ | 0.3 | [0012](adr/0012-versions.md) |
| Live preview และ preview token | 0.4–0.5 | [0013](adr/0013-live-preview.md) |
| Localization ของ content | 0.5 | [0014](adr/0014-localization.md) |
| Blocks / page builder, localized array และ hasMany | 0.6 | [0016](adr/0016-blocks-and-localized-lists.md) |
| Webhooks และการตั้งเวลาเผยแพร่ | 0.6 | [0015](adr/0015-webhooks-and-scheduling.md) |
| Webhook ที่ไม่หาย, ค้นในบล็อก, เปลี่ยนภาษาเริ่มต้น | 0.7–0.9 | [0017](adr/0017-durable-webhooks-block-queries-locale-moves.md) |
| Admin redesign (ธีม, filter, bulk, มือถือ, drawer) | 0.11–0.12 | — |
| Plugin endpoints, admin components, SEO plugin | 0.13 | [0018](adr/0018-plugin-endpoints-admin-components.md) |
| API keys | 0.15 | [0019](adr/0019-api-keys-and-mcp.md) |
| MCP plugin | 0.16 | [0019](adr/0019-api-keys-and-mcp.md) |
| SEO: sitemap, robots.txt, noindex, hreflang, JSON-LD | 0.17 | [0020](adr/0020-seo-sitemap-robots-root-endpoints.md) |
| SEO สำหรับ AI: crawler ของ AI, llms.txt, Markdown, IndexNow | 0.18 | [0021](adr/0021-seo-for-ai.md) |
| Redirects plugin, กลุ่มตั้งค่าในเมนู | 0.19 | [0022](adr/0022-redirects-plugin.md) |
| อีเมลใน core และ form builder | 0.20 | [0023](adr/0023-email-and-form-builder.md) |
| หน้าย่อย (nested docs), `filterOptions`, `uniqueWithin`, tree list, `update({ live })`, คำสั่ง CLI จาก plugin | 0.21 | [0024](adr/0024-nested-docs.md) |

## 12. CLI และ DX

```bash
npx create-easy-cms            # ตรวจ Nuxt/Next อัตโนมัติ หรือสร้าง standalone ในโฟลเดอร์ว่าง
                               # npm, pnpm, yarn, bun: --pm หรือตรวจจาก packageManager/lockfile (0.22)
easy-cms create-admin          # สร้าง admin คนแรก
easy-cms generate:types
easy-cms migrate:create <name>
easy-cms migrate
easy-cms migrate:status
easy-cms serve [--watch]       # standalone
easy-cms run-scheduled         # งานตั้งเวลาและ webhook ที่ต้องส่งซ้ำ (สำหรับ cron)
easy-cms backup <file>         # สำรอง SQLite ขณะที่ระบบทำงาน
easy-cms copy --from <config>  # ย้ายข้อมูลข้ามฐานข้อมูล เช่น SQLite → Postgres
easy-cms <plugin command>      # คำสั่งจาก `commands` ใน config เช่น nested:rebuild (0.21)
```

## 13. Runtime และ Security

- **Runtime:** Node ≥ 22.12 (Node 20 EOL แล้วตั้งแต่ 2026-04) บน Linux, macOS, Windows, Bun แบบ best-effort, **ไม่รองรับ Edge**
- **Security baseline:**
  - ป้องกัน CSRF สำหรับ Admin/REST/endpoint ของ plugin ที่ใช้ cookie auth
  - Rate limit ตอน login
  - Secret อ่านจาก env เท่านั้น (`EASY_CMS_SECRET`), ถ้าไม่มีต้อง fail ตั้งแต่ตอน start
  - ตรวจ MIME/ขนาดไฟล์อัปโหลด
  - Token ที่ออกให้ภายนอก (API key, preview token, `cronSecret`) จำกัดขอบเขตและเทียบแบบเวลาคงที่
  - Webhook ลงลายเซ็น HMAC, MCP ไม่ดาวน์โหลด URL (กัน SSRF)
  - Admin module ของ plugin โหลดจาก origin เดียวกันเท่านั้น (CSP `script-src 'self'`)

## 14. Testing

| ชั้น | เครื่องมือ | ขอบเขต |
|---|---|---|
| Unit | Vitest | config, validation, access, hooks, plugin, CLI |
| Integration | Vitest (`packages/integration`) | Local API / REST ชุดเดียวบน SQLite, PGlite และ Postgres 17 |
| Plugin | Vitest | `plugin-seo`, `plugin-mcp` (ใช้ MCP client จริง) |
| E2E | Playwright | หน้า Admin บน `examples/nuxt-blog` (dev), `examples/next-blog` (production build) และ `examples/standalone` ทุก PR |
| Docs | node:test | หน้า API Reference เทียบกับ type ของ core และคำสั่งของ CLI |

CI รัน lint, typecheck, build และ test บน Linux, macOS และ Windows

## 15. Roadmap

### 15.1 v0.1 (เสร็จแล้ว)

| Milestone | เนื้อหา |
|---|---|
| **M0** Foundation | monorepo, CI, `defineConfig`, types ของ config |
| **M1** Core + DB | สร้าง Drizzle schema จาก config, Local API (CRUD), migration, SQLite |
| **M2** Auth + Access + REST | users, session, scrypt, access functions, REST handler, CSRF |
| **M3** Nuxt adapter | Nuxt module + `examples/nuxt-blog` |
| **M4** Admin UI | login, list/edit ของ collection, globals, field components, Tiptap, i18n TH/EN |
| **M5** Upload + Drafts + Hooks | local storage, draft/publish, lifecycle hooks |
| **M6** Next adapter + Postgres | `@easy-cms/next`, `examples/next-blog`, Postgres driver |
| **M7** CLI + Docs + Release | `create-easy-cms`, `generate:types`, VitePress, publish v0.1 |

### 15.2 หลัง v0.1 (เสร็จแล้ว)
0.2 standalone + S3 → 0.3 versions → 0.4–0.5 live preview, localization → 0.6–0.9 blocks, webhooks, การตั้งเวลา → 0.10 backup → 0.11–0.12 admin redesign → 0.13 plugin ecosystem + SEO → 0.14 copy → 0.15 API keys → 0.16 MCP → 0.17 SEO ระดับทั้งเว็บ → 0.18 SEO สำหรับ AI → 0.19 redirects → 0.20 อีเมลและฟอร์ม → 0.21 หน้าย่อย → 0.22 npm, pnpm, Yarn และ Bun → 0.23 แกลเลอรี (upload หลายไฟล์) → 0.24 ลืมรหัสผ่านและคำเชิญ → 0.25 type ของ plugin → 0.26 ชนิด field เพิ่มเติม (`color`) → 0.27 หน้าของ plugin และกล่องบนแดชบอร์ด → 0.28 อัปโหลดจากลิงก์ → 0.29 แดชบอร์ดสำหรับ admin (ต้องดูแล, ระบบ) → 0.30 หน้าการส่ง (webhook และอีเมลที่ล้ม) → 0.31 ตั้งค่า → อีเมล (ดูค่าและทดสอบ) → 0.32 Backups จากหน้า admin → 0.33 บทบาทและสิทธิ์จากหน้า admin (RBAC) → 0.34 เฉพาะเอกสารของตัวเองและสิทธิ์ระดับ field → 0.35 Single sign-on → 0.36 Audit log → 0.37 Deploy ด้วยคลิกเดียว (รายละเอียดใน [SRS §8.2](SRS.md#82-releases-หลัง-v01))

### 15.3 ถึง 1.0 และหลังจากนั้น
แผนถึง 1.0 (2026-12-15) และแนวคิดหลัง 1.0 อยู่ใน [ROADMAP.md](ROADMAP.md)

## 16. ความเสี่ยง

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| ทำคนเดียวแต่ต้องดูแล 2 framework + standalone | งานล่าช้า, adapter หนึ่งตัวไม่เสถียร | adapter ต้องบางที่สุด, E2E ชุดเดียวครอบทั้งสามแอป |
| Next.js / Nuxt เปลี่ยน API หรือวิธี bundle บ่อย | Adapter พัง (เช่น config หลายสำเนาข้าม server layer) | Core ไม่ขึ้นกับ framework, ปักเวอร์ชันใน peerDependencies, E2E บน production build ของ Next |
| ช่องโหว่ security กระทบแอปลูกค้า | ความเชื่อมั่นเสียหาย | ปิดทุก operation เป็น default, มี security baseline, มี `SECURITY.md` |
| ผู้ช่วย AI หรือสคริปต์ทำเกินสิทธิ์ | เนื้อหาถูกเผยแพร่หรือลบโดยไม่ตั้งใจ | API key สิทธิ์น้อยที่สุด, MCP บันทึกเป็นฉบับร่างเสมอ, versions ย้อนกลับได้ |
| Plugin จากคนนอกทำงานด้วยสิทธิ์ของผู้ใช้ในหน้า Admin | โค้ดที่ไม่น่าเชื่อถือเข้าถึงข้อมูลได้ | ถือเป็น dependency ที่ต้องเชื่อถือ, โหลดจาก origin เดียวกัน, สัญญามี `apiVersion` |
| ฟีเจอร์ opt-in เยอะขึ้นทำให้ schema และ migration ซับซ้อน | อัปเกรดยาก | ตารางภายในเพิ่มเฉพาะเมื่อเปิดใช้, migration มีแค่ส่วนเพิ่ม, เอกสาร Backups & upgrades |
| Payload เพิ่มการรองรับ Vue | จุดต่างหายไป | เน้นประสบการณ์ที่เรียบง่าย DX ของ Nuxt และภาษาไทย |

## 17. ADRs

- [ADR-0001](adr/0001-embedded-web-standard-core.md) — Embedded + Web-standard core + adapters
- [ADR-0002](adr/0002-prebuilt-vue-admin-spa.md) — Admin UI เป็น Vue SPA ที่ build มาพร้อม package
- [ADR-0003](adr/0003-drizzle-sqlite-postgres.md) — Drizzle + SQLite/Postgres
- [ADR-0004](adr/0004-code-first-content-model.md) — Content model แบบ code-first
- [ADR-0005](adr/0005-storage-layout.md) — รูปแบบการเก็บข้อมูลและ migration
- [ADR-0006](adr/0006-nuxt-adapter.md) — โครงสร้างของ Nuxt adapter
- [ADR-0007](adr/0007-admin-ui.md) — โครงสร้างของหน้า Admin
- [ADR-0008](adr/0008-media-drafts-hooks.md) — Media, drafts และ hooks
- [ADR-0009](adr/0009-postgres-and-next.md) — Postgres adapter, shared Drizzle layer และ Next.js adapter
- [ADR-0010](adr/0010-s3-storage.md) — S3-compatible storage (`@easy-cms/storage-s3`)
- [ADR-0011](adr/0011-standalone-mode.md) — Standalone mode (`easy-cms serve`) และ CORS
- [ADR-0012](adr/0012-versions.md) — Version history และการแยกฉบับร่างออกจากเวอร์ชันที่เผยแพร่
- [ADR-0013](adr/0013-live-preview.md) — Live preview
- [ADR-0014](adr/0014-localization.md) — Localization (เนื้อหาหลายภาษา)
- [ADR-0015](adr/0015-webhooks-and-scheduling.md) — Webhooks และการตั้งเวลาเผยแพร่
- [ADR-0016](adr/0016-blocks-and-localized-lists.md) — Blocks field และ localized array / hasMany
- [ADR-0017](adr/0017-durable-webhooks-block-queries-locale-moves.md) — Webhook ที่ไม่หาย, ค้นหาข้างในบล็อก และย้ายข้อมูลเมื่อเปลี่ยนภาษาเริ่มต้น
- [ADR-0018](adr/0018-plugin-endpoints-admin-components.md) — Endpoint ของ plugin, admin components และ plugin SEO
- [ADR-0019](adr/0019-api-keys-and-mcp.md) — API keys และ plugin MCP
- [ADR-0020](adr/0020-seo-sitemap-robots-root-endpoints.md) — Sitemap, robots.txt, hreflang และ JSON-LD ใน plugin SEO และ root endpoints
- [ADR-0021](adr/0021-seo-for-ai.md) — SEO สำหรับ AI: crawler ของ AI, llms.txt, Markdown และ IndexNow
- [ADR-0022](adr/0022-redirects-plugin.md) — Plugin redirects และกลุ่มตั้งค่าในเมนู
- [ADR-0023](adr/0023-email-and-form-builder.md) — ระบบอีเมลใน core และ plugin form builder
- [ADR-0024](adr/0024-nested-docs.md) — หน้าย่อย (plugin nested docs) และความสามารถของ core ที่รองรับ
- [ADR-0025](adr/0025-package-managers.md) — รองรับ npm, pnpm, Yarn และ Bun
- [ADR-0026](adr/0026-upload-has-many.md) — upload หลายไฟล์ (`hasMany`) และการจำกัดชนิดไฟล์
- [ADR-0027](adr/0027-password-links.md) — ลืมรหัสผ่านและคำเชิญทางอีเมล
- [ADR-0028](adr/0028-typed-plugins.md) — type ของสิ่งที่ plugin เพิ่ม (`definePlugin`)
- [ADR-0029](adr/0029-custom-field-types.md) — ชนิด field ที่แพ็กเกจเพิ่มได้ (`fieldTypes`)
- [ADR-0030](adr/0030-plugin-pages-and-dashboard.md) — หน้าของ plugin และกล่องบนแดชบอร์ด
- [ADR-0031](adr/0031-upload-from-url.md) — อัปโหลดจากลิงก์ (`upload.fromURL`) และการกัน SSRF
- [ADR-0032](adr/0032-admin-status.md) — แดชบอร์ดสำหรับ admin: ต้องดูแล และระบบ
- [ADR-0033](adr/0033-admin-deliveries.md) — หน้า "การส่ง": webhook และอีเมลที่ล้ม
- [ADR-0034](adr/0034-admin-email-settings.md) — หน้า ตั้งค่า → อีเมล: ดูค่าและทดสอบ
- [ADR-0035](adr/0035-backups.md) — Backups จากหน้า admin
- [ADR-0036](adr/0036-roles-from-the-admin.md) — บทบาทและสิทธิ์จากหน้า admin (RBAC)
- [ADR-0037](adr/0037-own-documents-and-field-permissions.md) — เฉพาะเอกสารของตัวเอง และสิทธิ์ระดับ field
- [ADR-0038](adr/0038-single-sign-on.md) — Single sign-on สำหรับหน้า admin
- [ADR-0039](adr/0039-audit-log.md) — Audit log
- [ADR-0040](adr/0040-one-click-deploy.md) — Deploy ด้วยคลิกเดียว (Vercel และ Netlify)
- [ADR-0041](adr/0041-media-folders.md) — โฟลเดอร์ในคลังสื่อและสิทธิ์ต่อโฟลเดอร์
- [ADR-0042](adr/0042-media-types-and-previews.md) — อัปโหลดหลายไฟล์ ชนิดไฟล์ และตัวอย่างในคลังสื่อ
- [ADR-0043](adr/0043-private-files.md) — ไฟล์ส่วนตัว key ของโฟลเดอร์ และ API key ตามโฟลเดอร์
- [ADR-0044](adr/0044-direct-uploads.md) — อัปโหลดไฟล์ใหญ่ตรงไปที่ storage และจำกัดการย้ายไฟล์
- [ADR-0045](adr/0045-framework-kit.md) — ชุดเครื่องมือกลางสำหรับ framework
- [ADR-0046](adr/0046-graphql-plugin.md) — GraphQL เป็น plugin
- [ADR-0047](adr/0047-multi-tenant.md) — Multi-tenant เป็น plugin บนจุดต่อใน core
- [ADR-0048](adr/0048-multi-tenant-follow-ups.md) — Multi-tenant ครบขึ้น: ไฟล์ โฟลเดอร์ plugin อื่น audit และการลบ
- [ADR-0049](adr/0049-ecommerce.md) — ร้านค้า (ecommerce) เป็น plugin พร้อมจุดต่อกลางใน core
- [ADR-0050](adr/0050-admin-navigation-and-layouts.md) — เมนูเป็นกลุ่ม, command palette และ layout ของหน้าแก้ไข
