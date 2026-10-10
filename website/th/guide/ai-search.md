# SEO สำหรับ AI {#ai-search}

::: info หน้านี้สอนอะไร
ระบบค้นหาและผู้ช่วย AI (ChatGPT, Claude, Perplexity, คำตอบ AI ของ Google…) หาและอ่านเนื้อหาของคุณอย่างไร
และ plugin SEO มีอะไรให้บ้าง: กฎสำหรับ crawler, `llms.txt`, หน้าแบบ Markdown และ IndexNow

**ควรอ่านก่อน:** [SEO](./seo)
:::

คำตอบของ AI เริ่มจากสิ่งเดียวกับการค้นหา: หน้าที่ crawler อ่านได้ ชื่อและคำอธิบายที่ชัด วันที่ ผู้เขียน และข้อมูลแบบมีโครงสร้าง
ซึ่ง [plugin SEO](./seo) ดูแลอยู่แล้ว นอกจากนั้น เครื่องมือ AI อ่าน Markdown ได้ง่ายกว่า HTML และบางเว็บต้องการเลือกเองว่า
crawler ของ AI ตัวไหนใช้เนื้อหาได้

::: warning ต้อง render ฝั่ง server
crawler ของ AI ส่วนใหญ่ไม่รัน JavaScript หน้าที่โหลดเนื้อหาในเบราว์เซอร์ เช่น frontend ของตัวอย่าง[standalone](./standalone)
จะดูว่างเปล่าสำหรับ crawler เหล่านี้ ให้ render ฝั่ง server (Nuxt, Next.js, Astro…) หรือ prerender หน้าไว้ ส่วนหน้า admin
ไม่เกี่ยว เพราะถูกกันออกจากการค้นหาอยู่แล้ว
:::

## เลือกว่า crawler ของ AI ตัวไหนอ่านได้ {#choose-which-ai-crawlers-may-read}

crawler ของ AI มีสามแบบ `robotsTxt()` ตั้งค่าเป็นกลุ่มได้ ค่าเริ่มต้นคืออนุญาตทั้งหมด

| กลุ่ม | ทำอะไร | crawler |
|---|---|---|
| `training` | เก็บข้อความไปเทรนโมเดล AI | GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent, Bytespider, cohere-training-data-crawler |
| `search` | ทำ index สำหรับการค้นหาด้วย AI และคำตอบที่อ้างอิงและลิงก์ไปหน้าเว็บ | OAI-SearchBot, Claude-SearchBot, PerplexityBot |
| `user` | เปิดหน้าเว็บเมื่อมีคนสั่งผู้ช่วยให้อ่าน | ChatGPT-User, Claude-User, Perplexity-User |

ตัวเลือกที่นิยม: ไม่ให้เอาไปเทรน แต่ให้คำตอบของ AI หาเจอและลิงก์มาที่เว็บได้

```ts
robotsTxt({ config, ai: { training: false } })
```

```txt
User-agent: GPTBot
User-agent: ClaudeBot
…
Disallow: /
```

- ถ้าปิด `search` หน้าเว็บจะไม่อยู่ในผลการค้นหาและการอ้างอิงของ AI
- crawler กลุ่ม `user` ทำงานแทนคนที่ถามถึงหน้านั้น และผู้ให้บริการบางรายบอกว่าอาจไม่ทำตาม `robots.txt` เสมอ
- `Google-Extended` ครอบคลุมเฉพาะการใช้เนื้อหาใน Gemini ส่วนคำตอบ AI ในหน้าค้นหาของ Google มาจาก Googlebot ปกติ
  เหมือนการค้นหาทั่วไป
- รายชื่อจะอัปเดตทุก release (`AI_CRAWLERS`) ตัวอื่นเพิ่มได้ด้วย `rules`:
  `rules: [{ userAgent: 'SomeBot', disallow: ['/'] }]` แต่ละกฎจะได้กฎของ admin และ API ไปด้วย เพราะ crawler
  ทำตามเฉพาะกลุ่มที่ระบุชื่อตัวเอง

