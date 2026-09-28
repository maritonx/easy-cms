# ADR-0019: API keys และ plugin MCP

- **สถานะ:** Accepted
- **วันที่:** 2026-09-28

## บริบท

ต้องการให้สคริปต์และผู้ช่วย AI เข้าถึงเนื้อหาได้โดยไม่ใช้รหัสผ่านของคน (ADR-0018 เปิดทาง plugin ไว้แล้ว)
session token ใช้ได้แต่หมดอายุ ผูกกับการ login และให้สิทธิ์เต็มของผู้ใช้

## การตัดสินใจ

**API keys ใน core (`apiKeys: true`)**
- collection `api-keys` (ไม่ใช่ internal แสดงใต้ตั้งค่าในหน้า admin) field: name, permissions (json), expiresAt,
  prefix, user, lastUsedAt, keyHash (hidden)
- รูปแบบ `ecms_<prefix 8 hex>_<secret base64url 32 byte>` ค้นด้วย prefix เทียบ SHA-256 ของ secret แบบเวลาคงที่
  ไม่ใช้ scrypt เพราะ secret สุ่มยาวพอแล้ว แสดง key ครั้งเดียวตอนสร้าง (`cms.createApiKey`, `POST <api>/api-keys`)
- key ทำงานในนามเจ้าของ (key ∩ user): `Auth.verify` คืนผู้ใช้พร้อม `apiKey: { id, name, permissions }`
  และ Local API ตรวจ `keyAllows()` ในจุดเดียวกับที่ตรวจกฎสิทธิ์ (read, create, update, delete, publish)
  ทุกช่องทางที่ส่ง `{ user, overrideAccess: false }` (REST, MCP, โค้ดของผู้ใช้) จึงได้กฎเดียวกัน
- publish ตรวจเมื่อ input มี `status: 'published'`, การ unpublish และการตั้งเวลา การบันทึกฉบับร่างไม่ต้องมีสิทธิ์ publish
  `create` ของ media คือการอัปโหลด (ไม่แยกคอลัมน์ upload)
- key เข้าถึง `users` และ `api-keys` ไม่ได้เสมอ และสร้าง key ไม่ได้ ผู้ใช้เห็นเฉพาะ key ของตัวเอง admin เห็นทั้งหมด
- key ผิด หมดอายุ ถูกลบ หรือเจ้าของถูกปิดใช้งาน ได้ 401 (ไม่ตกไปเป็น anonymous) เพื่อให้สคริปต์รู้ทันที
- เพิกถอน = ลบ key, `lastUsedAt` อัปเดตอย่างมากนาทีละครั้ง
- ช่องสิทธิ์ในหน้า admin เป็น component ในตัว (`ecms-api-key-permissions` ในรูปแบบ admin component แต่ admin
  วาดเองโดยไม่ต้องมี module) และกล่องแสดง key ใหม่ครั้งเดียว

**`@easy-cms/plugin-mcp`**
- endpoint `POST <api>/mcp` (ไม่ใช่ `/api/mcp` ตามแผนแรก เพราะ endpoint ของ plugin อยู่ใต้ `routes.api`)
- SDK ทางการ `WebStandardStreamableHTTPServerTransport` แบบ stateless (ไม่มี session) ตอบเป็น JSON สร้าง server
  ใหม่ทุก request จึงใช้บน serverless ได้และไม่มี state ข้าม request
- ต้องใช้ API key (session cookie ใช้ไม่ได้) tool สร้างตาม collection/global และการกระทำที่ key อนุญาต
  (`find_`, `get_`, `create_`, `update_`, `delete_`, `publish_`/`unpublish_`, `schedule_`, `upload_media`,
  `get_global_`, `update_global_`, `publish_global_`) input schema แปลงจาก field โดยตรง (ไม่ใช้ zod)
- collection ที่มี drafts: `create_`/`update_` บังคับ `status: 'draft'` เสมอ มีแต่ `publish_` ที่ทำให้ขึ้นเว็บ
- rich text รับข้อความธรรมดาได้ (แปลงเป็น Tiptap), upload รับ base64 เท่านั้น (ไม่ดาวน์โหลด URL เพื่อกัน SSRF)
- error ส่งกลับเป็น `isError` พร้อมข้อความที่ผู้ช่วยแก้ได้ (field ของ ValidationError)
- ไม่มี tool แก้ schema/config (code-first) และไม่เปิด tool ของ users/api-keys

## ผลที่ตามมา

- ผู้ช่วย AI ต้องมี key ที่กำหนดสิทธิ์ชัดเจน และทุกการเขียนผ่าน validation, hook, versions เหมือนหน้า admin
- ยังไม่มี: การเชื่อมต่อแบบ stdio (`easy-cms mcp`), OAuth สำหรับ client ที่ไม่รองรับ header (ใช้ `mcp-remote` แทน),
  การอัปโหลดจาก URL พร้อม `allowedHosts`
