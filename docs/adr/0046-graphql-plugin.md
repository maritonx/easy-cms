# ADR-0046: GraphQL เป็น plugin

- **สถานะ:** Accepted
- **วันที่:** 2026-10-08

## บริบท

- DESIGN และ SRS เคยจัด GraphQL ไว้นอกขอบเขต แต่ทีม frontend ที่ใช้ Apollo, urql หรือ Relay อยากเลือกเฉพาะ field และดึงความสัมพันธ์ซ้อนกันได้ใน request เดียว ซึ่ง REST ทำได้แค่ `depth` 0–3 และเลือก field ไม่ได้
- Local API มีทุกอย่างที่ต้องใช้อยู่แล้ว (access ระดับ collection และ field, hooks, validation, drafts, localization) ส่วน plugin เพิ่ม endpoint ใต้ `routes.api` ได้ (MCP ใช้แบบนี้)
- GraphQL ให้ client ซ้อน query ได้ไม่จำกัด แต่ REST ไม่มีการจำกัดต้นทุน มีแค่ `limit` 100 ต่อหน้า

## การตัดสินใจ

- **แพ็กเกจแยก `@easy-cms/plugin-graphql`:** ใครไม่ใช้ก็ไม่ต้องลง `graphql` และ core ไม่ใหญ่ขึ้น endpoint `GET`/`POST <api>/graphql` ตาม GraphQL over HTTP (`GET` รับเฉพาะ query) ใช้ auth, CSRF และ API key เดิม schema สร้างจาก config ที่ resolve แล้ว จึงมี field ที่ plugin อื่นเพิ่มด้วย
- **graphql-js อย่างเดียว** (`^16.11 || ^17`) กับ handler ของเราเอง ไม่ใช้ Yoga หรือ Apollo Server เพราะ dependency น้อยและไม่ซ้อน server ของเรา schema เป็น `GraphQLSchema` มาตรฐาน จึงใช้กับเครื่องมือในระบบนิเวศได้ (`buildGraphQLSchema`, `createContext` สำหรับ server ของผู้ใช้เอง)
- **ชื่อจาก slug** แบบเดียวกับ `generate:types`: `posts` → `Post`, `post`, `posts`, `createPost`… global `site-settings` → `SiteSettings`, `siteSettings`, `updateSiteSettings` ตั้งชื่อเองได้ด้วย `names` ถ้าชื่อชนกัน แอปหยุดตอนเริ่มทำงานพร้อมบอกวิธีแก้ (ไม่ต่อท้ายตัวเลขให้เอง เพราะชื่อจะเดายาก) ตอนออกแบบเคยคิดจะใช้ `labels.singular` แต่ label เปลี่ยนได้บ่อยและเป็นภาษาไทยได้ จึงใช้ slug
- **อ่าน:** แบ่งหน้าแบบ REST (`docs`, `totalDocs`…), `where` มี type ต่อ collection (operator เดียวกับ REST, `AND`/`OR`, group ซ้อน), `sort` เป็น enum, `locale`/`fallbackLocale` และ `draft` (เฉพาะคนที่ล็อกอิน) ไม่มี `locale: all` (ใช้ alias แทน) relationship และ upload resolve เป็น type ปลายทาง โหลดผ่าน DataLoader ต่อ request ด้วย `cms.find` ที่ใช้สิทธิ์ของผู้อ่าน และอ่านใน locale/draft เดียวกับเอกสารต้นทาง
- **ชนิด:** select เป็น enum เมื่อทุกค่าเป็นชื่อที่ใช้ได้, blocks เป็น union (block object เดียวกันใช้ type เดียวกัน), richText และ json เป็น `JSON`, date เป็น `DateTime` ทุก field nullable ยกเว้น `id`, `createdAt`, `updatedAt` เพราะ field access หรือภาษาอาจทำให้ field ที่ required เป็น null
- **เขียน:** create/update/delete ของ collection และ update ของ global ผ่าน Local API, `draft` เป็น argument, relationship รับ id, rich text รับข้อความธรรมดาได้, blocks รับ `JSON` (GraphQL ยังไม่มี input union) ไม่มีการอัปโหลด, auth flow, versions และ schedule (ใช้ REST)
- **ไม่เปิด:** api-keys และ collection ภายใน ส่วน `exclude` ซ่อนเพิ่มได้
- **ขีดจำกัด:** ลึกไม่เกิน 7 ชั้น (validation rule, ไม่นับ introspection), โหลดไม่เกิน 2000 เอกสารต่อ request (นับจริงตอนรัน), `limit` 1–100 ปรับได้ด้วย `limits`
- **Error:** `extensions.code` ตาม REST (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR` + `fields`, `BAD_USER_INPUT`, `QUERY_TOO_DEEP`, `QUERY_TOO_LARGE`) error ที่ไม่คาดคิดถูก log และซ่อนข้อความใน production query ผิดรูปตอบ 400
- **ต่อยอด:** `extend` เพิ่ม `query`, `mutation` และ `fields` ลงใน type ที่สร้างด้วย object ของ graphql-js, resolver ได้ context `{ cms, user, load, count }` คำสั่ง `easy-cms generate:graphql` เขียน SDL (ลงทะเบียนผ่าน `config.commands` ของ plugin แทนให้ CLI import plugin เอง) introspection เปิดเป็นค่าเริ่มต้น GraphiQL (โหลดจาก unpkg แบบ pin เวอร์ชัน) เปิดเฉพาะนอก production

## ผลที่ตามมา

- ✅ frontend เลือก field และซ้อนความสัมพันธ์ได้ใน request เดียว ด้วยกฎสิทธิ์ชุดเดียวกับ REST
- ✅ N+1 ถูกกันด้วย DataLoader: list ของเอกสารกับความสัมพันธ์ใช้ query เดียวต่อ collection ต่อชั้น
- ✅ schema มาตรฐาน: codegen, Apollo tooling และ gateway ใช้ได้
- ⚠️ `generate:graphql` เปิดฐานข้อมูลเหมือนคำสั่ง plugin อื่น
- ❌ ยังไม่มี subscriptions, Relay connections, `locale: all`, การอัปโหลดผ่าน GraphQL และการประเมินต้นทุนก่อนรัน
