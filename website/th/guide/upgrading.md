# การอัปเกรด

::: info สิ่งที่จะได้เรียนรู้
แต่ละเวอร์ชันเปลี่ยนอะไรไปบ้าง และต้องแก้อะไรในแอปเมื่ออัปเกรด

**ก่อนหน้านี้:** [การตั้งค่า](./configuration)
:::

อัปเกรดแพ็กเกจ `@easy-cms/*` และ `easy-cms` ทุกตัวพร้อมกัน เพราะออกเวอร์ชันด้วยเลขเดียวกัน

```sh [pm]
npm install @easy-cms/core@latest easy-cms@latest
```

ใส่แพ็กเกจ `@easy-cms/*` อื่นที่แอปใช้ (`@easy-cms/nuxt`, `@easy-cms/db-sqlite`, …) ในคำสั่งเดียวกัน

ก่อน 1.0 เวอร์ชัน minor (0.48 → 0.60) อาจเปลี่ยนชื่อได้ แต่ละหัวข้อด้านล่างบอกว่าต้องแก้อะไร
ถ้า config ยังใช้ชื่อเก่า แอปจะไม่เริ่มทำงาน และ error จะบอกชื่อใหม่:

```
Invalid Easy CMS config (1 problem):
  • admin.siteUrl: is now `siteURL`
```

## 0.60

0.60 ล็อกชื่อและรูปร่างที่จะใช้ตลอด 1.x แอปส่วนใหญ่แก้แค่ config (error บอกทีละข้อ)
และชื่อเมธอดของ Local API ที่เปลี่ยน ถ้าเรียกใช้อยู่

### Config

| เดิม | ใหม่ |
| --- | --- |
| `admin.siteUrl` | `admin.siteURL` |
| `admin.menu` | `admin.order` ในแต่ละ collection, global และ page |
| `icon`, `editIn` ของ collection หรือ global | `admin.icon`, `admin.editIn` |
| `position` ของ field | `admin.position` |
| `admin.defaultValue` ของ field | `admin.initialValue` |
| `to` ใน `admin.commands` | `href` |
| `commands` | `cliCommands` |
| `auth.allowSignUp` | `auth.providerSignUp` |
| `auth.members.signup` | `auth.members.signUp` |
| `audit.keep` | `audit.keepDays` |
| `audit.scope(context)` | `audit.scope({ context, user })` |
| `versions.max` | `versions.keep` |
| `backups.every: 'day' \| 'week'` | `backups.frequency: 'daily' \| 'weekly'` |
| `localization: null`, `admin.switcher: null` | `false` |
| `notEquals` ใน `admin.condition` | `not_equals` เหมือน `where` (มี `not_in` ด้วย) |

hook ได้ `previousDoc` (เดิมเป็น `originalDoc` ใน `beforeValidate` และ `beforeChange`)
option ที่ Easy CMS ไม่รู้จักจะขึ้นเป็นคำเตือน พร้อมชื่อที่ใกล้เคียงที่สุด

พฤติกรรมอื่นที่เปลี่ยน:

- **Webhook** ไม่ส่ง event ของ `users` อีกต่อไป เว้นแต่ webhook นั้นใส่ `users` ใน collections
- **access ของ field** มี `create` ถ้าไม่ตั้ง จะใช้ `update` ตอนสร้างเหมือนเดิม
- global มี hook `beforeValidate` และ `admin.group: false` ซ่อน collection หรือ global จากเมนู

### Local API และ access

| เดิม | ใหม่ |
| --- | --- |
| `isLoggedIn` | `isStaff` (`isSignedIn` เหมือนเดิม) |
| `cms.scheduled()` | `cms.findSchedule()` |
| `cms.scheduledGlobal()` | `cms.findGlobalSchedule()` |
| `cms.upcomingJobs()` | `cms.upcomingSchedules()` |
| type `ScheduledJob` | `ScheduledPublish` |
| storage `localStorage()` | `diskStorage()` (`DiskStorageOptions`) |

- `isAdmin` ไม่นับ admin ของบางส่วนของเว็บอีกต่อไป (ผู้ใช้ที่มี `scoped: true` เช่น admin ของ tenant เดียว)
  ถ้าเคยพึ่งพฤติกรรมนี้ ให้ใช้ `isSystemAdmin` หรือเขียนกฎเอง
- `cms.runJobs()` (และ `GET <api>/jobs/run`) ตอบ `{ scheduled: { ran, failed }, jobs, webhooks, emails }`
- `cms.increment()` throw `NotFoundError` เมื่อไม่มีเอกสารนั้น ส่วน `null` หมายถึงค่าจะเกินขอบเขตเท่านั้น
- `cms.audit.list({ ...filter, page, limit })` ตอบแบบเดียวกับ `find`: `{ docs, totalDocs, page, … }`
- helper ที่ใช้กันเฉพาะในแพ็กเกจ `@easy-cms/*` ย้ายไป `@easy-cms/core/internal` ซึ่งไม่อยู่ใต้ semver
  ให้ import จาก `@easy-cms/core` (หรือ `@easy-cms/core/plugin`) เท่านั้น

### Error

