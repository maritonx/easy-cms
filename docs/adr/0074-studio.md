# ADR-0074: Studio: เขียน config แล้วเห็นหน้า admin ในเบราว์เซอร์

- **สถานะ:** Accepted
- **วันที่:** 2026-11-27
- **เกี่ยวข้อง:** [ADR-0067](0067-multi-runtime.md) (core หลาย runtime), [ADR-0001](0001-embedded-web-standard-core.md) (handler แบบ Web-standard),
  [ADR-0018](0018-plugin-endpoints-admin-components.md) (component ของ admin), [ADR-0072](0072-escape-hatches.md) (escape hatches)

## บริบท

- เจ้าของโปรเจกต์ต้องการ `studio.easycms.dev` ให้ dev เขียน `easy-cms.config.ts` แล้วเห็นหน้า admin ทันที เพื่อให้หันมาใช้ Easy CMS
  (grilling 2026-11-27)
- วันนี้การจะเห็นหน้า admin ต้อง `npm create easy-cms`, ตั้งฐานข้อมูล, รัน dev server และ login ส่วนเว็บมีที่ไว้ใส่ลิงก์ demo แล้ว
  แต่ยังไม่มี demo (`DEMO_URL = null` ใน `EasyCMS-Website/lib/site.ts`)
- สิ่งที่ทำให้เป็นไปได้:
  - `@easy-cms/admin` เป็น Vue SPA สำเร็จรูป วาดทุกอย่างจาก `GET {apiPath}/admin/ui/schema` และอ่านเขียนข้อมูลผ่าน REST อย่างเดียว
  - core มี handler แบบ `(Request) => Promise<Response>` (ADR-0001) และ import `node:*` ได้เฉพาะใน `packages/core/src/runtime/` (ADR-0067)
  - REST รับ API key แบบ `Authorization: Bearer ecms_…` อยู่แล้ว (`packages/core/src/rest/handler.ts`)
  - `connectDatabase` สร้างตารางจาก config ได้ด้วย `schema: 'push'` (`packages/drizzle/src/database.ts`)
- สิ่งที่ขวางอยู่:
  - `runtime/context.ts` และ `packages/drizzle/src/database.ts` ใช้ `AsyncLocalStorage`
  - `drizzle` import `node:fs`, `node:path` และ `node:crypto` (migrations, schema hash)
  - `load-config.ts` ใช้ `jiti`
  - `db-sqlite` ปฏิเสธ `:memory:`
  - `@easy-cms/admin` export ออกมาแค่ server handler และใช้ cookie session อย่างเดียว
  - Service Worker สร้าง response ที่มี `Set-Cookie` ไม่ได้ จึงต้องใช้ bearer token

## การตัดสินใจ

- **กลุ่มเป้าหมาย:** dev ที่ใช้ Next.js หรือ Nuxt และกำลังเทียบกับ Payload, Strapi หรือ Directus ไม่ทำเพื่อคนที่ไม่เขียนโค้ด (ตรงกับ README)
- **เป้าหมาย:** ให้คน export เป็นโปรเจกต์จริง และแชร์ลิงก์ให้ทีม
- **ฟรีและไม่ต้อง login:** ไม่มี Cloud จึงไม่มีระบบบัญชีและไม่มี backend ของ Studio
- **จอแบ่งสองฝั่ง และไหลทางเดียว:** ซ้ายเป็น Monaco ที่มี type จาก `.d.ts` ของ `@easy-cms/core` ขวาเป็น iframe ที่รัน `@easy-cms/admin` ตัวจริง
  แก้โค้ดแล้ว preview เปลี่ยนตาม ไม่มี visual builder และไม่แก้โค้ดจาก UI
- **รัน core ตัวจริงในเบราว์เซอร์:** ไม่เขียนตัวสร้าง schema ใหม่ใน Studio (จะเพี้ยนจาก core ทุกครั้งที่เพิ่ม field หรือ plugin)
  และไม่รันโค้ดของคนนอกบน server ของเรา
  - Service Worker ใน iframe รัน `createRestHandler` ของ core จริง กับฐานข้อมูลในหน่วยความจำ admin เรียก `fetch` ตามปกติ
  - เมื่อ config เปลี่ยน CMS เริ่มใหม่บนฐานข้อมูลชื่อเดิม (`memory({ name })`) แล้ว push schema ใหม่ทับ เอกสารใน field ที่ยังอยู่จึงไม่หาย
