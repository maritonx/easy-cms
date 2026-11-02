# Rich text {#rich-text}

::: info หน้านี้สอนอะไร
ผู้แก้ทำอะไรได้บ้างใน field แบบ rich text เนื้อหาถูกเก็บอย่างไร และจะแสดงบนหน้าเว็บอย่างปลอดภัยด้วย
Nuxt, Next.js หรือ frontend ใดก็ได้อย่างไร

**ควรอ่านก่อน:** [Fields](./fields)
:::

## Field {#the-field}

```ts
{ name: 'body', type: 'richText', localized: true }
```

ในหน้า admin field แบบ `richText` แก้ด้วย [Tiptap](https://tiptap.dev): หัวข้อ (H2–H4) ตัวหนา ตัวเอียง
ขีดเส้นใต้ โค้ดในบรรทัด ลิงก์ รายการแบบจุดและตัวเลข คำพูดอ้างอิง รูปจากคลังสื่อ (หรือ URL) ตาราง ย้อนกลับและทำซ้ำ
ตารางเริ่มด้วยแถวหัวตาราง และเมื่อเคอร์เซอร์อยู่ในตารางจะมีปุ่มเพิ่มและลบแถวหรือคอลัมน์ ยังรวมเซลล์ไม่ได้
คีย์ลัดใช้ได้เหมือน editor อื่น (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>B</kbd>, <kbd>I</kbd>, <kbd>U</kbd>, <kbd>Z</kbd>)

ค่าถูกเก็บเป็น JSON ของ Tiptap ซึ่งเป็นโครงสร้างต้นไม้ของ node ไม่ใช่ HTML:

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "สวัสดี" }] },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "อ่าน" },
        { "type": "text", "text": "คู่มือ", "marks": [{ "type": "link", "attrs": { "href": "/guide" } }] }
      ]
    }
  ]
}
```

JSON ทำให้เนื้อหาไม่ผูกกับวิธีแสดงผล เอกสารเดียวกันแปลงเป็น HTML เป็นข้อความธรรมดาสำหรับระบบค้นหา
หรือเป็น component ของคุณเองก็ได้

### ลิงก์ไปเอกสาร {#links-to-documents}

ปุ่มลิงก์ลิงก์ไปที่อยู่เว็บ หรือไป**เอกสาร**ของ collection ที่เอกสารมี URL (มี [`preview`](/th/guide/live-preview)) ลิงก์ไปเอกสารเก็บ id ไม่ใช่ URL:

```json
{ "type": "link", "attrs": { "doc": { "relationTo": "posts", "value": 12 }, "href": null } }
```

การอ่านที่ `depth` 1 ขึ้นไป (ค่าเริ่มต้นของ REST) จะเติม `href` เป็น URL ปัจจุบันของเอกสาร ลิงก์จึงตามเอกสารไปเมื่อ slug หรือ path เปลี่ยน
และ `renderRichText` แสดงได้เหมือนลิงก์ทั่วไป เอกสารที่ถูกลบหรือผู้อ่านไม่มีสิทธิ์ดูจะไม่มี `href` ข้อความยังอยู่แต่เป็นข้อความธรรมดา
ตอนบันทึกจะตรวจว่าเอกสารมีอยู่จริง และ collection ของเอกสารมี `preview`

### block ระหว่างย่อหน้า {#blocks-between-paragraphs}

`blocks` ให้ผู้แก้ไขวาง block ที่มี field ของตัวเองไว้ระหว่างย่อหน้าได้ เช่น การ์ดของเอกสารอื่น กล่องข้อความ หรือวิดีโอ
block แต่ละตัวเป็น node หนึ่งในเอกสาร:

```ts
{
  name: 'body',
  type: 'richText',
  blocks: [
    { slug: 'card', fields: [{ name: 'doc', type: 'relationship', to: ['posts', 'pages'] }] },
    {
      slug: 'callout',
      admin: { summary: ({ fields }) => `${fields.tone}: ${fields.text}` },
      fields: [
        { name: 'tone', type: 'select', options: ['info', 'warning'], defaultValue: 'info' },
        { name: 'text', type: 'textarea', required: true },
      ],
    },
  ],
}
```

```json
{ "type": "block", "attrs": { "blockType": "callout", "id": "…", "fields": { "tone": "info", "text": "…" } } }
```

ใน editor ปุ่ม **แทรก block** บน toolbar หรือพิมพ์ `/` ในบรรทัดว่าง จะแสดงรายการ block ของ field นั้น
block แสดงเป็นการ์ด กด **แก้ไข** เพื่อเปิด field ในแผงข้าง และลาก คัดลอก หรือลบได้เหมือนย่อหน้า
การ์ดแสดงชื่อ block กับค่าแรกที่มี ถ้าอยากเปลี่ยนให้ตั้ง `admin.summary` เป็น function ที่ทำงานบน server
หรือชื่อ custom element จาก [admin module](/th/guide/plugins#the-module) ที่ได้ `fields`

ตอนบันทึก field ใน block ถูกตรวจแบบเดียวกับ [field ชนิด blocks](/th/guide/fields#blocks) error อยู่ที่
`body.<id ของ block>.<field>` และ block ที่ field ไม่มีจะถูกปฏิเสธ สิทธิ์ของ field ใช้ใน block ด้วย
relationship ใน block populate ตาม `depth` ด้วยสิทธิ์ของ collection นั้นๆ field ใน block เป็น `localized`,
`richText` หรือ `blocks` ไม่ได้ ส่วน rich text ที่ localized เก็บ block แยกตามภาษาอยู่แล้ว การค้นหารวมข้อความใน block
แต่ filter มองเข้าไปใน rich text ไม่ได้

render block ด้วย option `blocks` ของ [`renderRichText`](#showing-it-on-a-page) และ `renderMarkdown`
ส่วน `RichTextBlocks` ให้ type จาก config:

```ts
import type { RichTextBlocks } from '@easy-cms/core'
import { escapeHtml, renderRichText } from '@easy-cms/richtext'

