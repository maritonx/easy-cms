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
<template #plugin-seo>

```ts
import { seoPlugin } from '@easy-cms/plugin-seo'

plugins: [
  seoPlugin({
    collections: ['posts'],
    generateURL: ({ doc }) => `/posts/${doc.slug}`,
  }),
]
// Pages: seoMeta(post), sitemap(cms), robotsTxt(), llmsTxt(cms)
```

</template>
<template #plugin-forms>

```ts
import { formBuilderPlugin } from '@easy-cms/plugin-form-builder'
import { smtp } from '@easy-cms/email-smtp'

email: smtp({ from: 'My Site <no-reply@example.com>' }),
plugins: [formBuilderPlugin({ defaultTo: 'hello@example.com' })]
// Pages: <easy-form form="contact"></easy-form>
```

</template>
<template #plugin-redirects>

```ts
import { redirectsPlugin } from '@easy-cms/plugin-redirects'

plugins: [
  redirectsPlugin({
    collections: ['posts'],
    url: ({ doc }) => `/posts/${doc.slug}`,
  }),
]
// Middleware: await resolveRedirect(cms, url)
```

</template>
<template #plugin-nested-docs>

```ts
import { findByPath, nestedDocsPlugin } from '@easy-cms/plugin-nested-docs'

plugins: [nestedDocsPlugin({ collections: ['pages'] })]

// /about/team → the page, with its breadcrumbs
const page = await findByPath(cms, 'pages', '/about/team')
```

</template>
<template #plugin-mcp>

```ts
import { mcpPlugin } from '@easy-cms/plugin-mcp'

apiKeys: true,
plugins: [mcpPlugin()]
// claude mcp add --transport http easy-cms https://example.com/api/cms/mcp \
//   --header "Authorization: Bearer ecms_…"
```

</template>
</HomePage>
