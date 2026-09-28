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
ขีดเส้นใต้ โค้ดในบรรทัด ลิงก์ รายการแบบจุดและตัวเลข คำพูดอ้างอิง รูปจากคลังสื่อ (หรือ URL) ย้อนกลับและทำซ้ำ
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

## แสดงบนหน้าเว็บ {#showing-it-on-a-page}

ติดตั้งตัวแปลง:

```bash
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
เส้นคั่น และรูป ส่วน mark ที่รองรับ: ตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า โค้ด และลิงก์
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
