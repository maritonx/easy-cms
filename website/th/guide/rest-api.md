# REST API {#rest-api}

::: info หน้านี้สอนอะไร
HTTP API ที่ `/api/cms`: endpoint, การ query, การยืนยันตัวตน, CSRF และ error

**ควรอ่านก่อน:** [Local API](./local-api)
:::

เสิร์ฟที่ `routes.api` (ค่าเริ่มต้น `/api/cms`) ทุก response เป็น JSON และกฎการควบคุมสิทธิ์มีผลเสมอ

## Collection {#collections}

| Method | Path | |
|---|---|---|
| GET | `/:collection` | แสดงรายการ Query: `where`, `sort`, `limit` (1–100), `page`, `depth`, `draft` |
| POST | `/:collection` | สร้าง (JSON body) |
| GET | `/:collection/:id` | เอกสารหนึ่งรายการ Query: `depth`, `draft`, `preview` ([preview token](./live-preview#preview-tokens): ฉบับร่างปัจจุบันโดยไม่ต้องเข้าสู่ระบบ) |
| PATCH | `/:collection/:id` | อัปเดต field ที่ระบุ |
| DELETE | `/:collection/:id` | ลบ |
| GET / PATCH | `/globals/:slug` | อ่าน / อัปเดต global (ใช้ `POST` ก็ได้) |
| POST | `/media` | อัปโหลด (`multipart/form-data`, field `file`) หรือ JSON `{ url }` เพื่อดาวน์โหลด ([จากลิงก์](/th/guide/uploads#from-a-link)) |
| GET | `/media/file/:name` | ไฟล์ที่จัดเก็บไว้ (สาธารณะ) |
| GET | `/auth/:provider/login` | เริ่มเข้าสู่ระบบด้วยผู้ให้บริการ (`?redirect=` หน้าใน admin) ส่วน `/auth/:provider/callback` ปิดท้าย `POST /auth/:provider/link` (ต้อง login อยู่) คืน `{ url }` สำหรับเชื่อมบัญชี `GET /auth/identities` และ `DELETE /auth/identities/:id` ดูและยกเลิกการเชื่อม ([Single sign-on](/th/guide/sso)) |
| GET | `/admin/audit` | สำหรับ admin และบทบาทที่ได้รับสิทธิ์: รายการ audit log ใหม่สุดก่อน (`action`, `target`, `doc`, `actor`, `from`, `to`, `page`) `/admin/audit.csv` ส่งออก `POST /admin/audit/verify` ตรวจลายเซ็น ([Audit log](/th/guide/audit-log)) |
| GET | `/admin/status` | สำหรับ admin (และ [role](/th/guide/roles) ที่ได้รับสิทธิ์): ข้อมูลระบบและสิ่งที่ต้องดูแล ([ตรวจสุขภาพระบบ](/th/guide/health-checks)) |
| GET | `/admin/roles` | สำหรับ admin เมื่อเปิด `auth.rbac`: รายการ role และสิ่งที่ให้สิทธิ์ได้ `POST /admin/roles` พร้อม `{ key, name?, permissions? }` เพิ่ม role `PATCH /admin/roles/:id` พร้อม `{ name?, permissions? }` แก้ไข `DELETE /admin/roles/:id` ลบ `GET /admin/roles/:id/history` ประวัติการแก้ไข ([บทบาทและสิทธิ์](/th/guide/roles)) |
| GET | `/admin/backups` | สำหรับ admin: การตั้งค่าและรายการ backup `POST /admin/backups` เริ่ม backup ทันที (202) `GET /admin/backups/:id/download` ดาวน์โหลด `DELETE /admin/backups/:id` ลบ |
| GET | `/admin/email` | สำหรับ admin: email adapter และค่าที่ใช้อยู่ (ไม่มีความลับ) `POST /admin/email/verify` ตรวจการเชื่อมต่อ `POST /admin/email/test` พร้อม `{ to?, locale? }` ส่งอีเมลทดสอบทันที (ไม่เกิน 5 ครั้งใน 10 นาที) |
| GET | `/admin/deliveries` | สำหรับ admin (และ role ที่ได้รับสิทธิ์): webhook หรืออีเมลที่บันทึกไว้ (`kind=webhook\|email`, `state=failed\|pending`, `page`) `POST /admin/deliveries/:kind/:id/retry` และ `/:kind/retry` (ที่ล้มทั้งหมด) ส่งทันที `DELETE /admin/deliveries/:kind/:id` และ `/:kind` (ที่ล้มทั้งหมด) ลบ |
| GET | `/:collection/:id/versions` | รายการเวอร์ชัน ใหม่สุดก่อน query: `limit`, `page` |
| GET | `/:collection/:id/versions/:version` | เวอร์ชันเดียวพร้อม `data` |
| POST | `/:collection/:id/versions/:version/restore` | กู้คืนเวอร์ชัน |
| POST | `/:collection/:id/unpublish` | ยกเลิกการเผยแพร่ (collection ที่มีฉบับร่าง) |
| POST | `/:collection/:id/discard-draft` | ทิ้งฉบับร่างที่รอเผยแพร่ |
| GET / POST | `/:collection/:id/schedule` | งานที่[ตั้งเวลา](./drafts#scheduled-publishing)ไว้และรอดำเนินการ / ตั้งเวลา `{ action, at }` |
| DELETE | `/:collection/:id/schedule/:job` | ยกเลิกงานที่ตั้งเวลาไว้ |
| GET / POST | `/jobs/run` | รันงานที่ตั้งเวลาไว้ซึ่งถึงกำหนดแล้ว และลองส่ง webhook ที่ค้างอยู่ใหม่ (cron secret หรือ admin) |
| POST | `/:collection/:id/preview` | [ตัวอย่างสด](./live-preview): `{ doc, url }` ของการแก้ไขที่ยังไม่บันทึก (`/:collection/preview` สำหรับเอกสารใหม่) |

global มี route ของเวอร์ชันชุดเดียวกันใต้ `/globals/:slug/…` (`versions`, `versions/:version`,
`versions/:version/restore`, `unpublish`, `discard-draft`, `preview`, `schedule`) route ของเวอร์ชันและตัวอย่างต้องมีสิทธิ์แก้ไข

สิ่งที่หน้า admin ใช้เองอยู่ใต้ `/admin/ui/…` (`schema`, `counts`, `search`, `modules`,
`scheduled`, `access`, `media-usage`, `owned`, `sso`) route เหล่านี้ใช้ภายใน ไม่นับเป็น API สาธารณะ
และอาจเปลี่ยนได้ในทุกรุ่น ให้ใช้ route ด้านบนแทน

`where` ใช้รูปแบบวงเล็บเหลี่ยมหรือ JSON:

```
GET /api/cms/posts?where[status][equals]=published&where[views][gte]=10&sort=-createdAt&limit=20
GET /api/cms/posts?where={"or":[{"featured":{"equals":true}},{"views":{"gt":100}}]}
```

`in` / `not_in` รับค่าที่คั่นด้วยจุลภาค `exists` รับ `true`/`false` และ `equals=null`
จะตรงกับค่าว่าง `draft=true` ใช้ได้เฉพาะผู้ใช้ที่เข้าสู่ระบบแล้ว เมื่อใช้
[หลายภาษา](./localization) `locale` (`th`, `en`… หรือ `all`) และ `fallbackLocale=false` ใช้ได้กับ
ทุกการอ่านและเขียน

## การยืนยันตัวตน {#authentication}

| Method | Path | |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → session cookie, `{ user, exp, csrfToken }` |
| POST | `/auth/logout` | ยุติ session |
| GET | `/auth/me` | `{ user, csrfToken }` ของ session ปัจจุบัน |
| GET | `/auth/init` | `{ hasUsers }` |
| POST | `/auth/first-register` | สร้าง admin คนแรกในขณะที่ยังไม่มีผู้ใช้ |
| GET | `/auth/signup` | เมื่อตั้ง `auth.members.signUp`: `{ token, turnstile, verifyEmail }` สำหรับฟอร์มสมัครสมาชิก ([สมาชิกของเว็บ](./members)) |
| POST | `/auth/signup` | `{ email, password, name?, token }` → `202 { verify: true }` หรือ session ทันทีถ้าไม่ต้องยืนยันอีเมล |
| POST | `/auth/verify-email` | `{ token }` จากอีเมลยืนยัน → ยืนยันอีเมลแล้วเข้าสู่ระบบ |
| POST | `/auth/forgot-password` | `{ email }` → ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ทางอีเมล ([ผู้ใช้และการยืนยันตัวตน](./auth)) |
| GET | `/auth/reset-password` | `?token=` → ตรวจว่าลิงก์ยังใช้ได้ |
| POST | `/auth/reset-password` | `{ token, password }` → ตั้งรหัสผ่านใหม่แล้วเข้าสู่ระบบ |

route เหล่านี้เคยอยู่ใต้ `/users/…` (`/users/login`, `/users/me`…) path เดิมยังใช้ได้ต่อตลอด 1.x

**เบราว์เซอร์** ส่ง session cookie ทุก request แบบ POST, PATCH, PUT และ DELETE ที่ใช้ cookie
ต้องแนบ CSRF token เป็น `x-csrf-token` (ได้จาก response ของการเข้าสู่ระบบ, `GET /auth/me` หรือ
cookie `ecms-csrf`) และต้องมาจาก origin ของ API เองหรือ origin ที่อยู่ใน `auth.trustedOrigins`

**Server และแอป** ส่ง `Authorization: Bearer <token>` พร้อม session token โดยไม่ต้องใช้ CSRF token

## CORS {#cors}

โค้ดในเบราว์เซอร์จาก origin อื่นเรียก API ได้เมื่อ origin นั้นอยู่ใน `cors` (หรือใน
`auth.trustedOrigins` ซึ่งอนุญาต cookie ด้วย) request แบบ preflight `OPTIONS` จะได้รับการตอบกลับสำหรับ
origin เหล่านั้น ส่วน origin อื่นจะไม่ได้รับ CORS header เบราว์เซอร์จึงบล็อก response

## Error {#errors}

```json
{ "errors": [{ "message": "is required", "field": "title", "code": "VALIDATION_ERROR" }] }
```

| Code | Status | เมื่อไร |
|---|---|---|
| `VALIDATION_ERROR` | 400 | ข้อมูลไม่ถูกต้อง แต่ละ error บอก `field` |
| `BAD_USER_INPUT` | 400 | query หรือ argument ผิด เช่น field ที่ไม่มีใน `where` หรือ `limit=500` |
| `UNAUTHORIZED` | 401 | ยังไม่เข้าสู่ระบบในที่ที่ต้องเข้า (พร้อม `WWW-Authenticate: Bearer`) |
| `FORBIDDEN` | 403 | ไม่มีสิทธิ์ |
| `NOT_FOUND` | 404 | ไม่มีเอกสาร collection หรือ route นั้น |
| `METHOD_NOT_ALLOWED` | 405 | route นี้รับ method อื่น (ดูใน `Allow`) |
| `PAYLOAD_TOO_LARGE` | 413 | body หรือไฟล์เกินขนาด |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | ไม่ใช่ JSON (หรือ multipart สำหรับอัปโหลด) |
| `TOO_MANY_REQUESTS` | 429 | ลองบ่อยเกินไป `Retry-After` บอกว่าต้องรอกี่วินาที |
| `CONFIG_ERROR`, `INTERNAL_SERVER_ERROR` | 500 | server มีปัญหา บน production ไม่มีรายละเอียด |

อาจมีรหัสใหม่เพิ่มขึ้น แต่รหัสเหล่านี้คงความหมายเดิม ฝั่ง server error ทุกตัวของ Easy CMS มี `code` เดียวกัน (`error.code` คู่กับ `error.status`)

คำขอที่สำเร็จตอบ 200 หรือ 201 เมื่อสร้างเอกสาร (202 เมื่อการสมัครรอยืนยันอีเมล) คำขอที่เริ่ม session (login, สมัคร, admin คนแรก, ยืนยันอีเมล,
ตั้งรหัสผ่าน) ตอบ 200 พร้อม session `DELETE` เอกสารตอบเป็นเอกสารนั้น การลบอื่นตอบ `{ "deleted": n }`

## ขั้นต่อไป {#next-steps}

- [ผู้ใช้และการยืนยันตัวตน](./auth): การ login และ token
- [TypeScript](./typescript): type สำหรับแอปอื่น
