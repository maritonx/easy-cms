# ADR-0047: Multi-tenant เป็น plugin บนจุดต่อใน core

- **สถานะ:** Accepted
- **วันที่:** 2026-10-09

## บริบท

- ต้องการใช้ CMS ตัวเดียวกับหลายเว็บหรือหลายลูกค้า (หลายแบรนด์ หรือ agency) โดยใช้ admin ชุดเดียวที่มีตัวสลับ tenant ส่วนหน้าเว็บระบุ tenant จากโดเมน
- core มีของที่ใช้เป็นฐานได้อยู่แล้ว: access คืน `where` ได้, field เพิ่มใน users ได้, rbac มีแบบ "เฉพาะเอกสารของตัวเอง" และ admin มีตัวสลับภาษา
- สิ่งที่ยังขาด: global มีได้แถวเดียวต่อ slug, `unique` ไม่ซ้ำทั้งตาราง (`uniqueWithin` มีเฉพาะ slug), access และ hook รู้แค่ `user` ไม่รู้ request, role `admin` ข้ามทุกอย่าง และ endpoint ระบบเช็ก `role === 'admin'` ตรงๆ, ผู้ใช้มีบทบาทเดียวทั้งระบบ
- อ้างอิง plugin multi-tenant ของ Payload: ฐานข้อมูลเดียว แยกด้วย field `tenant`, ผู้ใช้มี array `tenants`, base filter ตาม tenant ที่เลือก, ตัวสลับใน admin, `userHasAccessToAllTenants`, collection แบบ `isGlobal` และลบข้อมูลตามเมื่อลบ tenant ส่วน `unique` ต่อ tenant เอกสาร Payload ไม่ได้พูดถึง

## การตัดสินใจ

- **แยกแบบ row-level ในฐานข้อมูลเดียว** ทำเป็น plugin `@easy-cms/plugin-multi-tenant` ตามแบบ Payload และแก้สามจุดที่มักเจอปัญหาตั้งแต่แรก: `unique` ต่อ tenant, บทบาทต่อ tenant และ global ต่อ tenant ที่ใช้หน้า global เดิม ไม่แยกฐานข้อมูลต่อ tenant เพราะต้องมีหลาย instance ต่อ process และ migration ทุก tenant (ใช้ CMS แยกตัวแทน)
- **จุดต่อใน core** (ใช้ได้กับงานอื่นด้วย ไม่ผูกกับคำว่า tenant):
  - `RequestContext` และ `onRequest({ headers, url, user, cms })` ใน config คืน `context` และผู้ใช้ใน context นั้น ใช้กับ REST, endpoint ของ plugin (`EndpointRequest.context`), GraphQL, MCP และ `cms.forRequest(request)` ส่วน Local API รับ `context` เป็นตัวเลือก ส่งต่อให้ access, field access, hook, `filterOptions` และ admin schema
  - `AuthUser.scoped` และ `isSystemAdmin(user)`: admin ที่ scoped เป็น admin ของส่วนของตัวเองเท่านั้น endpoint ระบบ (backups, email, sso, roles, owned, jobs), หน้าระบบใน admin, การแก้ role/active ของ users, การสร้างหรือลบ users และ API key ของคนอื่นต้องเป็น `isSystemAdmin`
  - `GlobalConfig.scope({ context, user })` เก็บค่าที่ key `<slug>@<scope>` ในตาราง globals เดิม ไม่ต้องเปลี่ยน schema versions และ scheduled jobs ใช้ key เดียวกัน `null` = ไม่มี scope: อ่านได้ค่าว่าง แก้ไม่ได้
  - `uniqueWithin` ใช้ได้กับทุก field ที่ `unique` (ย้ายไป `BaseField`) และฐานข้อมูลได้ unique index `(scope, field)` คู่กับ index ของ field เดิม (กระทบ `slug` ของ nested-docs ที่มี `uniqueWithin: 'parent'`: ต้องมี migration เพิ่ม index)
  - `admin.switcher { cookie, label, options }`: ตัวเลือกด้านบนเมนู เก็บใน cookie จึงไปกับทุก request ของ admin รวมถึงของ plugin เปลี่ยนแล้ว reload
  - API key จำ `context` ที่สร้างไว้ใน `permissions.context` (input ตั้งเองไม่ได้ แก้ permissions แล้วยังอยู่)
  - `media-folders` ใน config ของ plugin รวมเข้ากับของในตัวได้ แบบเดียวกับ `media`