- **การรันโค้ดของผู้ใช้:**
  - แปลง TypeScript ด้วย esbuild-wasm (debounce 300ms)
  - `import` ได้เฉพาะ `@easy-cms/*` ที่ Studio bundle ไว้ import อื่นขึ้นข้อความว่ายังไม่รองรับใน Studio
  - `process.env` เป็นออบเจกต์ว่าง
  - `db:` และ `storage:` ในโค้ดผู้ใช้ถูกแทนด้วยฐานข้อมูลและ storage ในหน่วยความจำ โค้ดใน editor ยังเหมือนไฟล์จริง
- **access, hooks และ plugins:**
  - access functions และ hooks รันจริง
  - adapter ที่มี side effect (email, storage ภายนอก, Telegram) เป็น stub ที่พิมพ์ลง Console panel
  - plugin ที่รันในเบราว์เซอร์ได้เปิดจริง: seo, redirects, nested-docs, form-builder, social, multi-tenant
    ตัวอื่น (ai, backups, notify, analytics) แสดงป้าย "stubbed in Studio"
- **ข้อมูลตัวอย่าง:** สร้าง 5–10 แถวต่อ collection ตาม field type เมื่อ config เปลี่ยน ค่าของ field ที่ยังใช้ได้อยู่ต่อเพราะใช้ฐานข้อมูลชื่อเดิม
- **Error:** type error ขีดเส้นแดงใน Monaco ส่วน error ตอนรันหรือตอนตรวจ config ให้คง preview ล่าสุดที่ใช้ได้ไว้ และแสดงแถบ error พร้อมบรรทัด
- **ความปลอดภัย:** ลิงก์แชร์รันโค้ดของคนอื่นทันทีที่เปิด ส่วนที่รันโค้ดและ admin จึงอยู่ใน iframe แบบ sandbox บน origin แยก
  ที่ไม่มี cookie ไม่ใช่ `studio.easycms.dev`
- **ลิงก์แชร์:** config บีบอัดด้วย lz-string ใส่ใน URL hash พร้อม version (`#v=1.4.0&c=…`) config ไม่ถูกส่งไปที่ server
- **Export:**
  - ปุ่ม Copy config
  - `npm create easy-cms@latest -- --from "<studio-url>"` เขียน `easy-cms.config.ts` จากลิงก์ แล้วถามเรื่องเฟรมเวิร์กและฐานข้อมูลตามปกติ
  - ไม่ทำ zip (ต้องดูแลเทมเพลตซ้ำกับ `templates/`)
- **จุดเริ่ม:** เปิดมาเป็นเทมเพลต Blog ทันที มีเทมเพลตอื่นให้เลือกจาก `examples/`
- **มือถือ:** ออกแบบสำหรับ desktop บนมือถือดู preview ได้อย่างเดียว พร้อมข้อความให้เปิดบน desktop
- **ที่อยู่และการ deploy:** `studio/` ใน monorepo คู่กับ `website/` เป็น static site บน Cloudflare Pages deploy ใหม่ทุก release
  CI จะเจอทันทีถ้าการแก้ core ทำให้ Studio พัง
- **วัดผล:** event แบบไม่เก็บข้อมูลส่วนตัว (Plausible หรือ Umami): เปิด → แก้โค้ด → Copy CLI → Share
  ตัวเลขหลักคือสัดส่วน Copy CLI ต่อคนเปิด ตั้งเป้าไม่ต่ำกว่า 5% CLI ไม่เก็บ telemetry
  ตัวเลขนี้บอกด้วยว่าปัญหาคือคนไม่รู้จัก Easy CMS (ต้องโปรโมต) หรือคนเห็นแล้วไม่ไปต่อ (ต้องแก้ Studio)

### งาน v0.1 ตามลำดับ (dev 1 คน ประมาณ 3 สัปดาห์)

