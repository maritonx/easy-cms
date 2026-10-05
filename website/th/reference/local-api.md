# อ้างอิง Local API {#local-api-reference}

ทุก method ของ object `cms` ที่ได้จาก `useEasyCMS()` (Nuxt), `getEasyCMS(config)` (Next.js) หรือ
`createEasyCMS(config)` มีเทสต์ตรวจรายการนี้กับ class `EasyCMS` ตัวอย่างดูได้ที่ [Local API](/th/guide/local-api)

Local API เชื่อผู้เรียกและข้ามกฎสิทธิ์ ส่ง `{ user, overrideAccess: false }` เพื่อใช้กฎสิทธิ์เหมือน REST API

## ตัวเลือก {#options}

| ตัวเลือก | ใช้กับ | |
|---|---|---|
| `overrideAccess` | ทุก method | `false` ใช้กฎสิทธิ์ของ `user` ค่าเริ่มต้น `true` |
| `user` | ทุก method | ผู้ใช้ที่ใช้ตรวจสิทธิ์ `null` คือไม่ได้ login |
| `depth` | การอ่านและเขียน | จำนวนชั้นของ relationship ที่ populate ค่าเริ่มต้น 1 สูงสุด 3 |
| `locale` | การอ่านและเขียน | ภาษาของเนื้อหา หรือ `'all'` เพื่อได้ `{ [locale]: value }` ค่าเริ่มต้นคือภาษาเริ่มต้น |
| `draft` | การอ่าน | รวมฉบับร่าง ค่าเริ่มต้นคืนเฉพาะที่เผยแพร่แล้ว |
| `fallbackLocale` | การอ่าน | ใช้ค่าจากภาษาเริ่มต้นเมื่อค่าว่าง ค่าเริ่มต้นตาม `localization.fallback` |
| `where` | `find`, `count` | ตัวกรอง: `{ field: { equals, not_equals, in, not_in, gt, gte, lt, lte, like, exists } }` ใช้ร่วมกับ `and` / `or` ได้ |
| `sort` | `find` | path ของ field ใส่ `-` เพื่อเรียงจากมากไปน้อย ค่าเริ่มต้น `-createdAt` |
| `limit` | `find` | ค่าเริ่มต้น 10 และ `0` คืนทุกรายการที่ตรง |
| `page` | `find` | เริ่มที่ 1 ค่าเริ่มต้น 1 |

`find` คืน `{ docs, totalDocs, limit, page, totalPages, hasNextPage, hasPrevPage }`

<!-- api: EasyCMS -->
## Method {#methods}

### เอกสาร {#documents}

| Method | คืนค่า | |
|---|---|---|
| `find(collection, options?)` | หน้าหนึ่งของเอกสาร | รายการพร้อม `where`, `sort`, `limit`, `page` |
| `findById(collection, id, options?)` | เอกสาร \| `null` | เอกสารเดียว |
| `count(collection, options?)` | `number` | จำนวนที่ตรง `where` |
| `create(collection, data, options?)` | เอกสาร | ตรวจข้อมูล รัน hook และบันทึก |
| `update(collection, id, data, options?)` | เอกสาร | แก้ field ที่ส่งมา |
| `delete(collection, id, options?)` | เอกสารที่ถูกลบ | ลบเวอร์ชันและงานตั้งเวลาของมันด้วย ถ้าลบผู้ใช้เมื่อเปิด `auth.rbac`: `{ transferTo: id }` โอนเอกสารที่ผู้ใช้เป็นเจ้าของให้ผู้ใช้อีกคน ถ้าไม่ระบุ เอกสารจะไม่มีเจ้าของ |

### Media {#media}

