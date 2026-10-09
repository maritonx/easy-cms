# เวอร์ชันและการเลิกใช้

::: info หน้านี้สอนอะไร
เลขเวอร์ชันสัญญาอะไร สัญญาครอบคลุมส่วนไหนของ Easy CMS ชื่อเก่าถูกเลิกใช้อย่างไร และแต่ละ release
ได้รับการแก้ช่องโหว่นานเท่าไร

**ควรอ่านก่อน:** [การอัปเกรด](./upgrading)
:::

Easy CMS ใช้ [semantic versioning](https://semver.org) แพ็กเกจ `@easy-cms/*`, `easy-cms` และ
`create-easy-cms` ทุกตัวออกพร้อมกันด้วยเลขเวอร์ชันเดียวกัน จึงควรอัปเกรดพร้อมกัน

## เลขเวอร์ชันสัญญาอะไร

- **ก่อน 1.0 (ตอนนี้):** minor release (0.60 → 0.61) อาจเปลี่ยน API, config หรือคำตอบของ REST
  changelog และ[คู่มืออัปเกรด](./upgrading)จะบอกว่าเปลี่ยนอะไรและต้องแก้อย่างไร ส่วน patch release
  (0.60.0 → 0.60.1) แก้บั๊กอย่างเดียว
- **ตั้งแต่ 1.0:** breaking change มีเฉพาะใน major release (1.x → 2.0) พร้อมคู่มืออัปเกรด
  minor release เพิ่มความสามารถ ส่วน patch release แก้บั๊ก

## สัญญาครอบคลุมอะไร

| ครอบคลุม | ไม่ครอบคลุม |
| --- | --- |
| `@easy-cms/core` และ `@easy-cms/core/plugin`: สิ่งที่ export และ type | `@easy-cms/core/internal` และ `@easy-cms/drizzle` ที่แพ็กเกจใช้ร่วมกัน |
| option ของ config ที่คุณตั้ง และรูปร่างของ `cms.config` ตามเอกสาร | ค่าเริ่มต้นที่เติมใน `cms.config` ซึ่งอาจเพิ่มขึ้น |
| [Local API](/th/reference/local-api) | `cms.db`: adapter ที่อยู่ใต้กฎสิทธิ์และ hook |
| route ของ REST และคำตอบ, `code` ของ error | `<api>/admin/ui/*` ที่หน้า admin ใช้อย่างเดียว |
| คำสั่ง CLI และ option | หน้าตาและข้อความของ admin |
| ข้อมูลของคุณ: การอัปเกรดจะ migrate ไปข้างหน้า | สมาชิกที่ติด `@internal` ซึ่งไม่อยู่ใน type ที่เผยแพร่ |
| adapter และ option | [แพ็กเกจทดลอง](#experimental) |

ทุกการเปลี่ยนแปลงถูกทดสอบกับฐานข้อมูลที่สร้างด้วย release เก่า (ตั้งแต่ 0.10) และ release ล่าสุด ทั้ง SQLite
และ Postgres: migrate ด้วย `easy-cms migrate` แล้วอ่านเอกสาร version และไฟล์กลับมาได้ครบ

การแก้ช่องโหว่อาจทำให้สิ่งที่อยู่ใต้สัญญาเปลี่ยนไปได้ เมื่อไม่มีทางอื่น changelog จะบอกไว้

## แพ็กเกจทดลอง {#experimental}

[`@easy-cms/plugin-ecommerce`](./ecommerce), [`@easy-cms/plugin-graphql`](./graphql) และ
[`@easy-cms/plugin-mcp`](./mcp) ใช้เลขเวอร์ชันเดียวกันแต่ไม่อยู่ใต้สัญญา option, endpoint และข้อมูล
อาจเปลี่ยนใน minor release ได้ แม้หลัง 1.0 หน้าเอกสารและ README ของแต่ละตัวมีป้ายบอกไว้ด้านบน
เมื่อนิ่งแล้วจะออกจากรายการนี้ใน minor release

## การเลิกใช้ {#deprecations}

เมื่อชื่อใดเปลี่ยนใน minor release ชื่อเดิมยังใช้ได้จนถึง major ถัดไป และขึ้นคำเตือน**ครั้งเดียวต่อ process**
พร้อมรหัส:

```
(node:4242) [EASY_CMS_DEP001] DeprecationWarning: POST <api>/users/login is now <api>/auth/login; the old path works through 1.x.
```

คำเตือนเป็น deprecation warning ของ Node.js จึงใช้ flag ของ Node ได้:

- `node --no-deprecation` ซ่อนคำเตือน
- `node --throw-deprecation` ทำให้เป็น error ใช้ใน CI เพื่อหาว่ายังมีอะไรใช้ชื่อเก่าอยู่
- `node --trace-deprecation` แสดงว่าแต่ละคำเตือนมาจากไหน

ตั้งผ่าน `NODE_OPTIONS` ได้ เช่น `NODE_OPTIONS=--throw-deprecation npm test`

option ของ config เป็นข้อยกเว้นก่อน 1.0: option ที่เปลี่ยนชื่อจะหยุดการเริ่มทำงานและบอกชื่อใหม่แทน
(``admin.siteUrl: is now `siteURL` ``) เพราะแก้ config ได้เร็ว และ option ที่ถูกข้ามไปจะไม่ทำอะไรเลยโดยไม่มีใครรู้

### รายการที่เลิกใช้ตอนนี้

| รหัส | เดิม | ใหม่ | ถอดออก |
| --- | --- | --- | --- |
| `EASY_CMS_DEP001` | `<api>/users/<action>` (`login`, `me`, `init`, …) | `<api>/auth/<action>` | 2.0 |
| `EASY_CMS_DEP002` | `POST <api>/globals/<slug>` | `PATCH` | 2.0 |
| `EASY_CMS_DEP003` | `?fallback-locale=` | `?fallbackLocale=` | 2.0 |
| `EASY_CMS_DEP004` | `easy-cms create-admin` | `easy-cms admin:create` | 2.0 |
| `EASY_CMS_DEP005` | `easy-cms run-scheduled` | `easy-cms jobs:run` | 2.0 |

### ใน plugin ของคุณ

`warnDeprecated(code, message)` จาก `@easy-cms/core` (หรือ `@easy-cms/core/plugin`) ทำแบบเดียวกันกับชื่อของคุณเอง
ให้ใช้รหัสของคุณเอง:

```ts
import { warnDeprecated } from '@easy-cms/core/plugin'

export function acmePlugin(options: { apiKey?: string; key?: string }) {
  if (options.key !== undefined)
    warnDeprecated('ACME_DEP001', '`acmePlugin({ key })` is now `apiKey`; `key` goes in 2.0.')
  const apiKey = options.apiKey ?? options.key
  // …
}
```

## การแก้ช่องโหว่

การแก้ช่องโหว่ออกให้ minor release ล่าสุด ตั้งแต่ 1.0 major ก่อนหน้าจะได้รับด้วยเป็นเวลาหกเดือนหลัง major
ใหม่ออก แจ้งช่องโหว่ตาม[นโยบายความปลอดภัย](https://github.com/maritonx/easy-cms/blob/main/SECURITY.md)

## ขั้นต่อไป

- [การอัปเกรด](./upgrading): แต่ละ release เปลี่ยนอะไร
- [Backup และการอัปเกรด](./backups): backup ก่อน deploy เวอร์ชันใหม่
