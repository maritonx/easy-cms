# Rich text {#rich-text}

field แบบ `richText` แก้ไขในหน้า admin ด้วย [Tiptap](https://tiptap.dev) (หัวข้อ, ตัวหนา,
ตัวเอียง, ขีดเส้นใต้, โค้ด, ลิงก์, รายการ, ข้อความอ้างอิง, รูปภาพจากคลัง media) และจัดเก็บเป็น
Tiptap JSON

แสดงผลด้วย `@easy-cms/richtext`:

```bash
npm install @easy-cms/richtext
```

```ts
import { renderRichText, richTextToPlainText } from '@easy-cms/richtext'

const html = renderRichText(post.body) // safe to insert as HTML
const excerpt = richTextToPlainText(post.body).slice(0, 160)
```

`renderRichText` escape ข้อความและ attribute ทั้งหมด และตัด URL ที่ไม่ปลอดภัยทิ้ง (`javascript:`, `data:`
และทุกอย่างที่ไม่ใช่ http(s), mailto, tel และลิงก์แบบ relative) ผลลัพธ์จึงปลอดภัยสำหรับ
`v-html` หรือ `dangerouslySetInnerHTML` ลิงก์ภายนอกจะได้ `rel="noopener noreferrer"`

ปรับแต่งผลลัพธ์ได้ในแต่ละ node:

```ts
renderRichText(post.body, {
  nodes: {
    image: (node) => `<figure><img src="${node.attrs?.src}" alt=""></figure>`,
  },
})
```

renderer ที่กำหนดเองจะได้รับ attribute ดิบ ต้อง escape เอง (มี `escapeHtml`, `safeUrl` ให้ใช้งาน)