type BodyBlock = RichTextBlocks<typeof config, 'posts', 'body'>

const html = renderRichText<BodyBlock>(post.body, {
  blocks: {
    callout: (fields) => `<aside class="${fields.tone}">${escapeHtml(fields.text)}</aside>`,
    card: (fields) =>
      typeof fields.doc.value === 'object' ? `<a href="/${fields.doc.relationTo}/${fields.doc.value.slug}">…</a>` : '',
  },
})
```

สิ่งที่ renderer คืนมาจะถูกใช้ตามนั้นเลย ข้อความต้อง escape เองด้วย `escapeHtml` block ที่ไม่มี renderer
จะไม่ออกใน HTML และ Markdown ส่วน plain text เอาข้อความจาก field ของมัน `generate:types` สร้าง type แบบเดียวกันให้ เช่น `PostBodyBlock`

## แสดงบนหน้าเว็บ {#showing-it-on-a-page}

ติดตั้งตัวแปลง:

```bash [pm]
npm install @easy-cms/richtext
```

::: code-group

```vue [Nuxt]
<script setup lang="ts">
import { renderRichText } from '@easy-cms/richtext'

const { data: post } = await useFetch(`/api/posts/${useRoute().params.slug}`)
const html = computed(() => renderRichText(post.value?.body))
</script>

<template>
  <!-- ปลอดภัย: renderRichText escape ข้อความและตัด URL ที่ไม่ปลอดภัย -->
  <div class="prose" v-html="html" />
</template>
```

```tsx [Next.js]
import { renderRichText } from '@easy-cms/richtext'

export function PostBody({ body }: { body: unknown }) {
  // ปลอดภัย: renderRichText escape ข้อความและตัด URL ที่ไม่ปลอดภัย
  return <div className="prose" dangerouslySetInnerHTML={{ __html: renderRichText(body) }} />
}
```

```ts [Frontend อื่น]
import { renderRichText } from '@easy-cms/richtext'

