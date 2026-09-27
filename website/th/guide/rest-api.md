# REST API {#rest-api}

เสิร์ฟที่ `routes.api` (ค่าเริ่มต้น `/api/cms`) ทุก response เป็น JSON และกฎการควบคุมสิทธิ์มีผลเสมอ

## Collection {#collections}

| Method | Path | |
|---|---|---|
| GET | `/:collection` | แสดงรายการ Query: `where`, `sort`, `limit` (1–100), `page`, `depth`, `draft` |
| POST | `/:collection` | สร้าง (JSON body) |
| GET | `/:collection/:id` | เอกสารหนึ่งรายการ Query: `depth`, `draft` |
| PATCH | `/:collection/:id` | อัปเดต field ที่ระบุ |
| DELETE | `/:collection/:id` | ลบ |
| GET / POST | `/globals/:slug` | อ่าน / อัปเดต global |
| POST | `/media` | อัปโหลด (`multipart/form-data`, field `file`) |
| GET | `/media/file/:name` | ไฟล์ที่จัดเก็บไว้ (สาธารณะ) |

`where` ใช้รูปแบบวงเล็บเหลี่ยมหรือ JSON:

```
GET /api/cms/posts?where[status][equals]=published&where[views][gte]=10&sort=-createdAt&limit=20
GET /api/cms/posts?where={"or":[{"featured":{"equals":true}},{"views":{"gt":100}}]}
```

`in` / `not_in` รับค่าที่คั่นด้วยจุลภาค `exists` รับ `true`/`false` และ `equals=null`
จะตรงกับค่าว่าง `draft=true` ใช้ได้เฉพาะผู้ใช้ที่เข้าสู่ระบบแล้ว

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
