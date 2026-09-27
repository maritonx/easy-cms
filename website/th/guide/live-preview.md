# ตัวอย่างสด (live preview) {#live-preview}

ผู้แก้ไขเห็นหน้าเว็บจริงอยู่ข้างฟอร์ม และหน้านั้นอัปเดตตามที่พิมพ์ทันทีโดยยังไม่ต้องบันทึก

```ts
{
  slug: 'posts',
  preview: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
  fields: [/* … */],
}
```

`preview` คืนค่าหน้าที่แสดงเอกสารนั้น เป็น path บนเว็บหรือ URL แบบเต็ม หรือ `null` ถ้าเอกสารไม่มีหน้า
global ใช้ option เดียวกันได้ จากนั้นหน้า admin จะมีปุ่ม **Preview** ซึ่งเปิดหน้าเว็บใน frame ข้างฟอร์ม

## ทำงานอย่างไร {#how-it-works}

1. หน้า admin โหลดหน้าจาก `preview` ครั้งเดียว
2. ทุกครั้งที่ฟอร์มเปลี่ยน admin จะส่งข้อมูลในฟอร์มไปที่ server (`POST /:collection/:id/preview`) ซึ่งคืน
   เอกสารในรูปแบบเดียวกับการอ่านปกติ คือ populate relationship และไฟล์อัปโหลด และรัน hook `afterRead` แล้ว
   โดยไม่บันทึกอะไร
3. admin ส่งเอกสารนั้นไปให้หน้าเว็บด้วย `postMessage` แล้วหน้าเว็บ render ใหม่

ดังนั้นหน้าเว็บต้อง render จากเอกสารที่ได้รับ helper ด้านล่างช่วยเชื่อมส่วนนี้ให้

## Nuxt {#nuxt}

`useLivePreview` ถูก auto-import ให้แล้ว ส่ง ref ที่เก็บเอกสารให้มัน:

```vue
<script setup lang="ts">
import { renderRichText } from '@easy-cms/richtext'

const { data: post } = await useFetch(`/api/posts/${useRoute().params.slug}`)
useLivePreview(post)
const html = computed(() => renderRichText(post.value?.body))
</script>
```

## Next.js {#next-js}

โหลดข้อมูลใน Server Component แล้ว render ใน Client Component ด้วย `useLivePreview`:

```tsx
'use client'
import { useLivePreview } from '@easy-cms/next/live-preview'

export function PostView({ post: initial }: { post: Post }) {
  const post = useLivePreview(initial)
  return <h1>{post.title}</h1>
}
```

## Frontend อื่นๆ {#any-frontend}

```ts
import { subscribeLivePreview } from '@easy-cms/core/live-preview'

const stop = subscribeLivePreview((doc) => render(doc), {
  origin: 'https://cms.example.com', // the admin's origin; default: the page's own
})
```

นอก frame ของหน้า admin helper เหล่านี้ไม่ทำอะไร จึงปล่อยไว้ในโค้ด production ได้

## ข้อควรรู้ {#things-to-know}

- ให้ render rich text ฝั่ง client ด้วย (`renderRichText` จาก `@easy-cms/richtext` ใช้ในเบราว์เซอร์ได้)
  เพราะเอกสารที่ส่งมามี rich text เป็น JSON
- เมื่อใช้ adapter ของ Nuxt และ Next หน้าเว็บกับหน้า admin อยู่ origin เดียวกันและใช้ session เดียวกัน หน้าที่อ่าน
  ฉบับร่างให้ผู้ใช้ที่เข้าสู่ระบบ (อย่างที่ตัวอย่างทำ) จึงแสดงฉบับร่างที่ยังไม่เคยเผยแพร่ได้ด้วย ส่วน frontend ที่อยู่
  คนละ origin จะแสดงหน้าที่เผยแพร่อยู่ตอนโหลดครั้งแรก และเปลี่ยนเป็นเอกสารที่กำลังแก้ไขเมื่อ admin ส่งมา
- ดูตัวอย่างได้เฉพาะผู้ใช้ที่มีสิทธิ์แก้ไขเอกสารนั้น (หรือสิทธิ์สร้าง สำหรับเอกสารใหม่)