`/robots.txt` ของ standalone server ใช้ตัวเลือกเดียวกันผ่าน plugin: `seoPlugin({ robots: { ai: { training: false } } })`

## llms.txt {#llms-txt}

[`llms.txt`](https://llmstxt.org) เป็นมาตรฐานที่มีผู้เสนอไว้: ไฟล์ Markdown สั้นๆ ที่ root ของเว็บ บอกเครื่องมือ AI ว่าเว็บนี้คืออะไร
และหน้าหลักอยู่ที่ไหน `llmsTxt(cms)` สร้างจากเนื้อหาของคุณ โดยใช้หน้าชุดเดียวกับ sitemap (เผยแพร่แล้ว ผู้เข้าชมเห็นได้
ไม่ได้ซ่อนจากเครื่องมือค้นหา) เรียงจากใหม่ไปเก่า:

```md
# My Blog

> บล็อกเรื่องการทำเว็บไซต์ในไทย

## Posts

- [Hello](https://example.com/posts/hello.md): บล็อกนี้เกี่ยวกับอะไร

## Pages

- [My Blog](https://example.com/)
```

```ts
seoPlugin({
  // …
  llms: {
    title: 'My Blog', // ค่าเริ่มต้น: ชื่อเว็บจาก global ที่มี field SEO
    description: 'บล็อกเรื่องการทำเว็บไซต์ในไทย',
    limit: 100, // จำนวนหน้าล่าสุดต่อ collection
    markdownURL: ({ doc, collection }) =>
      collection === 'posts' ? `/posts/${doc.slug}.md` : null,
  },
})
```

`markdownURL` ลิงก์ไปยัง[หน้าแบบ Markdown](#markdown-versions-of-pages) ถ้าไม่ตั้งจะลิงก์ไปหน้าเว็บปกติ
ถ้ามีหลายภาษา ไฟล์จะเป็นภาษาเริ่มต้น (หรือ `llms.locale`)

`llmsFullTxt(cms)` รวม Markdown ของทุกหน้าไว้ในไฟล์เดียว สำหรับเครื่องมือที่อ่านทั้งเว็บในครั้งเดียว จะหยุดที่ประมาณ 5 MB
(`maxBytes`) และบอกว่าหน้าที่เหลืออยู่ที่ไหน

::: code-group

```ts [Nuxt: server/routes/llms.txt.ts]
import { llmsTxt } from '@easy-cms/plugin-seo'

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return llmsTxt(await useEasyCMS())
})
// server/routes/llms-full.txt.ts: แบบเดียวกันด้วย llmsFullTxt
```

```ts [Next.js: app/llms.txt/route.ts]
import { getEasyCMS } from '@easy-cms/next'
import { llmsTxt } from '@easy-cms/plugin-seo'
import { connection } from 'next/server'
import config from '@/easy-cms.config'

export async function GET() {
  await connection() // อ่านทุก request ไม่ใช่ตอน build
  const text = await llmsTxt(await getEasyCMS(config))
  return new Response(text, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
}
// app/llms-full.txt/route.ts: แบบเดียวกันด้วย llmsFullTxt
```

:::

standalone server เสิร์ฟ `/llms.txt` และ `/llms-full.txt` เอง ปิดได้ด้วย `llms: false`

## หน้าแบบ Markdown {#markdown-versions-of-pages}

`docMarkdown(cms, { collection, doc, url })` แปลงเอกสารหนึ่งเป็น Markdown: ชื่อ คำอธิบาย ที่อยู่ และวันที่
ตามด้วย rich text ข้อความยาว และข้อความใน blocks และ array ตามลำดับของ field ให้เสิร์ฟไว้ข้างหน้าเว็บ เช่น `/posts/hello.md`

::: code-group

```ts [Nuxt: server/middleware/markdown.ts]
import { docMarkdown } from '@easy-cms/plugin-seo'

export default defineEventHandler(async (event) => {
  const slug = /^\/posts\/([^/]+)\.md$/.exec(getRequestURL(event).pathname)?.[1]
  if (!slug) return
  const cms = await useEasyCMS()
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false, // อ่านแบบผู้เข้าชม: เฉพาะบทความที่เผยแพร่
    user: null,
  })
  if (!docs[0]) throw createError({ statusCode: 404 })
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return docMarkdown(cms, { collection: 'posts', doc: docs[0] })
})
```

```ts [Next.js: app/md/posts/[slug]/route.ts]
import { getEasyCMS } from '@easy-cms/next'
import { docMarkdown } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

// next.config.ts: rewrites: async () => [{ source: '/posts/:slug.md', destination: '/md/posts/:slug' }]
export async function GET(_: Request, { params }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false, // อ่านแบบผู้เข้าชม: เฉพาะบทความที่เผยแพร่
    user: null,
  })
  if (!docs[0]) return new Response('Not found', { status: 404 })
  return new Response(docMarkdown(cms, { collection: 'posts', doc: docs[0] }), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
```

:::

ถ้าต้องการเขียน Markdown ของ collection เอง ให้ส่ง `markdown` ให้ plugin ส่วน rich text อย่างเดียวแปลงได้ด้วย
[`renderMarkdown()`](./rich-text#markdown)

```ts
seoPlugin({
  // …
  markdown: {
    products: (doc) => `# ${doc.name}\n\nราคา: ${doc.price} บาท\n\n${renderMarkdown(doc.details)}`,
  },
})
```

## IndexNow {#indexnow}

[IndexNow](https://www.indexnow.org) แจ้ง Bing, Yandex และเครื่องมือค้นหาอื่นทันทีเมื่อหน้าเปลี่ยน แทนที่จะรอให้ crawler มาเอง
index ของ Bing ยังใช้กับ ChatGPT search และ Copilot บทความใหม่จึงไปถึงคำตอบของ AI ได้เร็วขึ้น

```ts
seoPlugin({
  // …
  indexNow: { key: process.env.INDEXNOW_KEY }, // ตัวอักษร ตัวเลข หรือขีด 8–128 ตัว เช่น UUID
})
```

- เมื่อหน้าถูกเผยแพร่ แก้ไขขณะเผยแพร่อยู่ ยกเลิกเผยแพร่ หรือลบ ระบบจะส่งที่อยู่ของหน้านั้น (ทุกภาษา) ฉบับร่างไม่ส่งอะไร
- การเปลี่ยนแปลงจะถูกรวบรวม 5 วินาที (`delay`) แล้วส่งพร้อมกัน ถ้าส่งไม่สำเร็จจะ log ไว้โดยไม่ส่งซ้ำ
  เพราะเครื่องมือค้นหายังเข้ามาอ่านตามปกติ
- ส่งเฉพาะที่อยู่ `https` ที่เป็นสาธารณะ เครื่อง dev และ staging บน `localhost` หรือโดเมน `.test` จึงไม่ส่งออกไป

IndexNow ตรวจความเป็นเจ้าของเว็บด้วยไฟล์ key ที่ `/<key>.txt` standalone server เสิร์ฟให้เอง ส่วน Nuxt หรือ Next.js
ให้ตอบด้วย `indexNowKeyFile(cms, pathname)` หรือวางไฟล์ไว้ใน `public/`:

```ts
// Nuxt: server/middleware/indexnow.ts
import { indexNowKeyFile } from '@easy-cms/plugin-seo'

export default defineEventHandler(async (event) => {
  const key = indexNowKeyFile(await useEasyCMS(), getRequestURL(event).pathname)
  if (key) return key
})
```

## ขั้นต่อไป {#next-steps}

- [SEO](./seo): metadata, sitemap และข้อมูลแบบมีโครงสร้าง ที่คำตอบของ AI ก็ใช้ด้วย
- [MCP](./mcp): ให้ผู้ช่วย AI *แก้ไข* เนื้อหาได้ด้วย API key