- **plugin:**
  - collection `tenants` (name, slug, domains) จัดการได้เฉพาะผู้ใช้ที่เข้าได้ทุก tenant
  - field `tenant` ใน collection ที่ระบุ ตั้งจาก context, ตรวจว่าเป็น tenant ที่ทำงานอยู่, ห้ามย้าย tenant (ยกเว้นผู้เข้าได้ทุก tenant), unique และ slug ได้ `uniqueWithin: 'tenant'`, relationship ไป collection ของ tenant ได้ `filterOptions` ตาม tenant
  - access ของแต่ละ collection ถูกห่อด้วยเงื่อนไข tenant ส่วนผู้เยี่ยมชมที่ไม่ระบุ tenant ได้ where ที่ไม่ตรงกับอะไรเลย (`publicReads: 'all'` เปลี่ยนได้)
  - users มี `tenants [{ tenant, role }]` แก้ได้เฉพาะผู้เข้าได้ทุก tenant สมาชิกเห็นคนใน tenant เดียวกัน admin ของ tenant จัดการสมาชิกผ่าน `/tenant-members` และหน้า Members (เพิ่มด้วยอีเมล เชิญคนใหม่ เปลี่ยนบทบาท นำออก) แก้บัญชีของคนอื่นไม่ได้ จึงยึดบัญชีของ tenant อื่นไม่ได้
  - `onRequest` เลือก tenant จาก header `x-easy-cms-tenant` > `?tenant=` > cookie > โดเมน ผู้เข้าได้ทุก tenant ได้ "ทุก tenant" เมื่อไม่ได้เลือก สมาชิกได้ tenant แรกของตัวเองถ้าที่ขอไม่ใช่ของเขา แล้วเปลี่ยน role เป็นบทบาทใน tenant นั้นพร้อม `scoped`
  - ลบ tenant แล้วลบเอกสารและไฟล์ของ tenant นั้น (ไฟล์ก่อนโฟลเดอร์) และเอาออกจากรายการของสมาชิก
  - `tenants:assign <tenant>` ใส่ tenant ให้เอกสารที่ยังไม่มี และคัดลอกค่ากลางของ global ไปยัง tenant
  - `tenantContext(cms, { host | slug })` สำหรับ Local API ในหน้า Nuxt/Next
- **ต่างจากที่คุยไว้ตอนออกแบบ:**
  - ลบ tenant ทำใน request เดียวกัน ไม่ใช่งานเบื้องหลัง
  - ไม่มีการพิมพ์ชื่อยืนยัน ใช้กล่องยืนยันเดิม
  - audit log ยังไม่แยกต่อ tenant จึงเห็นได้เฉพาะ admin ของระบบ
  - example เป็นตัวใหม่ (`examples/multi-tenant`) แทนการเพิ่มใน standalone เพื่อไม่ให้ e2e เดิมเปลี่ยน

## ผลที่ตามมา

- ✅ หลายเว็บใน CMS เดียว: เนื้อหา สมาชิก บทบาท และ global แยกต่อ tenant
- ✅ จุดต่อใน core (`context`, `scope`, `uniqueWithin`, `switcher`, `scoped`) ใช้กับงานอื่นได้ เช่น channel หรือ site
- ⚠️ ข้อมูลทุก tenant อยู่ในฐานข้อมูลเดียว ความปลอดภัยขึ้นกับ access ซึ่งเทสต์ไว้ทั้ง REST, Local API และ API key
- ⚠️ โปรเจกต์ที่ใช้ nested-docs ต้องสร้าง migration เพิ่ม unique index `(parent, slug)`
- ⚠️ key ของโฟลเดอร์สื่อ (`folder: 'banners'`) ยังไม่ซ้ำกันทั้งระบบ ไม่ได้แยกต่อ tenant
- ❌ ยังไม่มี: สำรองหรือ export ทีละ tenant, webhook ต่อ tenant, tenant ที่สมัครเอง, map SSO ตามโดเมนของอีเมล และ audit log ต่อ tenant
