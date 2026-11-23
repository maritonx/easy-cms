# Analytics และความยินยอม {#analytics-consent}

::: info หน้านี้สอนอะไร
ติดตั้ง Google Tag Manager ให้เว็บไซต์จากหน้า admin ขอความยินยอมจากผู้เข้าชมตามที่ PDPA และ GDPR กำหนด
(Consent Mode v2) และเก็บหลักฐานการเลือกไว้

**ควรอ่านก่อน:** [Plugins](./plugins)
:::

::: warning ทดลอง (experimental)
plugin นี้อยู่ในขั้นทดลอง ใช้เลขเวอร์ชันเดียวกับ Easy CMS ส่วนอื่น แต่ option, endpoint และข้อมูลยังอาจเปลี่ยนใน
minor release ได้ แม้หลัง 1.0 เพราะไม่อยู่ใต้[สัญญาความเสถียร](./versioning#experimental) changelog และ
[คู่มืออัปเกรด](./upgrading) จะบอกว่าเปลี่ยนอะไร
:::

`@easy-cms/plugin-analytics` ใส่ Google Tag Manager ให้ทุกหน้าด้วย script ตัวเดียว ตั้งค่าที่
**Settings → Analytics และความยินยอม** ทีมการตลาดเปลี่ยน container หรือข้อความ banner ได้โดยไม่ต้อง deploy
และแท็กจะยิงก็ต่อเมื่อผู้เข้าชมยินยอมแล้ว

```bash [pm]
npm install @easy-cms/plugin-analytics
```

```ts
import { defineConfig } from '@easy-cms/core'
import { analyticsPlugin } from '@easy-cms/plugin-analytics'

export default defineConfig({
  // …
  plugins: [analyticsPlugin({ defaults: { gtm: process.env.GTM_ID } })],
})
```

`defaults.gtm` ใช้จนกว่า admin จะบันทึกการตั้งค่า ไม่ใส่ก็ได้ถ้าจะตั้ง container ในหน้า admin อย่างเดียว

## ใส่ script ในหน้าเว็บ {#the-script}

ทุกอย่างทำงานจาก script ตัวเดียวที่ API เสิร์ฟ คือ `<api>/analytics.js` ซึ่งตั้งค่าความยินยอมเริ่มต้น แสดง banner
โหลด Tag Manager และสร้าง `easyConsent` กับ `easyAnalytics`

::: code-group

```ts [Nuxt]
// ไม่ต้องทำอะไร: module ใส่ script ให้ทุกหน้าเมื่อติดตั้ง plugin
```

```tsx [Next.js: app/layout.tsx]
import { EasyAnalytics } from '@easy-cms/next/analytics'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        {children}
        <EasyAnalytics />
      </body>
    </html>
  )
}
```

```html [เว็บอื่น]
<script src="https://cms.example.com/api/cms/analytics.js" async></script>
```

:::

สิ่งที่เปลี่ยนในหน้า admin จะถึงหน้าเว็บภายในหนึ่งนาที (script ถูก cache ไว้ 60 วินาที)

**ไม่โหลดในหน้า admin และ preview:** ใน live preview ของหน้า admin และหน้าที่เปิดด้วย `?preview=` script จะไม่โหลดอะไรเลย
การเข้าชมของผู้แก้เนื้อหาจึงไม่ไปปนในรายงาน

## การตั้งค่า {#settings}

**Settings → Analytics และความยินยอม** มี:

| การตั้งค่า | |
|---|---|
| Google Tag Manager container | `GTM-XXXXXXX` ว่างไว้: ไม่โหลด Tag Manager แต่ banner และ `dataLayer` ยังทำงาน |
| แสดง banner ขอความยินยอม | ปิดเมื่อใช้เครื่องมือขอความยินยอมของคุณเอง (ดูด้านล่าง) |
| หัวข้อ, ข้อความของ banner | ว่างไว้: ใช้ข้อความในตัว เป็นภาษาไทยหรืออังกฤษตามหน้าเว็บ |
| หน้านโยบายความเป็นส่วนตัว | ลิงก์จาก banner เช่น `/privacy` |
| ขอความยินยอม | ทุกประเทศ (แนะนำ) หรือเฉพาะ EU/EEA, สหราชอาณาจักร, สวิตเซอร์แลนด์ และไทย |
| เก็บบันทึกความยินยอม, เก็บไว้ (วัน) | ดู[บันทึกความยินยอม](#consent-records) เปิดเป็นค่าเริ่มต้น 730 วัน |

เมื่อใช้[หลายภาษา](./localization) หัวข้อ ข้อความ และหน้านโยบายมีค่าแยกต่อภาษา เมื่อใช้[multi-tenant](./multi-tenant)
ใส่ `analytics` ใน `globals` และ `consent-records` ใน `collections` ของ plugin แต่ละเว็บจะมี container, banner
และบันทึกของตัวเอง

## ความยินยอม {#consent}

script ใช้ [Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent) ของ Google:
ทุกอย่าง**ปฏิเสธ**ไว้จนกว่าผู้เข้าชมจะเลือก แท็กของ Google จึงไม่ใช้คุกกี้ก่อนหน้านั้น

| ใน banner | Consent Mode |
|---|---|
| จำเป็น (เปิดอยู่เสมอ) | ไม่มี: ใช้จำการเลือก |
| การวิเคราะห์ | `analytics_storage` |
| การตลาด | `ad_storage`, `ad_user_data`, `ad_personalization` |

banner มีปุ่ม **ยอมรับทั้งหมด** และ **ปฏิเสธทั้งหมด** อยู่คู่กันและเด่นเท่ากัน และมี **ตั้งค่า** สำหรับเลือกรายหมวด
การเลือกเก็บไว้ 12 เดือนในคุกกี้ของเว็บเอง ชื่อ `easy_consent` ถ้าเปลี่ยนหัวข้อ ข้อความ หรือหน้านโยบายของ banner
ทุกคนจะถูกถามใหม่

ให้ผู้เข้าชมเปลี่ยนใจได้จาก element ใดก็ได้ที่มี `data-easy-consent` เช่นใน footer:

```html
<a href="#" data-easy-consent>ตั้งค่าคุกกี้</a>
```

banner ใช้สีของคุณจากตัวแปร CSS: `--easy-consent-accent`, `--easy-consent-bg` และ `--easy-consent-fg`

### ใช้เครื่องมือขอความยินยอมของคุณเอง {#own-consent-tool}

ใช้ Cookiebot, OneTrust หรือ banner ที่ทำเอง ให้ปิด **แสดง banner ขอความยินยอม** ค่าเริ่มต้นยังเป็นปฏิเสธ และเครื่องมือของคุณ
ให้ความยินยอมด้วย `gtag('consent', 'update', …)` ซึ่งส่วนใหญ่ทำอยู่แล้ว หรือด้วย:

```js
window.easyConsent.set({ analytics: true, marketing: false })
window.easyConsent.get() // { analytics: true, marketing: false } หรือ null ก่อนเลือก
```

## บันทึกความยินยอม {#consent-records}

PDPA และ GDPR ให้คุณแสดงได้ว่าผู้เข้าชมยินยอม ทุกการเลือกเก็บไว้ใน **บันทึกความยินยอม**: ID สุ่ม (ตัวเดียวกับในคุกกี้ของผู้เข้าชม)
หมวดที่เลือก เวอร์ชันของ banner และเวลา ไม่เก็บ IP และไม่มีอะไรที่ระบุตัวบุคคล admin อ่านได้ แต่ไม่มีใครแก้ได้
และจะถูกลบเมื่อครบจำนวนวันที่ตั้งไว้

## Event {#events}

ส่ง event ของคุณเองเข้า `dataLayer` ของ Tag Manager:

```js
window.easyAnalytics.track('sign_up', { method: 'email' })
```

script ส่ง `easy_consent` พร้อม `{ consent: { analytics, marketing } }` ทุกครั้งที่ผู้เข้าชมเลือกด้วย สำหรับแท็กที่ควรรอ

## Content Security Policy {#csp}

ถ้าเว็บส่ง Content Security Policy ให้อนุญาต Tag Manager และทุกอย่างที่แท็กของคุณโหลด:

```
script-src 'self' https://www.googletagmanager.com;
```

## ขั้นต่อไป {#next-steps}

- [SEO](./seo): meta tag, sitemap และ structured data ของหน้าเดียวกัน
- [ฟอร์ม](./forms): ฟอร์มในหน้า admin พร้อมกันสแปม