| Method | คืนค่า | |
|---|---|---|
| `upload({ data, name }, fields?, options?)` | เอกสาร media | เก็บไฟล์ รูปจะได้ขนาดและรูปย่อ |
| `uploadFromURL(url, fields?, options?)` | เอกสาร media | ดาวน์โหลดไฟล์จากลิงก์ แล้วทำแบบ `upload` [จากลิงก์](/th/guide/uploads#from-a-link) |
| `mediaURL(key)` | `string` | URL สาธารณะของไฟล์ที่เก็บไว้ |

### ฉบับร่างและเวอร์ชัน {#drafts-and-versions}

| Method | คืนค่า | |
|---|---|---|
| `unpublish(collection, id, options?)` | เอกสาร | เอาเอกสารออกจากเว็บ |
| `discardDraft(collection, id, options?)` | เอกสาร | ทิ้งฉบับร่างที่ค้างของเอกสารที่เผยแพร่แล้ว |
| `findVersions(collection, id, options?)` | หน้าหนึ่งของเวอร์ชัน | ใหม่สุดก่อน ต้องมีสิทธิ์แก้ |
| `findVersion(collection, id, versionId, options?)` | เวอร์ชัน \| `null` | เวอร์ชันเดียวพร้อม `data` |
| `restoreVersion(collection, id, versionId, options?)` | เอกสาร | ใช้เวอร์ชันเก่าเป็นปัจจุบัน (เป็นฉบับร่างถ้ามี drafts) |

### Global {#globals}

| Method | คืนค่า | |
|---|---|---|
| `findGlobal(slug, options?)` | global | อ่าน global |
| `updateGlobal(slug, data, options?)` | global | แก้ global |
| `unpublishGlobal(slug, options?)` | global | เอาออกจากเว็บ |
| `discardGlobalDraft(slug, options?)` | global | ทิ้งฉบับร่างที่ค้าง |
| `findGlobalVersions(slug, options?)` | หน้าหนึ่งของเวอร์ชัน | ใหม่สุดก่อน |
| `findGlobalVersion(slug, versionId, options?)` | เวอร์ชัน \| `null` | เวอร์ชันเดียว |
| `restoreGlobalVersion(slug, versionId, options?)` | global | ใช้เวอร์ชันเก่าเป็นปัจจุบัน |

### ตัวอย่างสด {#live-preview}

| Method | คืนค่า | |
|---|---|---|
| `preview(collection, id \| null, data, options?)` | `{ doc, url }` | เอกสารเสมือนบันทึก `data` แล้ว โดยไม่เขียนอะไรลงฐานข้อมูล |
| `previewGlobal(slug, data, options?)` | `{ doc, url }` | แบบเดียวกันสำหรับ global |
| `createPreviewToken(target, { expiresIn? })` | `string` | token ที่เปิดฉบับร่างหนึ่งรายการได้โดยไม่ต้อง login (ค่าเริ่มต้น 1 ชั่วโมง) |
| `verifyPreviewToken(token)` | เป้าหมาย \| `null` | token เปิดอะไร หรือ `null` ถ้าไม่ถูกต้องหรือหมดอายุ |

### การตั้งเวลา {#scheduling}

| Method | คืนค่า | |
|---|---|---|
| `schedule(collection, id, { action, at }, options?)` | งาน | เผยแพร่หรือยกเลิกเมื่อถึง `at` |
| `scheduled(collection, id, options?)` | รายการงาน | งานที่รออยู่ของเอกสาร เรียงตามเวลาที่ใกล้สุด |
| `cancelSchedule(collection, id, jobId, options?)` | — | ยกเลิกงานที่รออยู่ |
| `scheduleGlobal(slug, { action, at }, options?)` | งาน | แบบเดียวกันสำหรับ global |
| `scheduledGlobal(slug, options?)` | รายการงาน | |
| `cancelGlobalSchedule(slug, jobId, options?)` | — | |
| `upcomingJobs({ limit?, user?, overrideAccess? })` | รายการงาน | งานถัดไปจากทุก collection และ global |

### งานและ webhook {#jobs-and-webhooks}

| Method | คืนค่า | |
|---|---|---|
| `runJobs(now?)` | `{ ran, failed, webhooks }` | งานตั้งเวลาที่ถึงกำหนดและ webhook ที่ต้องส่งซ้ำ (สิ่งที่ cron และตัวจับเวลาเรียก) |
| `runScheduled(now?)` | `{ ran, failed }` | เฉพาะงานตั้งเวลาที่ถึงกำหนด |
| `retryWebhooks(now?)` | `{ sent, failed }` | เฉพาะ webhook ที่ถึงเวลาส่งซ้ำ |
| `startScheduler(interval?)` | — | รัน `runJobs` ทุก `interval` ms (ค่าเริ่มต้น 1 นาที) `createEasyCMS` เริ่มให้เองเมื่อมีการตั้งเวลาหรือมี webhook |
| `flushWebhooks()` | — | รอให้การส่ง webhook ที่กำลังทำอยู่เสร็จ เรียกก่อนฟังก์ชัน serverless จะจบ |
| `sendEmail(message)` | — | เข้าคิวอีเมลให้ adapter `email` ใน config แล้วส่งเบื้องหลัง [อีเมล](/th/guide/email) |
| `flushEmails()` | — | รอให้อีเมลที่กำลังส่งเสร็จ เรียกก่อนฟังก์ชัน serverless จะจบ |

### อื่นๆ {#other}

| Method | คืนค่า | |
|---|---|---|
| `createApiKey({ name, permissions?, expiresAt?, user? }, options?)` | `{ key, doc }` | [API key](/th/guide/api-keys) ใหม่ (เมื่อมี `apiKeys: true`) key จะถูกคืนมาที่นี่ครั้งเดียว |
| `documentPermissions(collection, id, user)` | `{ update, delete }` | ผู้ใช้ทำอะไรกับเอกสารนี้ได้บ้าง |
| `destroy()` | — | หยุดตัวจับเวลา รอการส่ง webhook และปิดการเชื่อมต่อฐานข้อมูล |

object `cms` ยังมี `config` (config ที่ resolve แล้ว), `auth` (การ login และตรวจ session),
`auth.sso` (การเข้าสู่ระบบด้วย `auth.providers`), `audit` (เมื่อเปิด `audit`: `audit.record({ action, target, doc })` เขียนรายการ), `roles` (เมื่อเปิด `auth.rbac`: `roles.allows(user, { collection }, operation)` บอกว่า role ของผู้ใช้อนุญาตอะไร),
`db`, `storage`, `logger` และ `cwd`