1. **core และ drizzle รันในเบราว์เซอร์** (`directions/issues/6-core-in-the-browser.md`)
   - export เงื่อนไข `easy-cms-browser` (ไม่ใช้ `browser` เพราะ Workers และ Vercel Edge ตั้งเงื่อนไขนั้นด้วย) ที่แทน `runtime/`
     ด้วย @noble (hash ของ core เป็น sync แต่ Web Crypto เป็น async) และ context แบบ fallback ที่ตามได้ทีละ request
   - ไม่รวม `runtime/node/` และ `load-config.ts`
   - drizzle ไม่ import `node:*` เอง ใช้ context, hash และไฟล์จาก `@easy-cms/core/internal`
   - ผลพลอยได้: ปูทางไป runtime ที่ไม่มี `nodejs_compat` ตามปลายทางของ ADR-0067
2. **ฐานข้อมูลในหน่วยความจำ** (`directions/issues/7-db-memory.md`): `@easy-cms/db-memory` ใช้ sql.js ครอบด้วย client หน้าตาแบบ libSQL
   จึงใช้ dialect และ connection เดียวกับ db-sqlite (ย้ายไปไว้ที่ `@easy-cms/drizzle/sqlite`) SQL สร้างตารางมาจาก drizzle-kit ที่ build
   สำหรับเบราว์เซอร์ (module ของ Node เป็นตัวแทน) ได้ SQL เดียวกับ db-sqlite เทส integration ทั้งชุดรันบนตัวนี้ด้วย
3. **studio mode ของ admin** (`directions/issues/8-admin-studio-mode.md`):
   - export ไฟล์ static ของ SPA
   - ตั้ง `apiPath` ได้
   - ส่ง bearer token แทน cookie
   - รับ schema ใหม่ผ่าน `postMessage` โดยไม่ reload ทั้งหน้า
   - เป็นสัญญาที่ชัดเจน ไม่ให้ Studio ไปแกะ `dist/` เอง
4. **แอป Studio** (`directions/issues/9-studio-app.md`): Monaco, esbuild-wasm, Service Worker, sandbox origin, แถบ error, Console panel,
   ข้อมูลตัวอย่าง, เทมเพลต Blog
5. **แชร์และ export** (`directions/issues/10-studio-share-and-export.md`): URL hash พร้อม version, Copy config, `create-easy-cms --from`

### v0.2

- toolbar สลับ role (Admin, Editor, Viewer) ให้เห็นผลของ access ทันที
- `create-easy-cms --from` ติดตั้ง version ที่ตรงกับลิงก์ หรือเตือนถ้าไม่ตรง ลิงก์เก่าบน Studio ใหม่แสดงคำเตือน
- เทมเพลต Shop และ Multi-tenant
- analytics
- หน้ามือถือ

### ยังไม่ทำ

- **visual builder และการแก้โค้ดจาก UI:** การซิงก์สองทางกับ TypeScript ที่มีฟังก์ชันปนอยู่ยากมาก และขัดกับ code-first
- **ลิงก์สั้นที่เก็บบน server:** ต้องมี backend, DB และระบบกัน spam ทำเมื่อเจอ config ที่ยาวเกิน URL จริง
- **รันโค้ดบน server:** เสี่ยงด้านความปลอดภัยและมีค่าใช้จ่ายต่อเนื่อง
- **import package จาก npm ตามใจ:** ต้องมี CDN หรือ bundler ใน Studio รอดูว่ามีคนขอจริงไหม
- **deploy จาก Studio ขึ้น Cloud:** ไม่มี Cloud

### ทางเลือกที่ถูกกว่า

- public demo admin (instance จริงที่ reset ข้อมูลทุกชั่วโมง) แล้วใส่ใน `DEMO_URL` ทำได้ในไม่กี่วัน แต่แก้ config ไม่ได้
  จึงไม่แสดง DX แบบ code-first เลือก Studio และใช้ demo นี้เป็นทางเลือกถ้า v0.1 ล่าช้า

## ผลที่ตามมา

- core มี build สำหรับเบราว์เซอร์ที่ต้องดูแลต่อ เทสใน `core/test/runtime.test.ts` ต้องตรวจ build นี้ด้วย
- `admin/ui/*` ยังอยู่นอก semver (ADR-0072) Studio ผูกกับ admin version เดียวกันใน monorepo จึงไม่กระทบ
- ถ้าตัวเลขต่ำกว่าเป้าหลังเปิด 1 เดือน ให้ทบทวนทางไปต่อจาก Studio ก่อนลงแรงกับ v0.2
