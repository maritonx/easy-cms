# Easy CMS — Roadmap

- **สถานะ:** Accepted
- **วันที่:** 2026-10-09, แผน 1.x เพิ่มเมื่อ 2026-10-18
- **เวอร์ชันปัจจุบัน:** 1.2.0
- **เป้าหมาย 1.0:** 1.0.0 วันที่ 2026-12-15 — **ออกแล้ว 2026-10-17** (RC 1.0.0-rc.0 วันเดียวกัน)
- **เป้าหมาย 1.x:** open source ที่องค์กร self-host ได้อย่างมั่นใจ ดู [1.x](#one-x)
- **ติดตามงาน:** GitHub Milestones ของ `maritonx/easy-cms` (หนึ่ง issue ต่อหนึ่งงาน, issue เขียนเป็นภาษาอังกฤษ)
- **การออกเวอร์ชันใน 1.x:** ออกทันทีที่ merge (บั๊กเป็น patch, ฟีเจอร์เป็น minor) milestone ของ 1.x จึงตั้งชื่อตามหัวข้อ ไม่ผูกกับเลขเวอร์ชัน (ตกลง 2026-10-18)

---

## 1. 1.0 หมายถึงอะไร

1.0 คือ **เวอร์ชันแรกที่พร้อมใช้งานจริง** ไม่ใช่เวอร์ชันที่ฟีเจอร์ครบ
งานก่อน 1.0 จึงเป็นเรื่องความเสถียร ความน่าเชื่อถือ และการอัปเกรดได้ ไม่เพิ่มฟีเจอร์ใหม่

ตั้งแต่ 1.0:

- **API ที่ล็อกแล้ว:** config (`defineConfig`, collections, globals, fields, access, hooks), Local API, REST, GraphQL,
  สัญญาของ plugin ทั้งฝั่ง server (`definePlugin`, `apiVersion: 1`) และฝั่ง admin (`API_VERSION = 1`), props ของ field component
- **Breaking change** ทำได้เฉพาะใน major พร้อมคู่มืออัปเกรด
- **Deprecation:** API ที่เลิกใช้ยังทำงานได้และเตือนใน log จนถึง major ถัดไป (เตือนอย่างน้อย 1 minor ก่อนถอด)
- **อัปเกรดจาก 0.x:** migration อัตโนมัติ มีการทดสอบกับฐานข้อมูลของ 0.x รุ่นเก่า
- **Experimental:** `@easy-cms/plugin-ecommerce`, `@easy-cms/plugin-graphql`, `@easy-cms/plugin-mcp` ได้เลข 1.0 เหมือนแพ็กเกจอื่น
  (fixed group) แต่ยังเปลี่ยนแบบ breaking ใน minor ได้ จนกว่าจะประกาศว่าเสถียร
  ก่อน RC ทั้งสามต้องพร้อมใช้ใน production (ทดสอบกับบริการหรือ client จริง, dependency ภายนอกถูก pin)
  แต่ยังติดป้ายไว้ ถอดป้ายใน 1.x ตามเกณฑ์ใน [#122](https://github.com/maritonx/easy-cms/issues/122)
  ลำดับความสำคัญ: ecommerce > GraphQL > MCP
- **การซัพพอร์ต:** 0.x หยุดซัพพอร์ตเมื่อ 1.0 ออก, แก้ช่องโหว่ใน minor ล่าสุดของ 1.x,
  เมื่อมี 2.0 แล้ว 1.x ได้แพตช์ความปลอดภัยอีก 6 เดือน

**Feature freeze:** ตั้งแต่วันนี้ถึง 1.0 รับเฉพาะการแก้บั๊ก งานใน milestone และการปรับ API ในเฟส 0.60
ไอเดียใหม่ใส่ใน [milestone ของ 1.x](#m5) หรือ [หลัง 1.0](#later)

---

## 2. Milestones

| Milestone | ครบกำหนด | เป้าหมาย |
|---|---|---|
| [`Hardening`](https://github.com/maritonx/easy-cms/milestone/1) | 2026-10-30 | ทดสอบกับบริการจริง, ความปลอดภัย, release ที่ปลอดภัย |
| [`API freeze`](https://github.com/maritonx/easy-cms/milestone/2) | 2026-11-20 | ทบทวนและล็อก API, ทดสอบการอัปเกรด, นโยบายเวอร์ชัน |
| [`1.0.0-rc`](https://github.com/maritonx/easy-cms/milestone/3) | 2026-12-01 | RC, เอกสารเริ่มต้นและอัปเกรด, รับเฉพาะการแก้บั๊ก |
| [`1.0.0`](https://github.com/maritonx/easy-cms/milestone/4) | 2026-12-15 | ออก 1.0 และประกาศ |
| [`Multi-instance & operations`](https://github.com/maritonx/easy-cms/milestone/5) | — | Hardening: หลาย instance ปลอดภัย, ดูแลระบบได้, เครื่องมือความปลอดภัย |
| [`Security & identity`](https://github.com/maritonx/easy-cms/milestone/6) | — | ความปลอดภัยและ identity |
| [`Scale (1M documents)`](https://github.com/maritonx/easy-cms/milestone/7) | — | performance ที่ 1M เอกสาร (ปิดแล้ว 2026-10-29) |
| [`Admin lists & shop`](https://github.com/maritonx/easy-cms/milestone/8) | — | รายการใน admin (saved views, ตัวกรอง, CSV) และ Omise |

### Labels

`area:core`, `area:admin`, `area:adapters`, `area:plugins`, `area:release`, `area:docs`, `area:security`
และ `release-blocker` (ต้องเสร็จก่อนออกเวอร์ชันของ milestone นั้น)

---

### M1 — `Hardening` (2026-10-30) {#m1}

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#66](https://github.com/maritonx/easy-cms/issues/66) | Refuse to publish a package that still has `workspace:` ranges | area:release, release-blocker | `prepublishOnly` (หรือ `prepack`) ของทุกแพ็กเกจล้มเมื่อ `package.json` ที่จะ pack มี `workspace:`; `changeset publish` ใน CI ยังผ่าน |
| [#67](https://github.com/maritonx/easy-cms/issues/67) | Test single sign-on against a real Google OAuth client | area:security | login, ผูกบัญชี, `auth.password: false` ผ่านกับ Google จริงตาม `website/guide/sso.md`; แก้เอกสารถ้าขั้นตอนไม่ตรง |
| [#68](https://github.com/maritonx/easy-cms/issues/68) | Test direct uploads to a real Vercel Blob store | area:plugins | อัปโหลดไฟล์ใหญ่จาก admin ผ่าน Vercel Blob จริง, ไฟล์ส่วนตัวและลิงก์ที่เซ็นทำงาน |
| [#69](https://github.com/maritonx/easy-cms/issues/69) | Test the shop end to end with Stripe in test mode | area:plugins | `examples/shop`: ตะกร้า → Checkout → webhook → order paid, ตัดสต็อก, อีเมล |
| [#70](https://github.com/maritonx/easy-cms/issues/70) | Ubuntu canary (2026-10-20) | area:release | ติดตั้งและรันตาม Getting started บน Ubuntu ผ่าน หรือมี issue ของสิ่งที่พัง |
| [#71](https://github.com/maritonx/easy-cms/issues/71) | Security self-review against OWASP ASVS level 1 | area:security, release-blocker | ไล่ checklist ครบ, ข้อที่ไม่ผ่านแก้แล้วหรือมี issue, ผลบันทึกใน `docs/` |
| [#72](https://github.com/maritonx/easy-cms/issues/72) | Clear `pnpm audit` findings | area:security | ไม่มี high/critical ใน dependency ที่ติดไปกับแพ็กเกจที่ publish |
| [#73](https://github.com/maritonx/easy-cms/issues/73) | A working private channel for reporting vulnerabilities | area:security, area:docs | `SECURITY.md` ชี้ไปที่ GitHub private vulnerability reporting (เจ้าของ repo เปิดใน Settings เอง) และบอกระยะเวลาตอบกลับ |
| [#113](https://github.com/maritonx/easy-cms/issues/113) | Pin the Stripe API version and cap the stripe peer range | area:plugins, release-blocker | adapter ส่ง `apiVersion` คงที่, peer `stripe` มีเพดานบน, เทสกับ major ต่ำสุดและสูงสุดที่รองรับ |
| [#114](https://github.com/maritonx/easy-cms/issues/114) | Test the GraphQL plugin against graphql 16 and 17 | area:plugins, release-blocker | CI รันเทสของ plugin กับ graphql 16 และ 17 |
| [#115](https://github.com/maritonx/easy-cms/issues/115) | Test the MCP server through the real MCP SDK client, every tool | area:plugins, release-blocker | เทสต่อผ่าน client ของ `@modelcontextprotocol/sdk` และเรียกครบทุก tool |
| [#128](https://github.com/maritonx/easy-cms/issues/128) | Run the Nuxt e2e suite against a production build | area:release | e2e ของ Nuxt รันจาก production build พร้อม migration, retry รายงานข้อที่ล้มจริง, ผ่านโดยไม่ต้อง retry |

### M2 — `API freeze` (2026-11-20) {#m2}

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#74](https://github.com/maritonx/easy-cms/issues/74) | Review the public API before freezing it | area:core, release-blocker | ไล่ config, Local API, REST, GraphQL, props ของ admin component และ field type: ชื่อสอดคล้องกัน, ไม่มีของที่ไม่ตั้งใจให้เป็น public ใน exports; ทุกการเปลี่ยนอยู่ใน changeset ของ 0.60 |
| [#75](https://github.com/maritonx/easy-cms/issues/75) | Plugin contract version on the server (`definePlugin({ apiVersion: 1 })`) | area:core, area:plugins | ไม่บังคับ; ถ้าเลขไม่ตรงกับที่ core รองรับ core หยุดตอนเริ่มพร้อมข้อความว่าต้องอัปเกรดอะไร; plugin ใน repo ประกาศ `apiVersion: 1` |
| [#76](https://github.com/maritonx/easy-cms/issues/76) | Upgrade test: databases from older 0.x releases migrate to the current version | area:core, release-blocker | test อัตโนมัติใน CI สร้างฐานข้อมูลด้วย 0.x รุ่นเก่า (SQLite และ Postgres) แล้ว migrate ขึ้นเวอร์ชันปัจจุบัน ข้อมูล, versions, media ครบ |
| [#77](https://github.com/maritonx/easy-cms/issues/77) | Versioning and deprecation policy page, and a helper that warns once | area:docs, area:core | หน้าแยกในเอกสาร (ย้ายจาก Backups & upgrades) + helper ใน core ที่เตือนครั้งเดียวต่อ process เมื่อใช้ API ที่ deprecate |
| [#78](https://github.com/maritonx/easy-cms/issues/78) | Mark the ecommerce, GraphQL and MCP plugins as experimental | area:docs, area:plugins | README และหน้าเอกสารของทั้งสามมีป้าย experimental และอธิบายว่ายกเว้นจากสัญญาความเสถียร |

### M3 — `1.0.0-rc` (2026-12-01) {#m3}

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#79](https://github.com/maritonx/easy-cms/issues/79) | Enter changesets pre mode and release 1.0.0-rc.0 | area:release, release-blocker | `changeset pre enter rc`, ทุกแพ็กเกจออก `1.0.0-rc.0` ด้วย dist-tag `rc` (ไม่แตะ `latest`), template ของปุ่ม Deploy ยังใช้เวอร์ชันเสถียร |
| [#80](https://github.com/maritonx/easy-cms/issues/80) | Run Getting started from scratch on a clean machine: Next.js, Nuxt, standalone | area:docs, release-blocker | ทำตามเอกสารคำต่อคำกับ RC ได้ทั้งสามแบบโดยไม่ต้องเดา; แก้เอกสารที่ไม่ตรง |
| [#81](https://github.com/maritonx/easy-cms/issues/81) | Upgrade guide from 0.x to 1.0 | area:docs, release-blocker | หน้าในเอกสาร (EN/TH): สิ่งที่เปลี่ยนใน 0.60, ขั้นตอน backup → อัปเกรด → migrate |
| [#82](https://github.com/maritonx/easy-cms/issues/82) | Smoke-test `create-easy-cms` against the RC with npm, pnpm, Yarn and Bun | area:release | smoke test ที่มีอยู่รันกับ `@rc` ผ่านทั้งสี่ตัว |
| [#116](https://github.com/maritonx/easy-cms/issues/116) | Automated end-to-end test of the Stripe webhook | area:plugins | e2e ส่ง event ที่เซ็นถูกต้อง → order paid, ตัดสต็อก, ส่งซ้ำไม่เปลี่ยนอะไร |
| [#117](https://github.com/maritonx/easy-cms/issues/117) | Test the React and Vue shop hooks | area:plugins | เทส hook ของตะกร้าและ checkout ทั้ง React และ Vue |
| [#118](https://github.com/maritonx/easy-cms/issues/118) | Review the PaymentAdapter contract against what Omise needs | area:plugins, area:docs | เอกสารใน `docs/` เทียบ flow ของ Omise กับ `definePaymentAdapter`, ส่วนที่ต้องแก้ทำใน 1.1 |
| [#119](https://github.com/maritonx/easy-cms/issues/119) | Snapshot the generated GraphQL schema | area:plugins | SDL จาก config ที่ใช้ทุกชนิด field เทียบกับ snapshot ใน repo |
| [#120](https://github.com/maritonx/easy-cms/issues/120) | Test the GraphQL API with a real client and codegen | area:plugins | urql (หรือ Apollo) + GraphQL Code Generator ทำงานตาม `graphql.md`; แก้เอกสารที่ไม่ตรง |
| [#121](https://github.com/maritonx/easy-cms/issues/121) | Test the MCP server with Claude Desktop | area:plugins | Claude Desktop (และ Claude Code) ต่อด้วย API key ตาม `mcp.md`, อ่าน ร่าง publish ได้; แก้เอกสารที่ไม่ตรง |
| [#122](https://github.com/maritonx/easy-cms/issues/122) | Write down when an experimental package becomes stable | area:docs | หน้า versioning (EN/TH) มีเกณฑ์: ทดสอบกับของจริง, ไม่ breaking 3 minor ติดกัน, CI ครอบคลุมทุก option |

### M4 — `1.0.0` (2026-12-15) {#m4}

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#83](https://github.com/maritonx/easy-cms/issues/83) | Exit pre mode and release 1.0.0 | area:release, release-blocker | `changeset pre exit`, ทุกแพ็กเกจเป็น `1.0.0` บน `latest`, git tag และ GitHub release |
| [#84](https://github.com/maritonx/easy-cms/issues/84) | The website shows the 1.0 docs and a release announcement | area:docs | เว็บ build จาก 1.0.0 และมีหน้าประกาศ (เปิดให้กลับไปทำงานเว็บได้ที่ milestone นี้) |
| [#85](https://github.com/maritonx/easy-cms/issues/85) | Update SRS and DESIGN for 1.0 | area:docs | SRS §8 และ DESIGN §15 บันทึก 1.0, สัญญาความเสถียร, นโยบายการซัพพอร์ต |

### M5 — `Multi-instance & operations` (ไม่กำหนดวัน) {#m5}

ปิดสิ่งที่ทำให้รันหลาย instance ไม่ได้หรือดูแลระบบไม่ได้ ตาม [ADR-0051](adr/0051-reference-architecture.md) ไม่มีฟีเจอร์ใหม่ที่ผู้ใช้เห็น

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#153](https://github.com/maritonx/easy-cms/issues/153) | Claim scheduled jobs and webhook deliveries with `SKIP LOCKED` | area:core, release-blocker | เทสต์สอง instance บน Postgres เดียวกัน: ทุกงานรันครั้งเดียว; งานของ worker ที่ตายกลับเข้าคิวเมื่อ lease หมด ([ADR-0052](adr/0052-postgres-job-queue.md)) |
| [#154](https://github.com/maritonx/easy-cms/issues/154) | Run two instances against one Postgres in CI | area:core, area:release | CI รัน REST, login, upload ไป S3 และ jobs ผ่านสอง instance หลังตัวกระจายโหลด |
| [#155](https://github.com/maritonx/easy-cms/issues/155) | Configurable Postgres pool and `prepare`, tested behind PgBouncer | area:core | ตั้ง `prepare`, `statementTimeoutMs`, `idleTimeoutMs`, `connectTimeoutMs`, `applicationName` (ค่าปริยาย `'easy-cms'`) ได้, CI รันเทสต์หลักผ่าน PgBouncer แบบ transaction pooling, เอกสารมีสูตรจำนวน connection และคำเตือนสำหรับ serverless ([ADR-0055](adr/0055-database-isolation.md)) |
| [#156](https://github.com/maritonx/easy-cms/issues/156) | Document database isolation levels and test a separate schema | area:docs, area:core | หน้า "Database isolation" (EN/TH) อธิบาย L0–L3, CI รันบน role ที่มี `search_path` เป็น schema ของตัวเอง และตรวจว่าไม่มีตารางใน `public` |
| [#157](https://github.com/maritonx/easy-cms/issues/157) | JSON logs with a request id | area:core | ตัวเลือกให้ log เป็น JSON บรรทัดละรายการ มี request id ที่ส่งกลับใน header ด้วย; ค่าปริยายยังอ่านง่ายสำหรับ dev |
| [#158](https://github.com/maritonx/easy-cms/issues/158) | `/healthz` and `/readyz` in the Next and Nuxt adapters | area:adapters | สอง endpoint ทำงานเหมือน standalone; `/readyz` เช็กฐานข้อมูลและ migration |
| [#159](https://github.com/maritonx/easy-cms/issues/159) | Official Docker image | area:release | image ที่ build ใน CI สำหรับ `easy-cms serve`, รันเป็น non-root, ติด tag ตามเวอร์ชัน, เอกสาร docker ใช้ image นี้ |
| [#160](https://github.com/maritonx/easy-cms/issues/160) | Document the reference architecture and what is not supported | area:docs | หน้า deploy (EN/TH) บอกชุดที่รับรองและข้อจำกัดของ SQLite/local disk |
| [#161](https://github.com/maritonx/easy-cms/issues/161) | Load test at 1M documents | area:release | `load.ts` seed ได้ถึง 1M เอกสาร, workflow รายคืนเก็บผลและเตือนเมื่อ p95 ช้าลงเกิน 20%; ตัวเลขแรกบันทึกใน SRS |
| [#162](https://github.com/maritonx/easy-cms/issues/162) | Truthful `SECURITY.md`, Dependabot and CodeQL | area:security | `SECURITY.md` ตรงกับ 1.x, มี Dependabot และ CodeQL ใน `.github/`, เปิด secret scanning ใน Settings |

### M6 — `Security & identity` (ไม่กำหนดวัน) {#m6}

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#163](https://github.com/maritonx/easy-cms/issues/163) | Require single sign-on for everyone (turn off password login) | area:security | ตัวเลือกปิด login ด้วยรหัสผ่านทุกคน ยกเว้นบัญชีฉุกเฉินที่ระบุ ([ADR-0063](adr/0063-break-glass-passwords.md)) |
| [#164](https://github.com/maritonx/easy-cms/issues/164) | Map identity-provider groups to roles | area:security | claim กลุ่มจาก OIDC แมปเป็นบทบาท อัปเดตทุกครั้งที่ login, ทดสอบกับ Entra ID |
| [#165](https://github.com/maritonx/easy-cms/issues/165) | TOTP two-factor sign-in for password accounts | area:security | ตั้งและบังคับ TOTP ได้, มีรหัสกู้คืน, admin รีเซ็ตให้คนอื่นได้ และบันทึกใน audit log |
| [#166](https://github.com/maritonx/easy-cms/issues/166) | Sign webhook timestamps to stop replays | area:core, area:security | ลายเซ็นครอบ timestamp, เอกสารบอกวิธีตรวจและช่วงเวลาที่ยอมรับ ([ADR-0060](adr/0060-webhook-signature-v2.md)) |
| [#167](https://github.com/maritonx/easy-cms/issues/167) | Rotate `EASY_CMS_SECRET` without logging everyone out | area:security | รับ secret เก่าและใหม่พร้อมกันช่วงหนึ่ง, เอกสารขั้นตอนหมุน ([ADR-0061](adr/0061-secret-rotation.md)) |
| [#172](https://github.com/maritonx/easy-cms/issues/172) | `schema` option for `@easy-cms/db-postgres` | area:core | ตารางทั้งหมดใช้ `pgSchema()`, คำสั่ง CLI ย้ายตารางของระบบที่ติดตั้งแล้วไป schema ใหม่ พร้อมเทสต์อัปเกรด |
| [#173](https://github.com/maritonx/easy-cms/issues/173) | Run with a database role that can only read and write data | area:core, area:security | `verify()` ไม่ใช้ DDL, เอกสารให้ `easy-cms migrate` ใช้ role เจ้าของ schema, CI รัน runtime ด้วย role ที่มีแค่ DML |
| [#168](https://github.com/maritonx/easy-cms/issues/168) | Rate limit the API | area:core, area:security | จำกัดต่อ IP และต่อ API key ได้ เก็บในฐานข้อมูลเพื่อใช้ได้หลาย instance ([ADR-0062](adr/0062-rate-limit.md)) |
| [#169](https://github.com/maritonx/easy-cms/issues/169) | OpenSSF Scorecard | area:security | workflow และ badge ใน README |
| [#170](https://github.com/maritonx/easy-cms/issues/170) | Security self-review against OWASP ASVS level 2 | area:security | ไล่ ASVS 4.0.3 L2 ทีละข้อ อ้างเลขข้อจากเอกสารจริง, ผลใน `docs/security/` แทนฉบับ L1 |

### M7 — `Scale (1M documents)` (ไม่กำหนดวัน) {#m7}

ทุกงานวัดกับ load test 1M เอกสาร ([#161](https://github.com/maritonx/easy-cms/issues/161)) ก่อนและหลัง

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#174](https://github.com/maritonx/easy-cms/issues/174) | Cache published public reads with ETag and cache tags | area:core, area:adapters | `ETag`, `s-maxage`, `stale-while-revalidate` ต่อ collection, purge ด้วย tag ต่อกับ Next และ Nuxt ([ADR-0054](adr/0054-http-cache-not-redis.md)) |
| [#175](https://github.com/maritonx/easy-cms/issues/175) | Cursor pagination for REST and the Local API | area:core | `?cursor=` คืน cursor ถัดไป, offset ยังใช้ได้แต่ API public จำกัดความลึก |
| [#176](https://github.com/maritonx/easy-cms/issues/176) | Trigram indexes for `like` and `contains` on Postgres | area:core | `index: 'trigram'` สร้าง GIN `pg_trgm`, ค้นภาษาไทยได้, load test แสดงผลต่าง |
| [#177](https://github.com/maritonx/easy-cms/issues/177) | Search adapter interface | area:plugins | `SearchAdapter` ใน core พร้อม `memorySearch()` ที่ตัดคำไทยด้วย `Intl.Segmenter` ส่วน adapter ของ search engine ภายนอกแยกไปทำทีหลัง ([ADR-0056](adr/0056-search-adapter.md)) |
| [#178](https://github.com/maritonx/easy-cms/issues/178) | Opt-in outbox for `afterChange` and webhooks | area:core | ตัวเลือกใน config ตาม [ADR-0053](adr/0053-outbox-for-after-hooks.md), เอกสารเรื่อง hook ที่รันซ้ำได้ |
| [#179](https://github.com/maritonx/easy-cms/issues/179) | OpenTelemetry traces and metrics | area:core | peer dependency แบบเลือกใช้, span ของ request และ query, metrics ของคิวงาน ([ADR-0057](adr/0057-opentelemetry-api-only.md)) |
| [#257](https://github.com/maritonx/easy-cms/issues/257) | Faster relationship filters, queries inside blocks, and saves under load at 1M | area:core, area:adapters | index คู่กับ `status`, `like` ขั้นต่ำ 3 ตัวอักษรบน field แบบ trigram, `writeConnections`, วิธีค้นในบล็อกในเอกสาร ([ADR-0058](adr/0058-slow-paths-at-1m.md)) |

### M8 — `Admin lists & shop` (ไม่กำหนดวัน) {#m8}

ย้ายออกจาก M6 (2026-10-29) ให้ M6 เหลือแต่ความปลอดภัย งานรายการใน admin ออกแบบพร้อมกัน ทำตามลำดับ: #88 → #87 → #271 → #272 → #89
(ปฏิทินใช้ตัวกรองและ saved views ร่วมกับหน้ารายการ และต้องให้ admin แสดงเวลาตาม `config.timeZone` ก่อน)

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#86](https://github.com/maritonx/easy-cms/issues/86) | Omise payments for the shop: PromptPay, cards, mobile banking | area:plugins | |
| [#87](https://github.com/maritonx/easy-cms/issues/87) | Saved list views in the admin | area:admin | |
| [#88](https://github.com/maritonx/easy-cms/issues/88) | List filters with several conditions | area:admin | |
| [#271](https://github.com/maritonx/easy-cms/issues/271) | Show admin dates in config.timeZone | area:admin | ทุกวันที่และช่องกรอกวันที่ใน admin ใช้ `config.timeZone` เมื่อตั้งไว้ |
| [#272](https://github.com/maritonx/easy-cms/issues/272) | Calendar view for collections and scheduled publishing | area:admin | โหมดปฏิทินในหน้ารายการ (`admin.calendar`) และหน้า Content calendar: เดือน/สัปดาห์/วัน/agenda, ลากเปลี่ยนวันพร้อมทางเลือกด้วยคีย์บอร์ด, สร้างจากช่องว่าง |
| [#89](https://github.com/maritonx/easy-cms/issues/89) | Export a list to CSV | area:admin | |

---

## 3. 1.x: open source ที่องค์กร self-host ได้ {#one-x}

ตกลงเมื่อ 2026-10-18 หลังทบทวนจุดแข็งจุดอ่อนเทียบกับ Strapi, Payload, Directus และ WordPress

- **เป้าหมาย:** องค์กรเอาไป self-host เองได้อย่างมั่นใจ วัดจากคุณภาพทางเทคนิค ไม่มีสัญญาหรือ SLA
- **สถาปัตยกรรมอ้างอิง:** Postgres + storage แบบ S3 + app stateless หลาย instance ([ADR-0051](adr/0051-reference-architecture.md)); SQLite และ local disk สำหรับ dev และ instance เดียว
- **ขนาดเป้าหมาย:** 1M เอกสารต่อ collection, editor พร้อมกัน 200 คน, API p95 ต่ำกว่า 200 ms
- **ไม่เพิ่ม infra:** คิวงานใช้ Postgres ([ADR-0052](adr/0052-postgres-job-queue.md)), cache ใช้ HTTP/CDN ([ADR-0054](adr/0054-http-cache-not-redis.md))
- **multi-tenant:** แนะนำ CMS แยกต่อลูกค้า (instance-per-client) เป็นหลัก ส่วน plugin เหมาะกับหลายเว็บในเครือเดียวกัน
- **localization:** เก็บแบบคอลัมน์ต่อภาษาต่อไป เหมาะกับไม่เกิน 5 ภาษา
- **ผู้ดูแล:** หา co-maintainer เพื่อลดการพึ่งคนเดียว

---

## 4. หลัง 1.0 (ยังไม่ได้ตัดสินใจ, ไม่สร้างเป็น issue) {#later}

- **ร้านค้า:** Stripe Checkout, ตะกร้าแบบ web component, กันสต็อกระหว่างชำระเงิน, ค่าส่ง/VAT/คูปองสำเร็จรูป,
  สมาชิกรายเดือน, บัญชี Stripe แยกต่อ tenant
- **Admin:** layout ภายใน group/array, dashboard ที่ปรับแต่งได้, ค่าที่ผู้ใช้ตั้งเก็บบน server, โหมดกระชับ,
  กู้คืนหลังลบ, แก้เมนูจากหน้า admin, ลากวางเพื่อย้ายหรือเรียงหน้าย่อย, ซ่อนหรือเรียงกล่องในตัวของแดชบอร์ด
- **MCP:** แบบ stdio (`easy-cms mcp`), OAuth สำหรับ client ที่ส่ง header ไม่ได้
- **อัปโหลดจากลิงก์:** proxy ขาออก (`HTTP_PROXY`), ดึงรูปอัตโนมัติเมื่อวางเนื้อหาลงใน rich text
- **SEO:** FAQPage JSON-LD, ตรวจคุณภาพเนื้อหา
- **Runtime:** Bun (`bun --bun easy-cms serve`), Yarn Plug'n'Play
- **หน้าย่อย:** ไล่อัปเดตผ่านคิวงาน ([ADR-0052](adr/0052-postgres-job-queue.md)) สำหรับต้นไม้ขนาดใหญ่
- **Redirects:** export เป็น `_redirects`/`vercel.json`, นำเข้าจาก CSV, pattern/wildcard
- **SSO:** SAML (เปิดให้ทำเป็น plugin ของ community), SCIM, WebAuthn/passkey
- **Audit log:** ส่งออกแบบ real-time (syslog, SIEM)
- **Deploy คลิกเดียว:** template สำหรับ Nuxt, ปุ่มบน[เว็บไซต์](https://easy-cms-website.vercel.app)
- **บทบาท:** สิทธิ์ของ field ย่อยใน group/array/blocks, กำหนดเจ้าของทีละหลายเอกสาร, ผู้ใช้หลายบทบาท
- **ความปลอดภัย:** pentest โดยภายนอก
- **Scale:** outbox เป็นค่าปริยายใน 2.0, cache ใน Redis แบบเลือกใช้ถ้า load test บอกว่าจำเป็น, read replica, multi-region
