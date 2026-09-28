# build เว็บ static ใหม่เมื่อเผยแพร่ {#rebuild-a-static-site-on-publish}

::: info สิ่งที่จะได้
เว็บที่สร้างตอน build (Astro, Nuxt `generate`, Next.js export, Hugo…) ที่ build ใหม่เองเมื่อมีการเผยแพร่เนื้อหา
**ใช้:** [webhooks](../webhooks)
:::

## 1. ขอ deploy hook {#1-get-a-deploy-hook}

ผู้ให้บริการ hosting จะให้ URL ที่เริ่ม build เมื่อได้รับ `POST`:

- **Netlify:** Site configuration → Build & deploy → Build hooks
- **Vercel:** Project Settings → Git → Deploy Hooks
- **Cloudflare Pages:** Settings → Builds → Deploy hooks

เก็บเป็นความลับ ใส่ไว้ใน environment variable เช่น `DEPLOY_HOOK_URL`

## 2. เรียกเมื่อมีอะไรขึ้นเว็บ {#2-call-it-when-something-goes-live}

```ts
webhooks: [
  {
    url: process.env.DEPLOY_HOOK_URL as string,
    // เฉพาะการเปลี่ยนที่ผู้เยี่ยมชมเห็น ไม่ใช่ทุกครั้งที่บันทึกฉบับร่าง
    events: ['publish', 'unpublish', 'delete'],
    collections: ['posts', 'pages'],
  },
],
```

collection ที่ไม่มี drafts ให้เพิ่ม `'update'` และ `'create'` เพราะทุกการบันทึกขึ้นเว็บทันที

Easy CMS ส่ง request หลังบันทึกเสร็จ และส่งซ้ำประมาณหนึ่งวันถ้า hosting ล่ม (1 นาที, 5 นาที, 30 นาที, 2, 6 และ 12 ชั่วโมง)
แม้ server จะรีสตาร์ต

## 3. build พร้อมเนื้อหา {#3-build-with-the-content}

ตอน build ให้อ่านเนื้อหาที่เผยแพร่จาก API เช่นใน Astro:

```ts
const res = await fetch(`${import.meta.env.CMS_URL}/api/cms/posts?limit=100&sort=-publishedAt`)
const { docs: posts } = await res.json()
```

## เคล็ดลับ {#tips}

- เผยแพร่หลายครั้งติดกันจะเริ่ม build หลายครั้ง hosting ส่วนใหญ่จะยกเลิกหรือต่อคิว build เก่าให้
- การเผยแพร่ตามเวลาก็ส่ง `publish` บทความที่ตั้งไว้ 9 โมงจึง build เว็บใหม่ตอน 9 โมง
- ครั้งที่ส่งไม่สำเร็จจะถูกบันทึก log บน server (`Webhook <url> failed for publish …; will retry later`)
  และการส่งจะถูกเก็บไว้จนสำเร็จหรือครบจำนวนครั้งที่ส่งซ้ำ
