# Easy CMS — Roadmap ถึง 1.0

- **สถานะ:** Accepted
- **วันที่:** 2026-10-09
- **เวอร์ชันปัจจุบัน:** 0.47.1
- **เป้าหมาย:** 1.0.0 วันที่ 2026-12-15
- **ติดตามงาน:** GitHub Milestones ของ `maritonx/easy-cms` (หนึ่ง issue ต่อหนึ่งงาน, issue เขียนเป็นภาษาอังกฤษ)

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
- **การซัพพอร์ต:** 0.x หยุดซัพพอร์ตเมื่อ 1.0 ออก, แก้ช่องโหว่ใน minor ล่าสุดของ 1.x,
  เมื่อมี 2.0 แล้ว 1.x ได้แพตช์ความปลอดภัยอีก 6 เดือน

**Feature freeze:** ตั้งแต่วันนี้ถึง 1.0 รับเฉพาะการแก้บั๊ก งานใน milestone และการปรับ API ในเฟส 0.60
ไอเดียใหม่ใส่ใน [1.1](#m5) หรือ [หลัง 1.0](#later)

---

## 2. Milestones

| Milestone | ครบกำหนด | เป้าหมาย |
|---|---|---|
| [`0.50 · Hardening`](https://github.com/maritonx/easy-cms/milestone/1) | 2026-10-30 | ทดสอบกับบริการจริง, ความปลอดภัย, release ที่ปลอดภัย |
| [`0.60 · API freeze`](https://github.com/maritonx/easy-cms/milestone/2) | 2026-11-20 | ทบทวนและล็อก API, ทดสอบการอัปเกรด, นโยบายเวอร์ชัน |
| [`1.0.0-rc`](https://github.com/maritonx/easy-cms/milestone/3) | 2026-12-01 | RC, เอกสารเริ่มต้นและอัปเกรด, รับเฉพาะการแก้บั๊ก |
| [`1.0.0`](https://github.com/maritonx/easy-cms/milestone/4) | 2026-12-15 | ออก 1.0 และประกาศ |
| [`1.1`](https://github.com/maritonx/easy-cms/milestone/5) | — | ฟีเจอร์แรกหลัง 1.0 |

### Labels

`area:core`, `area:admin`, `area:adapters`, `area:plugins`, `area:release`, `area:docs`, `area:security`
และ `release-blocker` (ต้องเสร็จก่อนออกเวอร์ชันของ milestone นั้น)

---

### M1 — `0.50 · Hardening` (2026-10-30) {#m1}

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

### M2 — `0.60 · API freeze` (2026-11-20) {#m2}

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
| [#79](https://github.com/maritonx/easy-cms/issues/79) | Enter changesets pre mode and release 1.0.0-rc.1 | area:release, release-blocker | `changeset pre enter rc`, ทุกแพ็กเกจออก `1.0.0-rc.1` ด้วย dist-tag `next` (ไม่แตะ `latest`) |
| [#80](https://github.com/maritonx/easy-cms/issues/80) | Run Getting started from scratch on a clean machine: Next.js, Nuxt, standalone | area:docs, release-blocker | ทำตามเอกสารคำต่อคำกับ RC ได้ทั้งสามแบบโดยไม่ต้องเดา; แก้เอกสารที่ไม่ตรง |
| [#81](https://github.com/maritonx/easy-cms/issues/81) | Upgrade guide from 0.x to 1.0 | area:docs, release-blocker | หน้าในเอกสาร (EN/TH): สิ่งที่เปลี่ยนใน 0.60, ขั้นตอน backup → อัปเกรด → migrate |
| [#82](https://github.com/maritonx/easy-cms/issues/82) | Smoke-test `create-easy-cms` against the RC with npm, pnpm, Yarn and Bun | area:release | smoke test ที่มีอยู่รันกับ `@next` ผ่านทั้งสี่ตัว |

### M4 — `1.0.0` (2026-12-15) {#m4}

| # | Issue | Labels | เสร็จเมื่อ |
|---|---|---|---|
| [#83](https://github.com/maritonx/easy-cms/issues/83) | Exit pre mode and release 1.0.0 | area:release, release-blocker | `changeset pre exit`, ทุกแพ็กเกจเป็น `1.0.0` บน `latest`, git tag และ GitHub release |
| [#84](https://github.com/maritonx/easy-cms/issues/84) | The website shows the 1.0 docs and a release announcement | area:docs | เว็บ build จาก 1.0.0 และมีหน้าประกาศ (เปิดให้กลับไปทำงานเว็บได้ที่ milestone นี้) |
| [#85](https://github.com/maritonx/easy-cms/issues/85) | Update SRS and DESIGN for 1.0 | area:docs | SRS §8 และ DESIGN §15 บันทึก 1.0, สัญญาความเสถียร, นโยบายการซัพพอร์ต |

### M5 — `1.1` (ไม่กำหนดวัน) {#m5}

| # | Issue | Labels |
|---|---|---|
| [#86](https://github.com/maritonx/easy-cms/issues/86) | Omise payments for the shop: PromptPay, cards, mobile banking | area:plugins |
| [#87](https://github.com/maritonx/easy-cms/issues/87) | Saved list views in the admin | area:admin |
| [#88](https://github.com/maritonx/easy-cms/issues/88) | List filters with several conditions | area:admin |
| [#89](https://github.com/maritonx/easy-cms/issues/89) | Export a list to CSV | area:admin |

---

## 3. หลัง 1.0 (ยังไม่ได้ตัดสินใจ, ไม่สร้างเป็น issue) {#later}

- **ร้านค้า:** Stripe Checkout, ตะกร้าแบบ web component, กันสต็อกระหว่างชำระเงิน, ค่าส่ง/VAT/คูปองสำเร็จรูป,
  สมาชิกรายเดือน, บัญชี Stripe แยกต่อ tenant
- **Admin:** layout ภายใน group/array, dashboard ที่ปรับแต่งได้, ค่าที่ผู้ใช้ตั้งเก็บบน server, โหมดกระชับ,
  กู้คืนหลังลบ, แก้เมนูจากหน้า admin, ลากวางเพื่อย้ายหรือเรียงหน้าย่อย, ซ่อนหรือเรียงกล่องในตัวของแดชบอร์ด
- **MCP:** แบบ stdio (`easy-cms mcp`), OAuth สำหรับ client ที่ส่ง header ไม่ได้
- **อัปโหลดจากลิงก์:** proxy ขาออก (`HTTP_PROXY`), ดึงรูปอัตโนมัติเมื่อวางเนื้อหาลงใน rich text
- **SEO:** FAQPage JSON-LD, ตรวจคุณภาพเนื้อหา
- **Runtime:** Bun (`bun --bun easy-cms serve`), Yarn Plug'n'Play
- **หน้าย่อย:** ไล่อัปเดตผ่าน job queue สำหรับต้นไม้ขนาดใหญ่
- **Redirects:** export เป็น `_redirects`/`vercel.json`, นำเข้าจาก CSV, pattern/wildcard
- **SSO:** แมปบทบาทจากกลุ่มฝั่งผู้ให้บริการ, SAML
- **Audit log:** ส่งออกแบบ real-time (syslog, SIEM)
- **Deploy คลิกเดียว:** template สำหรับ Nuxt, ปุ่มบน[เว็บไซต์](https://easy-cms-website.vercel.app)
- **บทบาท:** สิทธิ์ของ field ย่อยใน group/array/blocks, กำหนดเจ้าของทีละหลายเอกสาร, ผู้ใช้หลายบทบาท
- **ความปลอดภัย:** pentest โดยภายนอกเมื่อมีผู้ใช้ production จริง
