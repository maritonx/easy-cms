# TypeScript {#typescript}

::: info หน้านี้สอนอะไร
type ของเอกสารสร้างจาก config โดยไม่ต้อง build อย่างไร จะตั้งชื่อ type ใช้ในโค้ดอย่างไร และจะสร้างไฟล์ type
ให้แอปที่ import config ไม่ได้อย่างไร

**ควรอ่านก่อน:** [Local API](./local-api)
:::

## สร้างจาก config {#inferred-from-the-config}

ประกาศ config ด้วย `defineConfig` ซึ่งเก็บ literal type ไว้ (slug, ชื่อ field, ตัวเลือกของ select)
Local API จึงมี type โดยไม่ต้องรันขั้นตอน generate:

```ts
const cms = await getEasyCMS(config) // ใน Nuxt ใช้ useEasyCMS()
const { docs } = await cms.find('posts')

docs[0].title // string (required: true)
docs[0].excerpt // string | null | undefined (ไม่บังคับ)
docs[0].tags // ('vue' | 'nuxt')[] (select แบบ hasMany)
docs[0].author // number | User (relationship: id หรือเอกสารเมื่อ populate)
docs[0].status // 'draft' | 'published' (drafts: true)

await cms.find('pots') // error: ไม่มี collection นี้
await cms.create('posts', { titel: 'Hi' }) // error: ไม่มี field นี้ และขาด `title`
```

แต่ละ field กลายเป็น type อะไร:

| Field | Type |
|---|---|
| `text`, `textarea`, `email`, `slug`, `date` | `string` (`date` เป็น ISO 8601) |
| `number` | `number` |
| `boolean` | `boolean` |
| `select` | union ของตัวเลือก หรือ array ของตัวเลือกเมื่อใช้ `hasMany` |
| `relationship`, `upload` | id หรือเอกสารที่เกี่ยวข้องเมื่อ populate เป็น array เมื่อใช้ `hasMany` |
| `group` | object ของ field ข้างใน |
| `array` | array ของแถวที่มี `id` และ field ของแถว |
| `blocks` | array ของแถว มี type หนึ่งแบบต่อหนึ่ง block แยกกันด้วย `blockType` |
| `richText` | เอกสารของ Tiptap |
| `json` | `unknown` |

field ที่ไม่มี `required: true` เป็นแบบไม่บังคับ คือเป็น `null` หรือไม่มีค่า ส่วน field ที่ `hidden` จะไม่อยู่ใน type

### Blocks {#blocks}

แถวของ field แบบ `blocks` เป็น union ให้ตรวจ `blockType` เพื่อแยกประเภท:

```ts
for (const section of post.sections ?? []) {
  if (section.blockType === 'quote') section.author // เฉพาะแถว quote ที่มี author
}
```

## ตั้งชื่อ type {#naming-the-types}

```ts
import type { CollectionDocument, CreateInput, GlobalDocument, UpdateInput } from '@easy-cms/core'
import type config from './easy-cms.config'

export type Post = CollectionDocument<typeof config, 'posts'>
export type NewPost = CreateInput<typeof config, 'posts'>
export type PostChanges = UpdateInput<typeof config, 'posts'>
export type Site = GlobalDocument<typeof config, 'site'>
```

`import type` ทำให้ config (และ driver ของฐานข้อมูล) ไม่ถูกรวมเข้า bundle ฝั่ง browser component ก็ใช้ `Post` ได้

### ใน Nuxt {#in-nuxt}

server route คืนข้อมูลที่มี type และ `useFetch` ส่ง type ต่อไปให้หน้าเว็บ:

```ts
// server/api/posts.get.ts
export default defineEventHandler(async () => (await useEasyCMS()).find('posts'))
```

```vue
<script setup lang="ts">
const { data } = await useFetch('/api/posts') // data.value.docs เป็น Post[]
</script>
```

## สร้างไฟล์ type สำหรับแอปอื่น {#generated-types-for-other-apps}

สำหรับ frontend ที่ import config ไม่ได้ เช่น แอป Vite ใน repo อื่นที่เรียก REST API:

```bash [pm]
npx easy-cms generate:types              # เขียน easy-cms-types.ts
npx easy-cms generate:types --out ../web/src/cms.ts
```

ไฟล์นี้ไม่มี import: มี interface หนึ่งตัวต่อ collection และ global พร้อม map `Collections` และ `Globals`

```ts
import type { Post } from './easy-cms-types'

const res = await fetch('/api/cms/posts?limit=10')
const { docs }: { docs: Post[] } = await res.json()
```

รันใหม่หลังเปลี่ยน config หรือใน CI เพื่อตรวจว่าไฟล์ยังตรงกับ config:

```bash [pm]
npx easy-cms generate:types && git diff --exit-code easy-cms-types.ts
```

## ขั้นต่อไป {#next-steps}

- [Local API](./local-api): ทุกฟังก์ชันและตัวเลือก
- [REST API](./rest-api): ทำแบบเดียวกันผ่าน HTTP
