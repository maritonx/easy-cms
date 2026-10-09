# Easy CMS — ทบทวน public API ก่อนล็อกใน 0.60

- **Issue:** [#74](https://github.com/maritonx/easy-cms/issues/74) (milestone `0.60 · API freeze`)
- **วันที่:** 2026-10-09 · **เวอร์ชันที่ทบทวน:** 0.48.0
- **วิธี:** อ่านโค้ดและเอกสาร แบ่ง 4 ส่วน: core และ Local API, config และ field, REST และ GraphQL, plugin/adapter/admin
- **สถานะ:** ตัดสินใจแล้ว (ดู [ข้อ 7](#decisions)) กำลังทำใน 0.60

ระดับ: **B** = breaking สำหรับผู้ใช้ (ต้องแก้ config/โค้ด), **A** = เพิ่มเข้าไปได้โดยไม่ breaking, **D** = เอกสารเท่านั้น

---

## 1. ขอบเขต public กับภายใน

| # | เรื่อง | ระดับ | ที่ |
|---|---|---|---|
| I1 | export จาก `@easy-cms/core` ราว 45 ตัวที่ไม่มีใครนอก core ใช้ (`hashPassword`, `SESSION_COOKIE`, `applyDefaults`, `validateConfig`, `populate`, `sniffMimeType`, …) | B (ไม่มีผู้ใช้ที่รู้จัก) | `core/src/index.ts` |
| I2 | helper ที่ใช้แค่แพ็กเกจพี่น้อง (`applyPlugins`, `importConfig`, `createRootEndpointHandler`, `parseId`, `formToken`, `keyAllows`, `INTERNAL_COLLECTIONS`, …) ควรย้ายไป `@easy-cms/core/internal` ที่อยู่นอก semver | B | `core/src/index.ts` |
| I3 | สมาชิกของ `cms` ที่ติด `@internal` แต่ยังเป็น public (`applyOnRequest`, `retryDelivery`, `collection()`, `keyedFolder`), constructor ที่มี 6 พารามิเตอร์ และ method ภายในของ `cms.roles`, `cms.folders`, `cms.audit`, `cms.auth`, `cms.auth.sso` | B (ต่ำ) | `core/src/local-api.ts` |
| I4 | `cms.db` และ `cms.config` ใหญ่เกินกว่าจะล็อกทั้งก้อน: ระบุว่าส่วนไหนอยู่ใน semver หรือเปลี่ยนชื่อเป็น `unsafeDb` | B/D | `local-api.ts:262` |
| I5 | `@easy-cms/drizzle` และ `sqliteDialect`, `postgresDialect`, `nativeBinaries()` หลุดเป็น public | B/D | `drizzle`, `db-*` |
| I6 | ยังไม่มี entry ที่ใช้ในเบราว์เซอร์ได้สำหรับคนเขียน plugin (`@easy-cms/core/plugin`): seo ต้องเขียน `definePlugin` ซ้ำเอง | A | `plugin-seo/src/plugin.ts:138` |
| I7 | สัญญาของ element ฝั่ง admin (`ElementContext`, `API_VERSION`, event) ไม่มี type ที่ export: plugin ต้องคัดลอกเอง | A | `admin/app/src/lib/plugins.ts` |
| I8 | slug constant ไม่สม่ำเสมอ (`MEDIA` export แต่ `USERS` ไม่ export, `API_KEYS` อ่านเหมือนรายการ key) | B (ต่ำ) | `builtins.ts` |

## 2. ชื่อและรูปแบบ

| # | เรื่อง | ระดับ | ที่ |
|---|---|---|---|
| N1 | ตัวย่อ: `URL`/`ID` เป็นตัวใหญ่ แต่ `siteUrl`, `publicUrl`, `createApiHandler`, `forwardedClientIp`, `AdminSso` ไม่ใช่ | B | หลายที่ |
| N2 | `auth.allowSignUp` (SSO) กับ `auth.members.signup` (สมาชิก): ชื่อและตัวพิมพ์ต่างกัน และไม่บอกว่าเป็นของ provider | B | `config.ts:496, 558` |
| N3 | `keep`: ใน `audit` นับเป็นวัน แต่ใน `backups` นับเป็นจำนวนไฟล์; `versions.max` ก็คือจำนวน; `backups.every` เป็น `'day'|'week'` แต่ `jobs[].every` เป็นวินาที | B | `audit.ts:12`, `config.ts:90, 736, 740` |
| N4 | operator ของ `admin.condition` (`notEquals`) ไม่ตรงกับ `where` (`not_equals`) | B | `conditions.ts:18` |
| N5 | `commands` บนสุด (CLI) กับ `admin.commands` (⌘K) | B | `config.ts:394, 797` |
| N6 | ลิงก์ใน admin: `to`, `href`, `path` | B | `config.ts:157, 329, 341` |
| N7 | option ที่เป็นเรื่องหน้าตาวางทั้งบนสุดและใน `admin` (`icon`, `editIn`, field `position` อยู่บนสุด; `group`, `badge`, `width` อยู่ใน `admin`) | B | `config.ts:187-198`, `fields.ts:114` |
| N8 | `defaultValue` กับ `admin.defaultValue` ชื่อเดียวกันแต่คนละความหมาย | B | `fields.ts:57, 103` |
| N9 | hook: `originalDoc` กับ `previousDoc`; global ไม่มี `beforeValidate` | B | `config.ts:37-45` |
| N10 | `scope` ของ global รับ `({ context, user })` แต่ของ audit รับ `(context)` | B | `audit.ts:23` |
| N11 | เปิดฟีเจอร์ 5 แบบ (`true`, `{}`, `null`, มี object = เปิด, เปิดเสมอ) | B (เฉพาะ `null`) | หลายที่ |
| N12 | เมนู: `admin.menu`, `nav[].order`, `admin.group`; type ของ group ไม่ตรงกัน และซ่อน collection จากเมนูไม่ได้ | A/B | `config.ts:138, 352, 385` |
| N13 | Local API: `unpublishGlobal`/`scheduleGlobal` กับ `findGlobalVersions`; `scheduled()` เป็นคำคุณศัพท์ | B | `local-api.ts:2043, 2071` |
| N14 | "jobs" มี 3 ความหมาย (`ScheduledJob`, config `jobs`, `runJobs`) และรูปที่คืนจาก `runJobs` | B | `local-api.ts:1865` |
| N15 | `isLoggedIn` (ไม่รวมสมาชิก) กับ `isSignedIn` (รวมสมาชิก) เป็นคำพ้องกัน; `isAdmin` เป็น Access แต่ `isSystemAdmin` เป็น predicate | B | `access.ts:29, 98-101` |
| N16 | CLI: `migrate:create`/`generate:types` กับ `create-admin`/`run-scheduled` | B (มี alias) | `cli/src/index.ts` |
| N17 | ชื่อ option ของ plugin: `XxxPluginOptions` กับ `XxxOptions`; `slug`/`slugs`/`tenantsSlug`; `fields` 4 ความหมาย; `exclude` กับ `collections` | B | plugin ทุกตัว |
| N18 | หน่วยเวลา: ms (`cacheTTL`, `minSubmitTime`, `busyTimeout`), วินาที, วัน | B | plugin และ adapter |
| N19 | ชื่อ factory ของ adapter: `sqlite()`/`smtp()` กับ `s3Storage()`; `localStorage()` ชนกับ global ของเบราว์เซอร์ | B (มี alias) | adapter |
| N20 | ชื่องาน `shop:clean-up` (`:`) กับ event `order.paid` (`.`) | B (ต่ำ) | `validate-config.ts:1374, 1392` |
| N21 | `fallback-locale` และ `easy-cms-preview` เป็น kebab-case แต่ param อื่นเป็น camelCase | B (มี alias) | `handler.ts:1084` |

## 3. HTTP

| # | เรื่อง | ระดับ | ที่ |
|---|---|---|---|
| H1 | global แก้ด้วย `POST` แต่ collection ใช้ `PATCH` | A (alias) | `handler.ts:768` |
| H2 | route ของ auth อยู่ทั้ง `/users/*` (ปนกับ id ของเอกสาร ทำให้เปลี่ยนเป็น UUID ไม่ได้) และ `/auth/*` | B (alias) | `handler.ts:321-449, 1406` |
| H3 | error ไม่มี `code` ที่โปรแกรมอ่านได้; ส่วนรหัสของ GraphQL ไม่ตรงกับเอกสาร (`BAD_REQUEST` กับ `BAD_USER_INPUT`) | A | `handler.ts:1503`, `plugin-graphql/src/http.ts` |
| H4 | status code: session ได้ 200 บ้าง 201 บ้าง, รูป body ของ DELETE 3 แบบ, 429 ไม่มี `Retry-After`, action ที่ไม่รู้จักใน shop ได้ 403 | B (ต่ำ) | `handler.ts` |
| H5 | `/admin/*` มีทั้งของที่หน้า admin ใช้ภายใน (`schema`, `counts`, `search`, `modules`, …) และของที่เปิดให้ใช้ (`audit`, `roles`, `backups`, …) | B (เฉพาะหน้า admin) | `handler.ts:530-748` |
| H6 | endpoint ของ plugin บัง route ของ core ได้ และ method ไม่ตรงก็ตอบ 405 แทนที่จะผ่านไปให้ core | B | `handler.ts:185, 272` |
| H7 | path ที่สงวนไว้ไม่ตรงกัน 3 ที่ | A/D | `validate-config.ts:1333` |
| H8 | list ของ `/admin/audit`, `/admin/deliveries`, `/admin/roles` ไม่ใช้รูป `PaginatedDocs` | B (เฉพาะ admin) | `handler.ts:573, 636` |
| H9 | ไม่มีวิธีที่บอกไว้ในเอกสารสำหรับรับ token ไปใช้กับ `Bearer` | D/A | `rest-api.md` |
| H10 | ตะกร้าของร้านค้าเป็นแบบ RPC และ body ที่คืนไม่สม่ำเสมอ | B | `plugin-ecommerce/src/plugin.ts:449-540` |
| H11 | GraphQL: operator เป็น `not_equals` แต่ `AND`/`OR` เป็นตัวใหญ่ | B ถ้าเปลี่ยน | `plugin-graphql/src/schema.ts` |
| H12 | `select` ยังไม่มี: ตัดสินใจว่าเข้า 1.0 หรือไม่ | A | `query.ts:83` |

## 4. Adapter และ plugin contract

| # | เรื่อง | ระดับ | ที่ |
|---|---|---|---|
| P1 | adapter (database, storage, email, provider) ไม่มี `apiVersion` หรือ capability | A | `database.ts:136` ฯลฯ |
| P2 | สัญญา plugin ฝั่ง server (#75): ใส่ใน `PluginInfo`, ตรวจตอน `applyPlugins` และอ่านจาก property ไม่ต้องพึ่ง `definePlugin` | A | `config.ts:684` |
| P3 | คำสั่ง CLI ของ plugin รับ flag ไม่ได้ | A | `cli/src/index.ts:236` |
| P4 | `onRequest` เป็นฟังก์ชันเดียว plugin ต้องต่อกันเอง | A | `config.ts:593` |
| P5 | widget ของ dashboard ใช้ชื่อ tag เป็น id ของสิทธิ์ | A | `roles.ts:148` |
| P6 | tag ของ element บังคับให้ขึ้นต้น `ecms-` | A | `validate-config.ts:1295` |
| P7 | adapter ของ Next และ Nuxt ไม่สมมาตร (`getEasyCMS` กับ `useEasyCMS`, ตัวเลือกที่ส่งต่อได้ไม่เท่ากัน) | A | `next`, `nuxt` |
| P8 | `FieldTypeDefinition.admin` ไม่รับ `AdminComponent` | A | `field-types.ts:43` |
| P9 | option ที่มีไว้สำหรับ test หลุดเป็น public (`FormBuilderOptions.fetch`) และ slug ส่งเป็นพารามิเตอร์ตามตำแหน่ง | B (ต่ำ) | form-builder, multi-tenant |

## 5. พฤติกรรมที่จะเปลี่ยนยากหลัง 1.0

| # | เรื่อง | ระดับ | ที่ |
|---|---|---|---|
| X1 | webhook ส่งทุก collection รวม `users` เป็นค่าเริ่มต้น | B | `webhooks.ts:282` |
| X2 | access ของ field ไม่มี `create` | A | `access.ts:87` |
| X3 | validator ไม่เตือนเมื่อพิมพ์ชื่อ key ผิด | A (เป็นคำเตือน) | `validate-config.ts` |
| X4 | `increment` คืน `null` ทั้งตอนไม่พบเอกสารและตอนเกินขอบเขต | B | `local-api.ts:1009` |
| X5 | `ConfigError` ไม่ได้ extends `EasyCMSError`; error ไม่มี `code` | A | `errors.ts:9` |
| X6 | รูปผลลัพธ์แบบแบ่งหน้าไม่ตรงกัน (`AuditPage`, deliveries) | B (ต่ำ) | `audit.ts:80` |

## 6. เอกสารไม่ตรงกับโค้ด (แก้ได้เลย)

- `rest-api.md`: endpoint ที่ไม่มีในเอกสาร (forgot/reset password, password-link, transferTo, private media, direct uploads, api-keys), รูปของ `/users/init`, PUT ที่ไม่มีจริง, ตาราง status
- `local-api.md`: `count`/`update` รับ `where`, `documentPermissions` มี `context`, `destroy` flush email, `startScheduler`, `cms.folders`, ค่าเริ่มต้น `limit` ของ `findVersions`
- `config.md`/`fields.md`: `UploadField` (`folder`, `folderOnly`, `filterOptions`), `admin` ของ global, `context` ใน hook, `uniqueWithin` เป็น `string[]` ได้, JSDoc ของ `localized`
- `plugins.md`: `context`/`ip`/`text()`, `onRequest`, `jobs`, `events`, `admin.nav`, ตาราง plugin ทางการ, path ที่สงวนไว้
- `graphql.md`: รายการรหัส error ครบ
- test ของเอกสาร (`website/test/api-surface.ts`, `reference.test.ts`) ตรวจไม่ครบ: เพิ่ม interface ที่ขาดและตรวจย้อนกลับ

## 7. ตัดสินใจ {#decisions}

**หลักการ**
- **เปลี่ยนชื่อ:** config และ Local API ตัดขาดใน 0.60 (validator บอกชื่อใหม่); HTTP route มี alias ตลอด 1.x
- **public กับภายใน:** ลบ export ที่ไม่มีใครใช้; helper ของแพ็กเกจพี่น้องอยู่ที่ `@easy-cms/core/internal` นอก semver;
  สมาชิกภายในของ `cms` ติด `@internal` และซ่อนจาก type; `cms.db` ไม่ล็อกรูปร่าง; `@easy-cms/drizzle` และ dialect เป็นของภายใน
- **error:** `code` ใน `EasyCMSError` และ REST ชุดเดียวกับ GraphQL (`BAD_USER_INPUT`); `ConfigError` อยู่ในลำดับชั้นเดียวกัน; 429 มี `Retry-After`
- **ชื่อ:** เฉพาะ `URL` และ `ID` เป็นตัวใหญ่; เวลาเป็นวินาที หน่วยอื่นใส่ในชื่อ; operator ของ condition เหมือน `where`;
  CLI เป็น `noun:verb`; option ของ plugin เป็น `XxxPluginOptions`, `slugs`, `collections`, `fields` ความหมายเดียว
- **หน้าตา:** สิ่งที่เป็นหน้าตาอย่างเดียวอยู่ใน `admin`: ย้าย `icon`, `editIn`, `position`
- **HTTP:** global รับ `PATCH`; auth อยู่ที่ `/auth/*` (alias `/users/*`); ของภายในของหน้า admin อยู่ที่ `/admin/ui/*` นอก semver;
  method ไม่ตรงผ่านไปให้ core; slug ชน path ของ plugin เป็น error ตอนเริ่ม; ล็อกรายการ path ที่สงวนไว้

**รายข้อ**
- **config:** `auth.providerSignUp`, `auth.members.signUp`, `audit.keepDays`, `versions.keep`, `backups.frequency: 'daily'|'weekly'`,
  `cliCommands`, ลิงก์ใช้ `href`, `admin.initialValue`, `previousDoc` ทุก hook + `beforeValidate` ของ global,
  `audit.scope({ context, user })`, `false|true|{…}` ไม่รับ `null`, `admin.order` แทน `admin.menu`, `admin.group: false`
- **Local API:** `findSchedule`, `findGlobalSchedule`, `ScheduledPublish`, `upcomingSchedules`, `runJobs()` คืน
  `{ scheduled, jobs, webhooks, emails }`, `isStaff` แทน `isLoggedIn`, `isAdmin` ไม่นับ admin ระดับ tenant,
  `increment` throw `NotFoundError` เมื่อไม่พบเอกสาร
- **พฤติกรรม:** webhook ไม่ส่ง `users` ถ้าไม่ระบุ; access ของ field มี `create`; เตือน key ที่ไม่รู้จัก; session ตอบ 200;
  DELETE ของ action คืน `{ deleted }`; action ที่ไม่รู้จักตอบ 404; list ของ admin เป็น `PaginatedDocs`; server ใช้ API key;
  ตะกร้าคืน `{ cart }`; GraphQL คงเดิม; `select` หลัง 1.0
- **plugin และ adapter:** `@easy-cms/core/plugin`; `apiVersion?: 1` และ `capabilities` ของ database; `flags` ของคำสั่ง plugin;
  `onRequest` เป็น array ได้; `id` ของ widget; tag ไม่บังคับ `ecms-`; Next/Nuxt ส่ง `ApiHandlerOptions`;
  `FieldTypeDefinition.admin` รับ `AdminComponent`; ถอด `fetch` ของ form-builder; `admin:create`, `jobs:run`; `diskStorage()`

**ลำดับ:** 6 commit (ขอบเขต → error/HTTP response → config → Local API/access → route → plugin/adapter + #75)
แล้วเอกสาร คู่มืออัปเกรด และ changeset ออกเป็น 0.60.0 ครั้งเดียว
