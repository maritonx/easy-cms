# อ้างอิง config {#config-reference}

ตัวเลือกทั้งหมดของ `easy-cms.config.ts` แบ่งตามตำแหน่งที่ใส่ คำอธิบายและตัวอย่างดูได้จากลิงก์ไปยังคู่มือ
มีเทสต์ตรวจหน้านี้กับ type ใน `@easy-cms/core` ทุกตัวเลือกจึงอยู่ในหน้านี้ครบ

```ts
import { defineConfig } from '@easy-cms/core'

export default defineConfig({ secret, db, collections, /* … */ })
```

<!-- api: Config -->
## ระดับบนสุด {#top-level}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `secret` | `string` | — | **จำเป็น** อย่างน้อย 32 ตัวอักษร ใช้เซ็น session และ preview token |
| `db` | `DatabaseAdapter` | — | **จำเป็น** `sqlite()` หรือ `postgres()` [ฐานข้อมูล](/th/guide/databases) |
| `serverURL` | `string` | — | origin สาธารณะ (`https://example.com`) ทำให้ URL ของ media เป็น URL เต็ม |
| `cors` | `string[] \| '*'` | `[]` | origin ที่โค้ดใน browser เรียก API ได้ [ความปลอดภัย](/th/guide/security) |
| `cronSecret` | `string` | `CRON_SECRET` | secret แบบ Bearer สำหรับ `GET <api>/jobs/run` [การตั้งเวลา](/th/guide/drafts#scheduled-publishing) |
| `webhooks` | `WebhookConfig[]` | `[]` | ดู [webhooks](#webhooks) |
| `events` | `string[]` | `[]` | event ของแอปหรือ plugin นอกจากการแก้เนื้อหา (`<area>.<what>` เช่น `order.paid`) ส่งด้วย `cms.emit()` ไปยัง webhook ที่ระบุไว้ [Webhooks](/th/guide/webhooks#your-own-events) |
| `jobs` | `JobConfig[]` | `[]` | งานที่รันพร้อมงานตั้งเวลา เช่นงานเก็บกวาดของ plugin ดู [jobs](#jobs) |
| `localization` | `LocalizationConfig` | — | ดู [localization](#localization) |
| `routes` | `RoutesConfig` | | ดู [routes](#routes) |
| `admin` | `AdminConfig` | | ดู [admin](#admin) |
| `upload` | `UploadConfig` | | ดู [upload](#upload) |
| `auth` | `AuthConfig` | | ดู [auth](#auth) |
| `collections` | `CollectionConfig[]` | `[]` | ดู [collections](#collections) |
| `globals` | `GlobalConfig[]` | `[]` | ดู [globals](#globals) |
| `endpoints` | `Endpoint[]` | `[]` | ดู [endpoints](#endpoints) |
| `commands` | `CliCommand[]` | `[]` | คำสั่ง `easy-cms <name>` เช่นจาก plugin: `{ name, description, help?, run({ cms, args, log }) }` [CLI](/th/guide/cli#commands-from-plugins) |
| `onRequest` | `({ headers, url, user, cms }) => { context?, user? }` | — | ทำงานทุก request ของ API เมื่อรู้ผู้ใช้แล้ว: คืน `context` ของ request (เช่น tenant) และเปลี่ยนผู้ใช้ได้ (บทบาทใน tenant นั้น, `scoped`) ปกติ plugin เป็นผู้ตั้ง [Multi-tenant](/th/guide/multi-tenant#how-it-works) |
| `apiKeys` | `boolean` | `false` | API key ใต้ตั้งค่า สำหรับสคริปต์และแอปอื่น [API keys](/th/guide/api-keys) |
| `email` | `EmailAdapter` | — | ส่งอีเมลให้ plugin เช่น `smtp()` หรือ `consoleEmail()` [อีเมล](/th/guide/email) |
| `backups` | `BackupsConfig` | กดทำเองเท่านั้น | backup ฐานข้อมูลตามรอบ ดู [backups](#backups) |
| `audit` | `boolean \| AuditConfig` | ปิด | audit log: ใครแก้อะไร การเข้าสู่ระบบ การจัดการระบบ ดู [audit](#audit) |
| `plugins` | `Plugin[]` | `[]` | `(config) => config` ทำงานตามลำดับก่อนตรวจ config `definePlugin(fn, { name, version })` ตั้งชื่อให้แสดงบนแดชบอร์ด [Plugins](/th/guide/plugins) |
| `fieldTypes` | `FieldTypeDefinition[]` | `[]` | ชนิด field จากแพ็กเกจ เช่น `color` จาก `@easy-cms/fields` [ชนิด field เพิ่มเติม](/th/guide/field-types) |

<!-- api: RoutesConfig -->
## routes {#routes}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `api` | `string` | `/api/cms` | ตำแหน่งของ REST API |

<!-- api: AdminConfig -->
## admin {#admin}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `path` | `string` | `/admin` | ตำแหน่งของหน้า admin |
| `locale` | `'en' \| 'th'` | `en` | ภาษาเริ่มต้นของหน้า admin ก่อนผู้ใช้เลือกเอง |
| `brand` | `AdminBrand` | `{}` | ดู [brand](#brand) |
| `siteUrl` | `string` | `/` (Nuxt, Next.js) | เว็บสาธารณะสำหรับปุ่ม "ดูเว็บไซต์": path หรือ URL แบบ `http(s)` |
| `menu` | `string[]` | ตามลำดับใน config | slug ของ collection ตามลำดับในกลุ่มของเมนู ที่ไม่ระบุจะตามมา |
| `nav` | `NavGroup[]` | — | กลุ่มของเมนู: `{ id, label, icon?, order?, children? }` children ลึกได้หนึ่งชั้น มีในตัว: `content`, `settings` (`site`, `people`, `system`) [ระบบจัดการ](/th/guide/admin#the-menu) |
| `commands` | `{ label, to, icon?, keywords? }[]` | — | รายการเพิ่มเติมใน command palette (⌘K) ที่เปิดหน้าของระบบจัดการ |
| `modules` | `string[]` | `[]` | admin module ที่มี Web Components: export ของแพ็กเกจหรือ path [Admin components](/th/guide/plugins#admin-components) |
| `pages` | `AdminPage[]` | `[]` | หน้าของตัวเองที่ `<admin>/p/<path>` เช่น จาก plugin ดู [pages](#pages) |
| `dashboard` | `DashboardWidget[]` | `[]` | กล่องบนแดชบอร์ดต่อจากกล่องที่มีอยู่เดิม ดู [dashboard](#dashboard) |
| `switcher` | `{ cookie, label, options }` | — | ตัวเลือกด้านบนของเมนูที่ใช้กับทั้ง admin เช่น tenant เก็บใน cookie `options` คือ path ใต้ API ที่คืน `{ options: [{ value, label }], all? }` ปกติ plugin เป็นผู้ตั้ง |

<!-- api: AdminBrand -->
### brand {#brand}

| ตัวเลือก | Type | |
|---|---|---|
| `name` | `string` | แสดงในเมนู หน้า login และแท็บของ browser ค่าเริ่มต้น "Easy CMS" |
| `logo` | `string` | path บนเว็บของคุณ หรือ URL แบบ `https://` |
| `color` | `string` | สีหลักแบบ `#rrggbb` ระบบสร้างเฉดสีให้ |

<!-- api: AdminPage -->
### pages {#pages}

| ตัวเลือก | Type | |
|---|---|---|
| `path` | `string` | **จำเป็น** ตัวพิมพ์เล็ก ตัวเลข และ `-` ไม่ซ้ำกัน หน้าจะอยู่ที่ `<admin>/p/<path>` |
| `component` | `AdminComponent` | **จำเป็น** เนื้อหาของหน้า ส่วนหัวหน้า admin วาดให้ |
| `label` | `string \| { en, th }` | **จำเป็น** หัวข้อในส่วนหัว เมนู และแท็บของ browser |
| `icon` | `AdminIcon` | ไอคอนในเมนู ค่าเริ่มต้น `file-text` |
| `group` | `'content' \| 'settings' \| false \| string` | กลุ่มในเมนู: `content`, `settings`, id ของกลุ่ม (`admin.nav`) หรือ label `false` คือไม่แสดง ค่าเริ่มต้น `content` |
| `access` | `({ user }) => boolean` | ใครเปิดได้ ตรวจฝั่ง server ค่าเริ่มต้น: ทุกคนที่ login |

<!-- api: DashboardWidget -->
### dashboard {#dashboard}

| ตัวเลือก | Type | |
|---|---|---|
| `component` | `AdminComponent` | **จำเป็น** เนื้อหาของกล่อง |
| `width` | `'half' \| 'full'` | `half` (ค่าเริ่มต้น): คอลัมน์ข้าง `full`: ใต้ทั้งสองคอลัมน์ บนมือถือเป็นคอลัมน์เดียว |
| `label` | `Label` | ชื่อของกล่องในหน้า Settings → Roles (`auth.rbac`) ค่าเริ่มต้น: tag ของ component |
| `access` | `({ user }) => boolean` | ใครเห็น ตรวจฝั่ง server ค่าเริ่มต้น: ทุกคนที่ login |

วิธีเขียนดูที่ [หน้าของ plugin และกล่องบนแดชบอร์ด](/th/guide/plugins#pages-and-dashboard-panels)

<!-- api: BackupsConfig -->
## backups {#backups}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `every` | `'day' \| 'week'` | — | backup อัตโนมัติ ถ้าไม่ตั้ง admin กดทำเองได้ |
| `at` | `string` | `03:00` | เวลา `HH:MM` ตามเขตเวลาของ server |
| `keep` | `number` | `7` | จำนวน backup ที่สำเร็จที่จะเก็บ ชุดที่เก่ากว่าจะถูกลบ |
| `dir` | `string` | `backups` | โฟลเดอร์ของที่เก็บในเครื่อง ไม่เปิดเป็น URL สาธารณะ |
| `storage` | `StorageAdapter` | ดิสก์ในเครื่อง | เช่น `s3Storage()` กับ bucket ส่วนตัว |
| `sqlite` | `(options) => DatabaseAdapter` | — | เฉพาะ Postgres: `sqlite` จาก `@easy-cms/db-sqlite` ใช้เขียนไฟล์ backup [Backup](/th/guide/backups#from-the-admin) |

<!-- api: AuditConfig -->
## audit {#audit}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `keep` | `number` | `365` | เก็บกี่วัน ที่เก่ากว่าจะถูกลบ `0`: เก็บไว้ทั้งหมด |
| `values` | `boolean` | `true` | เก็บค่าก่อนและหลังการแก้ `false`: เก็บแค่ชื่อ field ที่เปลี่ยน |
| `failedLogins` | `number` | `20` | จำนวน login ไม่สำเร็จในหนึ่งชั่วโมงที่แดชบอร์ดจะเตือน [Audit log](/th/guide/audit-log) |
| `scope` | `(context) => string \| null` | — | ส่วนของเว็บที่ entry เป็นของ เช่น tenant (ปกติ plugin เป็นผู้ตั้ง) admin ของส่วนนั้น (`scoped`) เห็นเฉพาะของส่วนตัวเอง คนอื่นเห็นของส่วนที่เลือกหรือทั้งหมด |

<!-- api: AuthConfig -->
## auth {#auth}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `roles` | `string[]` | `['admin', 'editor']` | ต้องมี `admin` เมื่อเปิด `rbac` คือ role ที่มีอยู่เสมอ [ผู้ใช้และการยืนยันตัวตน](/th/guide/auth) |
| `rbac` | `boolean` | `false` | กำหนด role และสิทธิ์จากหน้า admin (Settings → Roles) ซ้อนบนกฎ access [บทบาทและสิทธิ์](/th/guide/roles) |
| `providers` | `AuthProvider[]` | `[]` | เข้าสู่ระบบหน้า admin ด้วยบัญชีภายนอก เช่น `[google()]` จาก `@easy-cms/auth-oauth` [Single sign-on](/th/guide/sso) |
| `allowSignUp` | `{ domains, role? }` | — | เมื่อมี `providers`: คนจากโดเมนอีเมลเหล่านี้ได้บัญชีตอนเข้าสู่ระบบครั้งแรก เป็น `role` (ห้ามเป็น `admin`) |
| `password` | `boolean` | `true` | `false`: เฉพาะ admin ที่ใช้รหัสผ่านได้ คนอื่นใช้ `providers` |
| `setupCode` | `string` | `EASY_CMS_SETUP_CODE` | รหัสที่ admin คนแรกต้องกรอกที่ `/admin` กันคนอื่นแย่งเว็บที่เพิ่ง deploy ถ้าไม่ตั้งจะไม่ถาม [Deploy ด้วยคลิกเดียว](/th/guide/one-click-deploy) |
| `tokenExpiration` | `number` | `604800` (7 วัน) | อายุของ session เป็นวินาที |
| `maxLoginAttempts` | `number` | `5` | จำนวนครั้งที่ login ผิดได้ต่อ email (และ IP) ภายใน `lockWindow` |
| `lockWindow` | `number` | `900` (15 นาที) | เป็นวินาที |
| `trustedOrigins` | `string[]` | `[]` | origin อื่นที่ส่ง request ด้วย cookie ได้ |
| `resetPasswordExpiration` | `number` | `3600` | ลิงก์ "ลืมรหัสผ่าน" ใช้ได้กี่วินาที ต้องมี `email` และ `serverURL` บน production [ลืมรหัสผ่าน](/th/guide/auth#forgotten-passwords-and-invitations) |
| `inviteExpiration` | `number` | `604800` | ลิงก์คำเชิญใช้ได้กี่วินาที |
| `emails` | `{ resetPassword?, invite?, passwordChanged? }` | — | ฟังก์ชัน `({ user, url, locale, expiresAt }) => { subject, text, html? }` สำหรับข้อความอีเมลของคุณเอง |
| `members` | `MembersConfig` | — | คนที่ล็อกอินบนหน้าเว็บ ไม่ใช่ระบบจัดการ เช่น ลูกค้า ดู [members](#members) |

<!-- api: MembersConfig -->
### members {#members}

| ตัวเลือก | Type | |
|---|---|---|
| `roles` | `string[]` | role ของสมาชิก (ต้องอยู่ใน `roles` ด้วย) สมาชิกเข้าระบบจัดการไม่ได้ และ `isLoggedIn` (ค่าเริ่มต้นของทุก collection) ไม่นับพวกเขา [สมาชิกของเว็บ](/th/guide/members) |
| `signup` | `MembersSignup` | ให้ผู้เยี่ยมชมสมัครบัญชีเองได้: `POST <api>/users/signup` |
| `pages` | `{ verifyEmail?, resetPassword? }` | หน้าของเว็บที่เปิดลิงก์ในอีเมลของสมาชิกพร้อม `?token=` เป็น path บน `admin.siteUrl` (หรือ `serverURL`) หรือ URL เต็ม ค่าเริ่มต้นคือหน้าของระบบจัดการ |
| `emails` | `{ verifyEmail? }` | ข้อความอีเมลยืนยันที่อยู่อีเมลของคุณเอง |

<!-- api: MembersSignup -->
#### signup {#signup}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `role` | `string` | — | role ของบัญชีใหม่ ต้องเป็นหนึ่งใน `members.roles` |
| `verifyEmail` | `boolean` | `true` | บัญชีใหม่ต้องยืนยันอีเมลด้วยลิงก์ก่อนล็อกอิน |
| `turnstile` | `{ siteKey, secretKey }` | — | Cloudflare Turnstile ตรวจทุกครั้งที่สมัคร |

<!-- api: UploadConfig -->
## upload {#upload}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `dir` | `string` | `uploads` | โฟลเดอร์ของที่เก็บไฟล์ในเครื่อง นับจาก root ของโปรเจกต์ |
| `maxFileSize` | `number` | `10485760` (10 MB) | เป็น byte |
| `mimeTypes` | `string[]` | `['image/*', 'application/pdf']` | ประเภทไฟล์ที่อนุญาต ตรวจจากเนื้อไฟล์: MIME type, `type/*` หรือ `documents`, `office`, `archives` ดู[ชนิดไฟล์](/th/guide/uploads#file-types) |
| `storage` | `StorageAdapter` | ดิสก์ในเครื่อง | เช่น `s3Storage()` จาก `@easy-cms/storage-s3` [อัปโหลด](/th/guide/uploads) |
| `imageSizes` | `ImageSize[]` | `[]` | รูปย่อ (ต้องมี `sharp`) ดู [ขนาดรูป](#image-sizes) |
| `fromURL` | `UploadFromURLConfig` | ปิด | อัปโหลดจากลิงก์ ดู [fromURL](#fromurl) |
| `privateStorage` | `StorageAdapter` | `storage` ที่ไม่มี URL สาธารณะ | ที่เก็บไฟล์ในโฟลเดอร์ส่วนตัว ดู[โฟลเดอร์ส่วนตัว](/th/guide/uploads#private-folders) |
| `folders` | `boolean` | `false` | โฟลเดอร์ในคลังสื่อ และเมื่อเปิด `auth.rbac` กำหนดได้ว่าใครใช้แต่ละโฟลเดอร์ ดู[โฟลเดอร์](/th/guide/uploads#folders) |

<!-- api: UploadFromURLConfig -->
### fromURL {#fromurl}

| ตัวเลือก | Type | |
|---|---|---|
| `allowedHosts` | `string[]` | **จำเป็น** `images.example.com`, `*.example.com` (subdomain) หรือ `*` (ทุก host สาธารณะ) |
| `allowPrivate` | `boolean` | รวมที่อยู่ในเครือข่ายภายใน (`localhost`, `10.x`…) ด้วย ค่าเริ่มต้น `false` [อ่านก่อน](/th/guide/uploads#from-a-link) |

<!-- api: ImageSize -->
### ขนาดรูป {#image-sizes}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `name` | `string` | — | key ใน `media.sizes` เช่น `thumbnail` |
| `width` | `number` | — | ความกว้างเป็น pixel |
| `height` | `number` | — | ความสูง (ไม่บังคับ) |
| `fit` | `'cover' \| 'contain' \| 'inside'` | `cover` | วิธีจัดรูปเมื่อกำหนดทั้งกว้างและสูง |

<!-- api: LocalizationConfig -->
## localization {#localization}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `locales` | `string[]` | — | ภาษาของเนื้อหา เช่น `['th', 'en']` [หลายภาษา](/th/guide/localization) |
| `defaultLocale` | `string` | ภาษาแรก | ใช้เมื่อไม่ระบุภาษา และใช้เติมค่าที่ว่าง |
| `fallback` | `boolean` | `true` | ถ้าค่าว่าง จะอ่านค่าจากภาษาเริ่มต้นแทน |

<!-- api: WebhookConfig -->
## webhooks {#webhooks}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `url` | `string` | — | ปลายทางที่จะ POST event [Webhooks](/th/guide/webhooks) |
| `events` | `string[]` | ทั้งหมด | `create`, `update`, `delete`, `publish`, `unpublish`, `draft` |
| `collections` | `string[]` | ทั้งหมด | collection ที่ส่ง event ใช้ `[]` เพื่อไม่ส่งเลย |
| `globals` | `string[]` | ทั้งหมด | global ที่ส่ง event ใช้ `[]` เพื่อไม่ส่งเลย |
| `secret` | `string` | — | เซ็น body: `x-easy-cms-signature: sha256=<hex>` |
| `headers` | `Record<string, string>` | — | header เพิ่มเติม |

`events` รับ `events` ของ config ด้วย (เช่น `order.paid`) event เหล่านี้ส่งไปเฉพาะ webhook ที่ระบุไว้

<!-- api: JobConfig -->
## jobs {#jobs}

| ตัวเลือก | Type | |
|---|---|---|
| `name` | `string` | ไม่ซ้ำกัน ตัวพิมพ์เล็ก ใช้ `-` และ `:` ได้ เช่น `shop:carts` |
| `every` | `number` | รันห่างกันอย่างน้อยกี่วินาที เวลาที่รันล่าสุดเก็บในฐานข้อมูล ค่าเริ่มต้น: ทุกรอบ |
| `run` | `({ cms, now }) => unknown` | งานที่ทำ ถ้าล้มเหลวจะบันทึก log และงานอื่นยังรันต่อ |

งานเหล่านี้รันพร้อมงานตั้งเวลา: ทุกนาทีบน server หรือทุกครั้งที่ cron เรียก `GET <api>/jobs/run`

<!-- api: CollectionConfig -->
## collections {#collections}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `slug` | `string` | — | **จำเป็น** URL และชื่อตาราง: ตัวพิมพ์เล็ก ตัวเลข `-` และ `_` |
| `fields` | `Field[]` | — | **จำเป็น** ดู [อ้างอิง field](./fields) |
| `labels` | `{ singular?, plural? }` | สร้างจาก slug | แต่ละตัวเป็น string หรือ `{ en, th }` |
| `icon` | `AdminIcon` | `file-text` | ไอคอนในเมนู [แบรนด์](/th/guide/configuration#branding-the-admin) |
| `useAsTitle` | `string` | — | field ระดับบนสุดที่ใช้เป็นชื่อเอกสาร |
| `editIn` | `'page' \| 'drawer'` | `page` | `drawer` แก้ในแผงที่เลื่อนมาทับรายการ (ใช้ได้เมื่อไม่มี drafts, versions หรือ preview) |
| `drafts` | `boolean` | `false` | เพิ่ม `status` (`draft` \| `published`) [ฉบับร่าง](/th/guide/drafts) |
| `versions` | `boolean \| VersionsConfig` | `false` | เก็บเวอร์ชันทุกครั้งที่บันทึก ดู [versions](#versions) |
| `schedule` | `boolean` | `false` | เผยแพร่และยกเลิกตามเวลา (ต้องมี `drafts`) |
| `preview` | `({ doc, locale }) => string \| null` | — | หน้าที่แสดงเอกสาร สำหรับ[ตัวอย่างสด](/th/guide/live-preview) |
| `access` | `{ read?, create?, update?, delete? }` | ต้อง login | [การควบคุมสิทธิ์](/th/guide/access-control) |
| `hooks` | `CollectionHooks` | — | ดู [hooks](#hooks) |
| `admin` | `CollectionAdmin` | — | ดู [admin components](#admin-components) |

<!-- api: VersionsConfig -->
### versions {#versions}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `max` | `number` | `50` | จำนวนเวอร์ชันที่เก็บต่อเอกสาร เวอร์ชันเก่ากว่านั้นจะถูกลบ |

<!-- api: CollectionHooks -->
### hooks {#hooks}

แต่ละตัวเป็น list ของฟังก์ชัน [Hooks](/th/guide/hooks)

| Hook | อาร์กิวเมนต์ | ค่าที่คืน |
|---|---|---|
| `beforeValidate` | `data`, `operation`, `originalDoc?` | data ใหม่ หรือไม่คืน |
| `beforeChange` | `data`, `operation`, `originalDoc?` | data ใหม่ หรือไม่คืน |
| `afterChange` | `doc`, `operation`, `previousDoc?` | — |
| `beforeDelete` | `id` | — |
| `afterDelete` | `id`, `doc` | — |
| `afterRead` | `doc` | doc ใหม่ หรือไม่คืน |

ทุก hook ได้ `user`, `cms` และ `slug` ด้วย

<!-- api: CollectionAdmin -->
### Admin components {#admin-components}

| ตัวเลือก | Type | |
|---|---|---|
| `sidebar` | `SidebarPanel[]` | กล่องในแถบข้างของหน้าแก้ไข `{ tag, props, position: 'top' }` วางไว้บนสุด [Admin components](/th/guide/plugins#admin-components) |
| `group` | `string \| Label` | กลุ่มในเมนู: id ของกลุ่ม (`admin.nav` เช่น `shop.catalog`), `settings` (ตั้งค่า › เว็บไซต์) หรือ label ซึ่งสร้างกลุ่มชื่อนั้น ค่าเริ่มต้น: เนื้อหา [ระบบจัดการ](/th/guide/admin#the-menu) |
| `layout` | `LayoutNode[]` | แท็บ ส่วนที่พับได้ และแถวของหน้าแก้ไข ตามชื่อ field [ระบบจัดการ](/th/guide/admin#edit-pages) |
| `badge` | `{ where, tone?, label? }` | ตัวเลขข้างรายการในเมนู: เอกสารที่ตรง `where` ที่ผู้ใช้อ่านได้ เช่น คำสั่งซื้อรอจัดส่ง |
| `count` | `boolean` | จำนวนเอกสารข้างรายการในเมนู ค่าเริ่มต้น `true` |
| `empty` | `{ description?, link? }` | ข้อความในหน้ารายการเมื่อยังไม่มีเอกสาร และลิงก์ (`{ label, href }`) |
| `list` | `{ tree?, sort? }` | หน้ารายการ: `tree` คือชื่อ relationship ไปหา collection เดียวกัน เพื่อแสดงเป็นต้นไม้ (เอกสารระดับบนก่อน เอกสารลูกเปิดอยู่ข้างใต้) ส่วน `sort` คือลำดับเริ่มต้น เช่น `'title'` |
| `ownerField` | `string` | เมื่อเปิด `auth.rbac`: relationship ไปที่ `users` ที่บอกเจ้าของ เช่น `'author'` สำหรับบทบาทที่ได้ "เฉพาะเอกสารของตัวเอง" ค่าเริ่มต้น: ผู้สร้าง (`createdBy`) [บทบาทและสิทธิ์](/th/guide/roles#own-documents-only) |
| `confirmDelete` | `{ typeTitle?, impact? }` | ถามมากขึ้นก่อนลบ: `typeTitle` ให้พิมพ์ชื่อ `impact` คือ path ใต้ API ที่เรียกพร้อม `?id=` แล้วคืน `{ message }` บอกสิ่งที่จะหายไปด้วย ลบจากการเลือกหลายรายการไม่ได้ |

<!-- api: GlobalConfig -->
## globals {#globals}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `slug` | `string` | — | **จำเป็น** |
| `fields` | `Field[]` | — | **จำเป็น** |
| `label` | `string \| { en, th }` | สร้างจาก slug | |
| `icon` | `AdminIcon` | `settings` | ไอคอนในเมนู |
| `drafts` | `boolean` | `false` | |
| `versions` | `boolean \| VersionsConfig` | `false` | |
| `schedule` | `boolean` | `false` | ต้องมี `drafts` |
| `preview` | `({ doc, locale }) => string \| null` | — | |
| `access` | `{ read?, update? }` | ต้อง login | |
| `scope` | `({ context, user }) => string \| null \| undefined` | — | เก็บค่าแยกตาม scope เช่นต่อ tenant: string ได้ค่าของตัวเอง `undefined` ใช้ค่ากลาง `null` ไม่มี (อ่านได้ค่าว่าง แก้ไม่ได้) |
| `hooks` | `GlobalHooks` | — | ดูด้านล่าง |
| `admin` | `ContainerAdmin` | — | `{ sidebar }` เหมือน collection |

<!-- api: GlobalHooks -->
### Hook ของ global {#global-hooks}

| Hook | อาร์กิวเมนต์ | ค่าที่คืน |
|---|---|---|
| `beforeChange` | `data`, `operation`, `originalDoc?` | data ใหม่ หรือไม่คืน |
| `afterChange` | `doc`, `operation`, `previousDoc?` | — |
| `afterRead` | `doc` | doc ใหม่ หรือไม่คืน |

<!-- api: Endpoint -->
## endpoints {#endpoints}

| ตัวเลือก | Type | |
|---|---|---|
| `path` | `string` | ใต้ `routes.api` เช่น `/seo/generate` หรือ `/stats/:collection` |
| `method` | `'get' \| 'post' \| 'put' \| 'patch' \| 'delete'` | |
| `handler` | `(request: EndpointRequest) => unknown` | คืน `Response` หรือค่าที่ส่งเป็น JSON [Endpoints](/th/guide/plugins#endpoints) |
| `root` | `boolean` | เสิร์ฟ path จาก root ของเว็บ (เฉพาะ standalone server) เช่น `/robots.txt` ค่าเริ่มต้น `false` |

<!-- api: EndpointRequest -->
### EndpointRequest {#endpointrequest}

| Property | Type | |
|---|---|---|
| `request` | `Request` | request แบบ Web |
| `url` | `URL` | URL ของ request |
| `params` | `Record<string, string>` | ค่าของ segment แบบ `:name` |
| `user` | `AuthUser \| null` | ผู้ใช้ที่ login อยู่ |
| `context` | `RequestContext` | context ของ request (`onRequest`) ส่งต่อให้ Local API พร้อม `user` |
| `ip` | `string \| undefined` | IP ของ client ถ้า adapter รู้ |
| `cms` | `EasyCMS` | [Local API](./local-api) |
| `json` | `() => Promise<object>` | body แบบ JSON (ต้องเป็น object ขนาดไม่เกิน 1 MB) |
