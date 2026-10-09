# เตรียมเว็บให้เครื่องมือค้นหา {#search-engines}

::: info สิ่งที่จะได้
หน้าเว็บที่มีชื่อ คำอธิบาย และการ์ดตอนแชร์ที่ดี มี sitemap และ robots.txt มีลิงก์ระหว่างหน้าไทยกับอังกฤษ
และมีข้อมูลแบบมีโครงสร้าง จากนั้นส่งเว็บให้ Google
**ใช้:** [plugin SEO](../seo), [หลายภาษา](../localization)
:::

## ติดตั้ง plugin พร้อมที่อยู่จริง {#add-the-plugin-with-real-addresses}

ตั้ง `admin.siteURL` เป็นที่อยู่ของเว็บจริง และให้ `generateURL` คืน path จริงของแต่ละหน้าแยกตามภาษา
ทุกขั้นต่อจากนี้ใช้ค่านี้

```ts [easy-cms.config.ts]
import { seoPlugin } from '@easy-cms/plugin-seo'

export default defineConfig({
  admin: { siteURL: 'https://example.com' },
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  plugins: [
    seoPlugin({
      collections: ['posts'],
      globals: ['site'],
      generateTitle: ({ doc }) => (doc.title ? `${doc.title} | My Blog` : null),
      generateDescription: ({ doc }) => doc.excerpt ?? null,
      generateImage: ({ doc }) => doc.cover ?? null,
      generateURL: ({ doc, collection, locale }) =>
        collection === 'posts'
          ? doc.slug ? `/${locale}/posts/${doc.slug}` : null
          : `/${locale}`,
    }),
  ],
})
```

สร้าง migration สำหรับ field ใหม่: `npx easy-cms migrate:create seo`

## metadata ในทุกหน้า {#metadata-on-every-page}

ในทุกหน้าที่แสดงเอกสาร ให้เรียก `seoMeta()` ด้วยที่อยู่เดียวกัน `type: 'article'` สำหรับบทความจะเพิ่มวันที่เผยแพร่
และข้อมูล BlogPosting ดูโค้ดของ Nuxt และ Next.js ได้ที่[ในหน้าเว็บของคุณ](../seo#on-your-pages)

```ts
const seo = seoMeta(post, {
  config,
  locale,
  url: (p, l) => `/${l}/posts/${p.slug}`,
  type: 'article',
})
```

ใส่ `siteJsonLd({ name, url, logo })` ไว้ใน layout หนึ่งครั้ง เพื่อให้เครื่องมือค้นหารู้ว่าใครเป็นเจ้าของเว็บ

## Sitemap และ robots.txt {#sitemap-and-robots-txt}

เพิ่ม route ทั้งสองจากหัวข้อ [Sitemap](../seo#sitemap) และ [robots.txt](../seo#robots-txt) แล้วตรวจ:

```bash
curl https://example.com/robots.txt
curl https://example.com/sitemap.xml
```

sitemap ควรมีบทความที่เผยแพร่แล้วทั้งสองภาษา แต่ละรายการมีบรรทัด `xhtml:link` ชี้ไปอีกภาษา
ฉบับร่างและหน้าที่ติ๊ก **ซ่อนจากเครื่องมือค้นหา** จะไม่อยู่ใน sitemap

## ตรวจหน้าเว็บ {#check-a-page}

1. เปิดบทความแล้วดู source: `<title>`, `<meta name="description">`, แท็ก `og:*`,
   `<link rel="canonical">` และ `<link rel="alternate" hreflang="…">` ของแต่ละภาษา
2. วางที่อยู่ของหน้าใน [Rich Results Test](https://search.google.com/test/rich-results) ของ Google
   เพื่อตรวจข้อมูลแบบมีโครงสร้าง
3. ลองแชร์ในแอปแชตเพื่อดูการ์ดพร้อมรูปสำหรับแชร์

## แจ้ง Google {#tell-google}

1. เพิ่มเว็บใน [Google Search Console](https://search.google.com/search-console) และยืนยันความเป็นเจ้าของ
2. ที่เมนู **Sitemaps** ส่ง `https://example.com/sitemap.xml`
3. ใช้ **URL inspection** กับบทความใหม่เพื่อขอให้ Google เข้ามาอ่าน

จากนั้น Search Console จะแสดงว่าหน้าไหนอยู่ในผลการค้นหาแล้ว และทำไมหน้าอื่นยังไม่อยู่

## เว็บ staging {#staging-sites}

เว็บ staging ไม่ควรขึ้นในผลการค้นหา ให้ปิดใน `robots.txt` ด้วยตัวแปรของคุณเอง
(ไม่ใช่ `NODE_ENV` เพราะบน staging ก็เป็น `production` เหมือนกัน):

```ts
robotsTxt({ config, disallowAll: process.env.SITE_ENV !== 'production' })
```