`EasyCMSError` ทุกตัวมี `code` และ error ของ REST ส่งมาด้วยใน `errors[].code` เช่น
`VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `TOO_MANY_REQUESTS` GraphQL ใช้รหัสชุดเดียวกัน
ให้เช็ค `code` แทนข้อความ

- `ConfigError` เป็น `EasyCMSError` (`CONFIG_ERROR`)
- คำตอบ `429` มี `Retry-After`
- คำขอที่เริ่ม session (login, first register, reset password) ตอบ `200`
- การยกเลิกการเผยแพร่ตามเวลาตอบ `{ deleted: 1 }`

### Route ของ REST

เฉพาะแอปที่เรียก REST API เอง

- การ sign in ย้ายไป `<api>/auth/<action>`: `login`, `logout`, `me`, `init`, `signup`,
  `verify-email`, `forgot-password`, `reset-password`, `first-register` ส่วน path เดิม
  `<api>/users/<action>` ยังใช้ได้ตลอด 1.x
- อัปเดต global ด้วย `PATCH` (`POST` ยังใช้ได้)
- `?fallbackLocale=` (`?fallback-locale=` ยังใช้ได้)
- สิ่งที่หน้า admin ใช้อย่างเดียวย้ายไป `<api>/admin/ui/*` ซึ่งไม่อยู่ใต้ semver อย่าเรียกจากแอป
- endpoint ของ plugin ที่ path ตรงกับของ API แต่ method ต่างกัน จะปล่อย method นั้นให้ API ตอบ

### CLI

| เดิม | ใหม่ |
| --- | --- |
| `easy-cms create-admin` | `easy-cms admin:create` |
| `easy-cms run-scheduled` | `easy-cms jobs:run` |

ชื่อเดิมยังใช้ได้ คำสั่งในตัวไม่รับ option ที่ไม่รู้จัก พิมพ์ผิดอย่าง `--outt` จะเป็น error แทนที่จะถูกข้ามไปเงียบๆ

### Plugin

option ที่เปลี่ยนชื่อ ถ้าใช้ชื่อเดิม แอปจะไม่เริ่มทำงานและบอกชื่อใหม่

| Plugin | เดิม | ใหม่ |
| --- | --- | --- |
| SEO | `siteUrl` | `siteURL` |
| ฟอร์ม | `fields` | `fieldKinds` |
| ฟอร์ม | `minSubmitTime` (ms, 2000) | `minSubmitSeconds` (2) |
| ฟอร์ม | `fetch` | ถอดออก |
| Multi-tenant | `tenantsSlug` | `slugs: { tenants }` |
| Multi-tenant | `findTenantFor(cms, by, slug)`, `tenantContext(cms, by, slug)` | `{ …by, collection: slug }` |
| Redirects | `slug` | `slugs: { redirects }` |
| Redirects | `cacheTTL` (ms, 60000) | `cacheMaxAge` (วินาที, 60) |
| Nested docs | `fields` | `fieldNames` |
| GraphQL | `exclude` | `collections` และ `globals`: slug ที่อยู่ใน schema (ค่าเริ่มต้นคือทั้งหมด) |
| ร้านค้า | `customers.signup`, `signup()` | `customers.signUp`, `signUp()` |

type: `FormBuilderOptions`, `MultiTenantOptions` และ `EcommerceOptions` เปลี่ยนเป็น
`FormBuilderPluginOptions`, `MultiTenantPluginOptions` และ `EcommercePluginOptions`

Adapter:

| Adapter | เดิม | ใหม่ |
| --- | --- | --- |
| `sqlite()` | `busyTimeout` | `busyTimeoutMs` |
| `s3Storage()` | `publicUrl` | `publicURL` |

### การเขียน plugin

- import `definePlugin`, `defineFieldType`, type ของ plugin และคลาส error จาก `@easy-cms/core/plugin`
  ซึ่งไม่มีโค้ดฝั่ง server จึงให้ element ของ admin import ได้ด้วย
- ระบุ plugin API ที่เขียนไว้: `definePlugin(fn, { name, version, apiVersion: 1 })` plugin ที่เขียนสำหรับ
  เวอร์ชันอื่นจะหยุดการเริ่มทำงานและบอกว่าต้องอัปเกรดอะไร adapter ตั้ง `apiVersion: 1` ได้เหมือนกัน
- `onRequest` เป็น list ได้ plugin ที่เพิ่ม `onRequest` ควรต่อท้าย list แทนการเรียกฟังก์ชันเดิมเอง
  แต่ละตัวเห็น user ที่ตัวก่อนหน้าคืนมา และ context ถูกรวมกัน
- `cliCommands` ได้ `flags`: `--dry-run` คือ `flags.dryRun`, `--limit=5` คือ `flags.limit`
- tag ของ element ใน admin เป็นชื่อ custom element ใดก็ได้ที่มีขีด ไม่ต้องขึ้นต้นด้วย `ecms-`
- widget ของ dashboard มี `id` ซึ่ง role ใช้แทน tag

Next.js: `createRouteHandlers(config, options)` รับ `basePath` และ `getClientIp` นอกจาก `trustProxy`
