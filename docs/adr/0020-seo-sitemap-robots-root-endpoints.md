# ADR-0020: Sitemap, robots.txt, hreflang และ JSON-LD ใน plugin SEO และ root endpoints

- **สถานะ:** Accepted
- **วันที่:** 2026-09-28

## บริบท

plugin SEO ใน 0.13 ([ADR-0018](0018-plugin-endpoints-admin-components.md)) ดูแลแค่ meta ของแต่ละหน้า
ส่วน SEO ระดับทั้งเว็บยังไม่มี ได้แก่ sitemap, robots.txt, noindex รายหน้า, hreflang ของเว็บหลายภาษา,
`og:type` แบบ article และข้อมูลแบบมีโครงสร้าง (JSON-LD) ปัญหาคือ `/sitemap.xml` และ `/robots.txt`
ต้องอยู่ที่ root ของเว็บ แต่ endpoint ของ plugin อยู่ใต้ `routes.api` เท่านั้น

## การตัดสินใจ

**Root endpoints ใน core**
- `endpoints[].root: true` ให้เสิร์ฟ path จาก root ของเว็บ เป็นกลไกทั่วไป ไม่ผูกกับ plugin SEO
  เพื่อให้ plugin อื่นใช้ได้ด้วย (เช่น `/.well-known/…`)
- มีแต่ standalone server (`createRootEndpointHandler`) ที่เสิร์ฟ เพราะแอป Nuxt หรือ Next.js เป็นเจ้าของ root เอง
  plugin ที่มี root endpoint จึงต้องมี helper ให้แอปเรียกใน route ของตัวเองด้วย
- auth, CSRF, CORS และรูปแบบ error เหมือน endpoint ปกติ ตรวจตอนเริ่มระบบว่า path ไม่ชนกับ `routes.api`,
  `admin.path` และ `/healthz` ส่วน REST handler ไม่เสิร์ฟ root endpoint

**Sitemap**
- `sitemap(cms)` คืนรายการในรูปแบบ `MetadataRoute.Sitemap` ของ Next.js และ `sitemapXml(cms)` คืน XML
  ทั้งสองอยู่ใน plugin และไม่ import core ตอนรัน (ใช้ Local API ที่ส่งเข้ามา)
- URL มาจาก `generateURL` ที่มีอยู่แล้วเป็นแหล่งเดียว (ใช้ร่วมกับตัวอย่างผลการค้นหาและ hreflang) คืน `null` แปลว่าไม่มีหน้า
- อ่านเอกสารแบบผู้เข้าชม (`overrideAccess: false, user: null`) จึงมีเฉพาะที่เผยแพร่และที่ read access เปิดให้
  collection ที่ผู้เข้าชมอ่านไม่ได้เลยจะถูกข้าม ไม่ใส่ `changefreq`/`priority` เพราะ Google ไม่ใช้
- เว็บหลายภาษาอ่านทีละภาษา แล้วรวมเป็นรายการต่อ URL พร้อม `xhtml:link` ของทุกภาษาและ `x-default`
  ถ้า URL ทุกภาษาเหมือนกันจะเหลือรายการเดียวโดยไม่มี alternates
- เกิน 50,000 URL จะกลายเป็น sitemap index ของ `?page=n` (query ใน URL ของ sitemap ใช้ได้)
- `sitemap(cms)` หาตัวเลือกของ plugin จาก handler ของ endpoint ใน config ที่ resolve แล้ว โดยใช้ key จาก
  `Symbol.for(…)` ไม่ใช้ WeakMap ระดับ module เพราะ Next.js bundle plugin แยกตาม server layer
  และ instance อาจมาจากสำเนาของอีก layer ([ADR-0009](0009-postgres-and-next.md))
- plugin เพิ่ม `GET <api>/seo/sitemap.xml` และ root `/sitemap.xml` ถ้าไม่มี `admin.siteUrl` จะใช้ origin ของ request

**robots.txt**
- `robotsTxt({ config })` ใส่ `Disallow` ให้ admin และ API แต่ `Allow` ให้ `<api>/media/file/` เพราะ crawler
  ของการ์ดแชร์ (เช่น Twitterbot) ทำตาม robots.txt และจะโหลดรูปสำหรับแชร์ไม่ได้
- `disallowAll` ไม่เปิดเองตาม `NODE_ENV` เพราะ staging ส่วนใหญ่ก็รันแบบ production
- plugin เพิ่ม root `/robots.txt` สำหรับ standalone ปิดได้ด้วย `robots: false`

**noindex**
- checkbox `meta.noindex` ใน group ของ plugin (ไม่ใช่ select index/follow เพราะ nofollow ทั้งหน้าแทบไม่มีใครใช้)
  ทำให้ `seoMeta` ใส่ `robots: noindex` และ sitemap ข้ามหน้านั้น โปรเจกต์เดิมต้องสร้าง migration เพิ่มหนึ่งคอลัมน์

**seoMeta**
- ยังเป็นฟังก์ชัน sync ที่ไม่ import core: `url` รับ `(doc, locale)` เพื่อสร้าง hreflang, `locale`/`locales` มาจาก
  option หรือ `config.localization`
- `type: 'article'` ใส่ `og:type`, เวลาเผยแพร่/แก้ไข และผู้เขียน
- `jsonLd` เป็น BlogPosting (หรือ `articleType`) หรือ WebPage, `siteJsonLd()` เป็น Organization + WebSite และ
  `jsonLdScript()` escape `<` และ line separator เพื่อไม่ให้เนื้อหาปิดแท็ก `<script>` ได้
- `head` สำหรับ `useHead()` ของ Nuxt รวม canonical, hreflang และ script JSON-LD ส่วน Next.js ต้อง render
  script ในหน้าเอง เพราะ `Metadata` ไม่มีช่องสำหรับ JSON-LD
- `config` รับเป็น `object` แล้วอ่านภายใน เพราะ type แบบ weak (ทุก property เป็น optional) ปฏิเสธ config ที่ไม่มี
  property ร่วมกัน เช่น `admin: { locale }`

## ผลที่ตามมา

- ✅ เว็บ Nuxt, Next และ standalone มี sitemap, robots.txt, hreflang และ JSON-LD จาก config เดียว
- ✅ plugin อื่นเสิร์ฟไฟล์ที่ root ใน standalone ได้
- ❌ Nuxt และ Next.js ต้องเพิ่ม route ของ sitemap และ robots เอง (โค้ดไม่กี่บรรทัดในเอกสาร)
- ❌ sitemap อ่านทุกเอกสารทุกครั้งที่ถูกเรียก (500 ต่อหน้า) เว็บใหญ่ควรใส่ cache ที่ CDN (endpoint ตอบ `max-age=600`)
- ~~❌ BreadcrumbList ยังไม่มี เพราะ CMS ไม่รู้โครงสร้างหน้าของเว็บ~~ → มีแล้วใน 0.21: `seoMeta({ breadcrumbs })` รับเส้นทางของหน้าจากเว็บเอง เช่นจาก plugin nested docs (ดู [ADR-0024](0024-nested-docs.md))
