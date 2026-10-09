# ฟอร์ม {#forms}

::: info หน้านี้สอนอะไร
ให้ผู้แก้เนื้อหาสร้างฟอร์มในหน้า admin เอง (ติดต่อเรา สมัครกิจกรรม แบบสอบถาม) เก็บข้อมูลที่ผู้เข้าชมส่งมา
ได้อีเมลแจ้งทุกครั้งที่มีคนส่ง และกันบอท

**ควรอ่านก่อน:** [Plugins](./plugins) และ[อีเมล](./email)
:::

<Screenshot name="forms" alt="ฟอร์มติดต่อในหน้า admin พร้อมแถบข้อมูลที่ส่งมา" />

`@easy-cms/plugin-form-builder` เพิ่มเมนู **ฟอร์ม** ในหน้า admin ผู้แก้เนื้อหาต่อช่องกรอกจาก block เลือกว่าหลังส่งจะเกิดอะไร
และใครจะได้อีเมล ส่วนหน้าเว็บแสดงฟอร์มด้วย element เดียวคือ `<easy-form>` หรือวาดเองจาก API

```bash [pm]
npm install @easy-cms/plugin-form-builder
```

```ts
import { consoleEmail, defineConfig } from '@easy-cms/core'
import { formBuilderPlugin } from '@easy-cms/plugin-form-builder'

export default defineConfig({
  // …
  email: consoleEmail(), // หรือ smtp() จาก @easy-cms/email-smtp ดูหน้าอีเมล
  plugins: [formBuilderPlugin({ defaultTo: 'hello@example.com' })],
})
```

plugin เพิ่ม collection `forms` และ `form-submissions` ให้สร้าง migration ด้วย (`easy-cms migrate:create forms`)

## สร้างฟอร์ม {#building-a-form}

ฟอร์มหนึ่งมี:

- **ชื่อฟอร์ม** และ **slug**: หน้าเว็บหาฟอร์มจาก slug (เช่น `contact`)
- **ช่องกรอก** เป็น block: ข้อความ, ข้อความยาว, อีเมล, ตัวเลข, เบอร์โทร, ตัวเลือก (dropdown หรือ radio เลือกได้ข้อเดียวหรือหลายข้อ),
  ช่องติ๊ก (เช่น "ยอมรับเงื่อนไข"), วันที่ และข้อความอธิบาย (ข้อความคั่นระหว่างช่อง) แต่ละช่องมีชื่อในข้อมูล ป้าย
  ต้องกรอกหรือไม่ ข้อความตัวอย่าง ค่าเริ่มต้น และความกว้าง (เต็มหรือครึ่งแถว)
- **ปุ่มส่ง**
- **หลังส่ง**: แสดงข้อความ (rich text) หรือไปหน้าอื่น
- **อีเมลแจ้งเตือน**: ใครจะได้อีเมลเมื่อมีคนส่ง (ดูด้านล่าง)

ฟอร์มมีฉบับร่าง รับข้อมูลเฉพาะฟอร์มที่**เผยแพร่**แล้ว จึงเตรียมฟอร์มไว้ก่อนได้โดยยังไม่ขึ้นเว็บ ถ้าใช้
[หลายภาษา](./localization) ป้ายและข้อความแปลได้เหมือนเนื้อหาอื่น และผู้เข้าชมจะเห็นฟอร์มในภาษาของตัวเอง

แถบข้างของฟอร์มแสดงจำนวนข้อมูลที่ส่งมา ลิงก์ไปดู export เป็น CSV (มี byte-order mark ให้ Excel อ่านภาษาไทยได้)
และโค้ดสำหรับใส่ในหน้าเว็บ

## ในหน้าเว็บ {#on-your-pages}

<Screenshot name="form-page" alt="ฟอร์มบนหน้าเว็บ แสดงด้วย <easy-form>" />

`<easy-form>` เป็น Web Component ที่โหลดฟอร์ม แสดง ส่งให้ server ตรวจ และแสดงข้อความหลังส่ง render ใน light DOM
CSS ของเว็บจึงปรับหน้าตาได้ (class `easy-form__field`, `easy-form__input`, `easy-form__error`…) ส่วน `element.css`
เป็นค่าเริ่มต้นที่เลือกใช้ได้

::: code-group

```ts [Nuxt: app/plugins/easy-form.client.ts]
import '@easy-cms/plugin-form-builder/element'
import '@easy-cms/plugin-form-builder/element.css'

export default defineNuxtPlugin(() => {})

// nuxt.config.ts: vue: { compilerOptions: { isCustomElement: (tag) => tag === 'easy-form' } }
// ในหน้า: <ClientOnly><easy-form form="contact" /></ClientOnly>
```

```tsx [Next.js: client component]
'use client'
import { useEffect } from 'react'
import '@easy-cms/plugin-form-builder/element.css'

export function EasyForm({ form }: { form: string }) {
  useEffect(() => {
    void import('@easy-cms/plugin-form-builder/element')
  }, [])
  return <easy-form form={form} />
}
```

