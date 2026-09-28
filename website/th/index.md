---
layout: home
title: Easy CMS
titleTemplate: CMS ที่อยู่ในแอปของคุณ
---

<HomePage lang="th">
<template #config>

```ts [easy-cms.config.ts]
import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET,
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
})
```

</template>
<template #nuxt>

```ts [server/api/posts.get.ts]
export default defineEventHandler(async () => {
  const cms = await useEasyCMS()
  // type มาจาก config: post.title เป็น string
  const { docs } = await cms.find('posts', { sort: '-createdAt' })
  return docs
})
```

</template>
<template #next>

```tsx [app/page.tsx]
import { getEasyCMS } from '@easy-cms/next'
import config from '@/easy-cms.config'

export default async function Home() {
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', { sort: '-createdAt' })
  return docs.map((post) => <h2 key={post.id}>{post.title}</h2>)
}
```

</template>
<template #plugin>

```ts
import { seoPlugin } from '@easy-cms/plugin-seo'

plugins: [seoPlugin({ collections: ['posts'] })]
```

</template>
</HomePage>
