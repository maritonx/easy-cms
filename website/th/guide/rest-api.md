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
| GET / POST | `/globals/:slug` | อ่าน / อัปเดต global |
| POST | `/media` | อัปโหลด (`multipart/form-data`, field `file`) |
| GET | `/media/file/:name` | ไฟล์ที่จัดเก็บไว้ (สาธารณะ) |
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

`where` ใช้รูปแบบวงเล็บเหลี่ยมหรือ JSON:

```
GET /api/cms/posts?where[status][equals]=published&where[views][gte]=10&sort=-createdAt&limit=20
GET /api/cms/posts?where={"or":[{"featured":{"equals":true}},{"views":{"gt":100}}]}
```

`in` / `not_in` รับค่าที่คั่นด้วยจุลภาค `exists` รับ `true`/`false` และ `equals=null`
จะตรงกับค่าว่าง `draft=true` ใช้ได้เฉพาะผู้ใช้ที่เข้าสู่ระบบแล้ว เมื่อใช้
[หลายภาษา](./localization) `locale` (`th`, `en`… หรือ `all`) และ `fallback-locale=false` ใช้ได้กับ
ทุกการอ่านและเขียน

## การยืนยันตัวตน {#authentication}

| Method | Path | |
|---|---|---|
| POST | `/users/login` | `{ email, password }` → session cookie, `{ user, exp, csrfToken }` |
| POST | `/users/logout` | ยุติ session |
| GET | `/users/me` | `{ user, csrfToken }` ของ session ปัจจุบัน |
| GET | `/users/init` | `{ hasUsers }` |
| POST | `/users/first-register` | สร้าง admin คนแรกในขณะที่ยังไม่มีผู้ใช้ |

**เบราว์เซอร์** ส่ง session cookie ทุก request แบบ POST, PATCH, PUT และ DELETE ที่ใช้ cookie
ต้องแนบ CSRF token เป็น `x-csrf-token` (ได้จาก response ของการเข้าสู่ระบบ, `GET /users/me` หรือ
cookie `ecms-csrf`) และต้องมาจาก origin ของ API เองหรือ origin ที่อยู่ใน `auth.trustedOrigins`

**Server และแอป** ส่ง `Authorization: Bearer <token>` พร้อม session token โดยไม่ต้องใช้ CSRF token

## CORS {#cors}

โค้ดในเบราว์เซอร์จาก origin อื่นเรียก API ได้เมื่อ origin นั้นอยู่ใน `cors` (หรือใน
`auth.trustedOrigins` ซึ่งอนุญาต cookie ด้วย) request แบบ preflight `OPTIONS` จะได้รับการตอบกลับสำหรับ
origin เหล่านั้น ส่วน origin อื่นจะไม่ได้รับ CORS header เบราว์เซอร์จึงบล็อก response

## Error {#errors}

```json
{ "errors": [{ "message": "is required", "field": "title" }] }
```

สถานะ: 400 (validation, query ไม่ถูกต้อง), 401, 403, 404, 405, 413, 415, 429 และ 500 ใน production
response แบบ 500 จะไม่มีรายละเอียดของ error

## ขั้นต่อไป {#next-steps}

- [ผู้ใช้และการยืนยันตัวตน](./auth): การ login และ token
- [TypeScript](./typescript): type สำหรับแอปอื่น