```html [หน้าเว็บใดก็ได้]
<!-- CMS เสิร์ฟ element ให้ด้วย สำหรับเว็บ static และ framework อื่น -->
<script type="module" src="https://cms.example.com/api/cms/form/element.js"></script>
<easy-form form="contact" api="https://cms.example.com/api/cms"></easy-form>
```

:::

| attribute | ค่าเริ่มต้น | |
|---|---|---|
| `form` | — | slug ของฟอร์ม |
| `api` | `/api/cms` | REST API เมื่อ CMS อยู่คนละ server |
| `locale` | `lang` ของหน้า | ภาษาของเนื้อหา ถ้าเป็นภาษาที่เว็บมี |

element ส่ง event `easy-form:submitted` (`event.detail.confirmation`) และ `easy-form:error`
(`event.detail.errors`) เช่น สำหรับ analytics

หน้าเว็บที่อยู่**คนละ origin** (แบบ [standalone](./standalone)) ต้องใส่ origin นั้นใน `cors` การส่งฟอร์มไม่มี cookie
จึงไม่ต้องใส่ใน `auth.trustedOrigins`

### วาดฟอร์มเอง {#rendering-it-yourself}

`@easy-cms/plugin-form-builder/client` มี API ชุดเดียวกันโดยไม่มี element สำหรับ component ของคุณเอง:

```ts
import { getForm, submitForm } from '@easy-cms/plugin-form-builder/client'

const form = await getForm('contact', { api: '/api/cms', locale: 'th' })
// form.fields: [{ kind, name, label, required, placeholder, options… }]

const result = await submitForm(
  'contact',
  { data: { name, email, message }, token: form.token, [form.honeypot]: '' },
  { api: '/api/cms' },
)
if (result.ok) show(result.confirmation) // { type: 'message', html } หรือ { type: 'redirect', url }
else showErrors(result.errors) // [{ field?, message }]
```