const post = await fetch('/api/cms/posts/1').then((r) => r.json())
document.querySelector('#body')!.innerHTML = renderRichText(post.body)
```

:::

รองรับ node เหล่านี้: ย่อหน้า หัวข้อ รายการแบบจุดและตัวเลข คำพูดอ้างอิง code block การขึ้นบรรทัดใหม่
เส้นคั่น รูป และตาราง (แถวหัวตารางอยู่ใน `<thead>`) ส่วน mark ที่รองรับ: ตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า โค้ด และลิงก์
node ที่ไม่รู้จักจะเหลือแค่ข้อความโดยไม่มี markup เนื้อหาแบบใหม่จึงไม่ทำให้หน้าเว็บพัง

### ความปลอดภัย {#safety}

`renderRichText` escape ข้อความและ attribute ทั้งหมด และตัด URL ที่ไม่ปลอดภัย (`javascript:`, `data:`
และอะไรก็ตามที่ไม่ใช่ http(s), mailto, tel หรือลิงก์แบบ relative) ผลลัพธ์จึงใช้กับ `v-html` หรือ
`dangerouslySetInnerHTML` ได้อย่างปลอดภัย ลิงก์ภายนอกจะได้ `rel="noopener noreferrer"`

## ข้อความธรรมดา {#plain-text}

```ts
import { richTextToPlainText } from '@easy-cms/richtext'

const excerpt = richTextToPlainText(post.body).slice(0, 160) // meta description, ระบบค้นหา
```

## Markdown {#markdown}

`renderMarkdown(doc)` แปลง rich text เป็น Markdown เช่น สำหรับผู้ช่วย AI ([SEO สำหรับ AI](./ai-search)),
อีเมล หรือการ export ข้อความที่ดูเหมือน Markdown จะถูก escape และ URL ที่ไม่ปลอดภัยจะถูกตัดทิ้งเหมือนตอนแปลงเป็น HTML
ตารางกลายเป็นตาราง GFM โดยย่อหน้าในเซลล์เดียวกันเชื่อมด้วย `<br>`
ส่ง `nodes` เพื่อกำหนดวิธีแปลง node ชนิดของคุณเอง

```ts
import { renderMarkdown } from '@easy-cms/richtext'

const markdown = renderMarkdown(post.body) // "## หัวข้อ\n\nย่อหน้าที่มีตัว **หนา**"
```

## ปรับแต่งผลลัพธ์ {#customizing-the-output}

เปลี่ยนหรือเพิ่มตัวแสดงผลของ node ใดก็ได้ ฟังก์ชันจะได้ node และ children ที่แปลงแล้ว:

```ts
import { slugify } from '@easy-cms/core'
import { escapeHtml, renderRichText, safeUrl } from '@easy-cms/richtext'

renderRichText(post.body, {
  nodes: {
    // ห่อรูปด้วย figure พร้อมคำบรรยายจาก alt
    image: (node) => {
      const src = safeUrl(node.attrs?.src)
      const alt = escapeHtml(String(node.attrs?.alt ?? ''))
      return src ? `<figure><img src="${escapeHtml(src)}" alt="${alt}"><figcaption>${alt}</figcaption></figure>` : ''
    },
    // ใส่ id ให้หัวข้อสำหรับทำสารบัญ
    heading: (node, children) => {
      const level = Number(node.attrs?.level ?? 2)
      return `<h${level} id="${escapeHtml(slugify(children))}">${children}</h${level}>`
    },
  },
  // attribute ของทุกลิงก์ เช่น เปิดลิงก์ภายนอกในแท็บใหม่
  linkAttributes: (href) => (href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
})
```

ตัวแสดงผลที่เขียนเองจะได้ attribute ดิบ ให้ escape เองด้วย `escapeHtml` และ `safeUrl` ที่ export ไว้
(children ถูก escape มาแล้ว)

## ขั้นต่อไป {#next-steps}

- [อัปโหลดและ media](./uploads): รูปที่ผู้แก้แทรกลงในเนื้อหา
- [หลายภาษา](./localization): rich text แยกตามภาษา
