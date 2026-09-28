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
| `localization` | `LocalizationConfig` | — | ดู [localization](#localization) |
| `routes` | `RoutesConfig` | | ดู [routes](#routes) |
| `admin` | `AdminConfig` | | ดู [admin](#admin) |
| `upload` | `UploadConfig` | | ดู [upload](#upload) |
| `auth` | `AuthConfig` | | ดู [auth](#auth) |
| `collections` | `CollectionConfig[]` | `[]` | ดู [collections](#collections) |
| `globals` | `GlobalConfig[]` | `[]` | ดู [globals](#globals) |
| `endpoints` | `Endpoint[]` | `[]` | ดู [endpoints](#endpoints) |
| `plugins` | `Plugin[]` | `[]` | `(config) => config` ทำงานตามลำดับก่อนตรวจ config [Plugins](/th/guide/plugins) |

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
| `menu` | `string[]` | ตามลำดับใน config | slug ของ collection ตามลำดับในเมนู ที่ไม่ระบุจะตามมา และ media อยู่ท้ายสุด |
| `modules` | `string[]` | `[]` | admin module ที่มี Web Components: export ของแพ็กเกจหรือ path [Admin components](/th/guide/plugins#admin-components) |

<!-- api: AdminBrand -->
### brand {#brand}

| ตัวเลือก | Type | |
|---|---|---|
| `name` | `string` | แสดงในเมนู หน้า login และแท็บของ browser ค่าเริ่มต้น "Easy CMS" |
| `logo` | `string` | path บนเว็บของคุณ หรือ URL แบบ `https://` |
| `color` | `string` | สีหลักแบบ `#rrggbb` ระบบสร้างเฉดสีให้ |

<!-- api: AuthConfig -->
## auth {#auth}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `roles` | `string[]` | `['admin', 'editor']` | ต้องมี `admin` [ผู้ใช้และการยืนยันตัวตน](/th/guide/auth) |
| `tokenExpiration` | `number` | `604800` (7 วัน) | อายุของ session เป็นวินาที |
| `maxLoginAttempts` | `number` | `5` | จำนวนครั้งที่ login ผิดได้ต่อ email (และ IP) ภายใน `lockWindow` |
| `lockWindow` | `number` | `900` (15 นาที) | เป็นวินาที |
| `trustedOrigins` | `string[]` | `[]` | origin อื่นที่ส่ง request ด้วย cookie ได้ |

<!-- api: UploadConfig -->
## upload {#upload}

| ตัวเลือก | Type | ค่าเริ่มต้น | |
|---|---|---|---|
| `dir` | `string` | `uploads` | โฟลเดอร์ของที่เก็บไฟล์ในเครื่อง นับจาก root ของโปรเจกต์ |
| `maxFileSize` | `number` | `10485760` (10 MB) | เป็น byte |
| `mimeTypes` | `string[]` | `['image/*', 'application/pdf']` | ประเภทไฟล์ที่อนุญาต ตรวจจากเนื้อไฟล์ |
| `storage` | `StorageAdapter` | ดิสก์ในเครื่อง | เช่น `s3Storage()` จาก `@easy-cms/storage-s3` [อัปโหลด](/th/guide/uploads) |
| `imageSizes` | `ImageSize[]` | `[]` | รูปย่อ (ต้องมี `sharp`) ดู [ขนาดรูป](#image-sizes) |

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
| `admin` | `ContainerAdmin` | — | ดู [admin components](#admin-components) |

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

<!-- api: ContainerAdmin -->
### Admin components {#admin-components}

| ตัวเลือก | Type | |
|---|---|---|
| `sidebar` | `AdminComponent[]` | กล่องในแถบข้างของหน้าแก้ไข [Admin components](/th/guide/plugins#admin-components) |

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

<!-- api: EndpointRequest -->
### EndpointRequest {#endpointrequest}

| Property | Type | |
|---|---|---|
| `request` | `Request` | request แบบ Web |
| `url` | `URL` | URL ของ request |
| `params` | `Record<string, string>` | ค่าของ segment แบบ `:name` |
| `user` | `AuthUser \| null` | ผู้ใช้ที่ login อยู่ |
| `cms` | `EasyCMS` | [Local API](./local-api) |
| `json` | `() => Promise<object>` | body แบบ JSON (ต้องเป็น object ขนาดไม่เกิน 1 MB) |