ส่ง `token` กลับไปตามที่ได้รับ และส่งช่อง `honeypot` ว่างไว้ (ดู[กันสแปม](#spam)) เบื้องหลังคือ
`GET <api>/form/:slug` และ `POST <api>/form/:slug/submit`

## ภาพรวมข้อมูลที่ส่งมา {#submissions-at-a-glance}

<Screenshot name="forms-overview" alt="ภาพรวมฟอร์ม: ข้อมูลที่ส่งมารายวัน และแยกตามฟอร์มพร้อมลิงก์ไปยังข้อมูลของแต่ละฟอร์ม" />

**ภาพรวมฟอร์ม** ในเมนูกลุ่มฟอร์ม (คู่กับฟอร์มและข้อมูลที่ส่งมา) แสดงข้อมูลที่ส่งมาใน 7 หรือ 30 วันล่าสุด: เป็นกราฟรายวัน และแยกตามฟอร์ม
พร้อมลิงก์ไปยังข้อมูลที่ส่งมาของแต่ละฟอร์ม แดชบอร์ดมีกล่องแสดงยอดรวม 7 วันล่าสุดและฟอร์มที่ได้รับมากที่สุด
วันนับตามเขตเวลาของผู้แก้ไข

ทั้งสองอ่านจาก `GET <api>/form/stats.json?days=7|30&tz=<เขตเวลา>` ในนามผู้ใช้ที่ login อยู่ จึงนับเฉพาะฟอร์มและ
ข้อมูลที่ผู้ใช้นั้นมีสิทธิ์อ่าน เป็น[หน้าและกล่องบนแดชบอร์ด](./plugins#pages-and-dashboard-panels)แบบเดียวกับที่
plugin ใดก็เพิ่มได้

## อีเมลแจ้งเตือน {#emails}

::: v-pre

แต่ละฟอร์มมีรายการ**อีเมล**ที่ส่งทุกครั้งที่มีคนส่งฟอร์ม ในหัวเรื่องและข้อความ `{{name}}` คือค่าของช่องนั้น และ `{{*}}`
คือตารางของทุกช่อง

- **ถึง** คือรายชื่ออีเมลคั่นด้วยจุลภาค ถ้าว่างจะใช้ `defaultTo` ของ plugin
- **ตอบกลับถึง** ใส่ `{{email}}` ได้ กดตอบกลับแล้วจะถึงคนที่ส่งฟอร์ม
- **ถึง `{{email}}`** ส่งอีเมลยืนยันให้คนที่ส่งฟอร์ม อีเมลแบบนี้ใส่ได้เฉพาะช่องสั้นๆ (ไม่มีข้อความยาว ไม่มี `{{*}}`)
  และตัดที่ 100 ตัวอักษร ไม่อย่างนั้นใครก็ใช้ฟอร์มนี้ส่งข้อความอะไรก็ได้ไปหาใครก็ได้

อีเมลส่งผ่าน [email adapter](./email) ใน config มีคิวและส่งซ้ำเมื่อส่งไม่สำเร็จ และใช้ภาษาที่ผู้เข้าชมใช้ตอนกรอก
:::

## กันสแปม {#spam}

ฟอร์มสาธารณะมักโดนบอท สิ่งเหล่านี้เปิดอยู่เสมอ:

- **honeypot**: ช่องที่ซ่อนไว้ คนมองไม่เห็นแต่บอทจะกรอก
- **เวลาขั้นต่ำ**: ฟอร์มที่ส่งเร็วกว่า 2 วินาทีหลังโหลด (`minSubmitTime`) ถือเป็นบอท
- **rate limit**: 5 ครั้งต่อ 10 นาทีต่อผู้เข้าชมต่อฟอร์ม (`rateLimit`) แยกผู้เข้าชมด้วย IP ที่เก็บเป็น hash ซึ่งเปลี่ยนทุกช่วงเวลา

บอทที่ติดกับดักจะได้ "ขอบคุณ" เหมือนคนทั่วไปแต่ข้อมูลไม่ถูกบันทึก บอทจึงไม่รู้ว่าต้องหลบอะไร

ถ้าต้องการมากกว่านั้น เปิด [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) ซึ่งตรวจว่าเป็นคนโดยไม่เก็บข้อมูลส่วนตัว
และส่วนใหญ่ไม่ต้องคลิกอะไร:

```ts
formBuilderPlugin({
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY,
    secretKey: process.env.TURNSTILE_SECRET_KEY,
  },
})
```

จากนั้น `<easy-form>` จะโหลดสคริปต์ของ Cloudflare ถ้าเว็บมี Content Security Policy ให้เพิ่ม
`https://challenges.cloudflare.com` ใน `script-src` และ `frame-src`

## ความเป็นส่วนตัว {#privacy}

ข้อมูลที่ส่งมาเก็บค่าที่กรอก หน้า และภาษา ไม่เก็บ IP ลบข้อมูลเก่าอัตโนมัติได้ด้วย `retentionDays` เช่น `retentionDays: 365`
และควรบอกผู้เข้าชมในฟอร์มว่าเก็บอะไรไปเพื่ออะไร (ช่อง**ข้อความอธิบาย**เหมาะกับเรื่องนี้) ตามที่ PDPA และ GDPR กำหนด

เฉพาะผู้ที่ login อ่านข้อมูลที่ส่งมาได้ และเฉพาะ admin ที่ลบได้ ไม่มีใครสร้างผ่าน REST API ได้ ข้อมูลมาจาก endpoint ของฟอร์ม
เท่านั้น หลังผ่านการตรวจข้อมูลและตัวกันสแปมแล้ว

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `defaultTo` | — | ผู้รับอีเมลเมื่อช่อง "ถึง" ว่าง |
| `defaultFrom` | `from` ของ adapter | ผู้ส่งเมื่ออีเมลไม่ได้ระบุ |
| `fields` | ทั้งหมด | ชนิดช่องที่ผู้แก้ใช้ได้ เช่น `['text', 'email', 'textarea']` |
| `rateLimit` | `{ max: 5, window: 600 }` | จำนวนครั้งต่อผู้เข้าชมต่อฟอร์มใน `window` วินาที หรือ `false` |
| `minSubmitTime` | `2000` | มิลลิวินาทีก่อนนับว่าเป็นคนส่ง |
| `turnstile` | — | `{ siteKey, secretKey }` ของ Cloudflare Turnstile |
| `retentionDays` | — | ลบข้อมูลที่เก่ากว่านี้ |
| `slugs` | `forms`, `form-submissions` | `{ forms, submissions }`: slug ของ collection |

## ต่อยอดด้วยสิ่งที่มีอยู่แล้ว {#more-with-whats-built-in}

- **Webhooks**: [webhook](./webhooks) ที่ตั้ง `collections: ['form-submissions']` และ `events: ['create']`
  ส่งข้อมูลแต่ละรายการไป Slack, LINE, n8n หรือ CRM ของคุณ
- **ผู้ช่วย AI**: ถ้าใช้ [plugin MCP](./mcp) กับ API key ที่อ่าน `form-submissions` ได้ ผู้ช่วยสรุปข้อความที่ได้รับในสัปดาห์นี้ได้

## ในหลาย tenant {#in-several-tenants}

เมื่อใช้ [plugin multi-tenant](./multi-tenant#with-other-plugins) ฟอร์มจะหาจาก tenant ของ request (โดเมนหรือ
`x-easy-cms-tenant`) และข้อมูลที่ส่งมาเป็นของ tenant นั้น

## ขั้นต่อไป {#next-steps}

- [อีเมล](./email): SMTP และการส่งซ้ำ
- [ความปลอดภัย](./security): CORS สำหรับฟอร์มบนเว็บคนละ origin
