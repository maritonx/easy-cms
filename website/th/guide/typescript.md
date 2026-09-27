# TypeScript {#typescript}

## อนุมาน type จาก config {#inferred-from-the-config}

คง literal type ของ config ไว้ด้วย `defineConfig` แล้ว Local API จะมี type โดยไม่ต้อง
generate ใด ๆ:

```ts
const cms = await getEasyCMS(config)
const { docs } = await cms.find('posts')
docs[0].title // string
docs[0].tags // ('vue' | 'nuxt')[]
docs[0].author // number | User (a populated relationship)
await cms.find('pots') // error: unknown collection
```

ตั้งชื่อ type ที่คุณต้องการ:

```ts
import type { CollectionDocument, CreateInput, GlobalDocument } from '@easy-cms/core'
import type config from './easy-cms.config'

export type Post = CollectionDocument<typeof config, 'posts'>
export type NewPost = CreateInput<typeof config, 'posts'>
export type Site = GlobalDocument<typeof config, 'site'>
```

## Type ที่ generate สำหรับแอปอื่น {#generated-types-for-other-apps}

สำหรับ frontend ที่ import config ของคุณไม่ได้ เช่น Vite SPA ใน repository อื่น
ที่เรียกใช้ REST API:

```bash
npx easy-cms generate:types              # writes easy-cms-types.ts
npx easy-cms generate:types --out ../web/src/cms.ts
```

ไฟล์นี้ไม่มี import: มี interface หนึ่งตัวต่อหนึ่ง collection และ global พร้อม map `Collections` และ
`Globals`

```ts
import type { Collections, Post } from './easy-cms-types'

const res = await fetch('/api/cms/posts?limit=10')
const { docs }: { docs: Post[] } = await res.json()
```

รันคำสั่งนี้อีกครั้งหลังจากเปลี่ยน config
