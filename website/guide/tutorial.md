# Tutorial: build a blog

::: info What you'll learn
Build a small blog from an empty project to production: content model, admin, pages, drafts,
live preview, SEO and deployment. It takes about 30 minutes. Pick Nuxt or Next.js in the code
tabs; everything else is the same.

**Before this page:** nothing. You need Node.js 22.12 or newer.
:::

## 1. Create the project

::: code-group

```bash [Nuxt]
npx nuxi@latest init my-blog
cd my-blog
npx create-easy-cms --db sqlite --yes
```

```bash [Next.js]
npx create-next-app@latest my-blog --ts --app --no-src-dir
cd my-blog
npx create-easy-cms --db sqlite --yes
```

:::

`create-easy-cms` installs the packages, writes `easy-cms.config.ts`, puts a random
`EASY_CMS_SECRET` in `.env` and connects the admin and the API to your app. SQLite keeps
everything in one file (`cms.db`), which is all you need until you deploy.

## 2. Describe the content

Replace `easy-cms.config.ts` with a blog: categories, and posts with drafts and history.

```ts [easy-cms.config.ts]
import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' }),
  collections: [
    {
      slug: 'categories',
      admin: { order: 2, editIn: 'drawer' }, // small: edit in a panel over the list
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'name' },
      ],
    },
    {
      slug: 'posts',
      admin: { order: 1 }, // first in the menu
      drafts: true, // draft / published
      versions: true, // history and restore
      useAsTitle: 'title',
      access: {
        // Visitors see published posts; logged-in editors see drafts too.
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
      },
      fields: [
        { name: 'title', type: 'text', required: true, maxLength: 120 },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'excerpt', type: 'textarea', maxLength: 300 },
        { name: 'cover', type: 'upload' },
        { name: 'body', type: 'richText' },
        { name: 'category', type: 'relationship', to: 'categories', admin: { position: 'sidebar' } },
        { name: 'publishedAt', type: 'date', admin: { position: 'sidebar' } },
      ],
    },
  ],
})
```

In development the database follows the config: save the file and the tables change.

## 3. Open the admin

```bash [pm]
npm run dev
```

Go to `http://localhost:3000/admin`. There are no users yet, so the admin asks for the first
admin account. Then you land on the dashboard.

<Screenshot name="dashboard" alt="The dashboard after logging in" />

Create a category or two (they open in a panel), then a post: write a title (the slug fills in
by itself), an excerpt, some body text, pick a cover and a category, and press **Publish**.

<Screenshot name="edit" alt="Writing a post" />

## 4. List the posts

::: code-group

```ts [Nuxt: server/api/posts.get.ts]
export default defineEventHandler(async () => {
  const cms = await useEasyCMS()
  const { docs } = await cms.find('posts', { sort: '-publishedAt', limit: 20 })
  return docs
})
```

```tsx [Next.js: app/page.tsx]
import { getEasyCMS } from '@easy-cms/next'
import Link from 'next/link'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', { sort: '-publishedAt', limit: 20 })
  return (
    <ul>
      {docs.map((post) => (
        <li key={post.id}>
          <Link href={`/posts/${post.slug}`}>{post.title}</Link>
        </li>
      ))}
    </ul>
  )
}
```

:::

For Nuxt, show them in `app/pages/index.vue`:

```vue
<script setup lang="ts">
const { data: posts } = await useFetch('/api/posts')
</script>

<template>
  <ul>
    <li v-for="post in posts" :key="post.id">
      <NuxtLink :to="`/posts/${post.slug}`">{{ post.title }}</NuxtLink>
    </li>
  </ul>
</template>
```

`find` returns published posts only, and `post.title` is typed as `string` straight from the
config: try misspelling it.

## 5. Show one post

Install the rich text renderer:

```bash [pm]
npm install @easy-cms/richtext
```

::: code-group

```ts [Nuxt: server/api/posts/[slug].get.ts]
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  const user = await useEasyCMSUser(event)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: getRouterParam(event, 'slug') } },
    limit: 1,
    user, // editors see drafts, visitors only published posts
    overrideAccess: false,
    draft: user !== null,
  })
  if (!docs[0]) throw createError({ statusCode: 404 })
  return docs[0]
})
```

```tsx [Next.js: app/posts/[slug]/page.tsx]
import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import { renderRichText } from '@easy-cms/richtext'
import { notFound } from 'next/navigation'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    user, // editors see drafts, visitors only published posts
    overrideAccess: false,
    draft: user !== null,
  })
  const post = docs[0]
  if (!post) notFound()
  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: renderRichText(post.body) }} />
    </article>
  )
}
```

:::

For Nuxt, the page `app/pages/posts/[slug].vue`:

```vue
<script setup lang="ts">
import { renderRichText } from '@easy-cms/richtext'

const route = useRoute()
const { data: post } = await useFetch(`/api/posts/${route.params.slug}`, {
  headers: useRequestHeaders(['cookie']), // so editors see their drafts
})
const html = computed(() => renderRichText(post.value?.body))
</script>

<template>
  <article v-if="post">
    <h1>{{ post.title }}</h1>
    <div v-html="html" />
  </article>
</template>
```

`renderRichText` escapes everything, so its HTML is safe to insert.

## 6. Drafts and history

Open your post, change the title and press **Save draft**. The site still shows the published
version; the admin marks the post as having unpublished changes. Press **Publish** when ready.
Every save is kept in **History** on the right: open an older version and restore it.

Want it live at 9:00 tomorrow? Add `schedule: true` to the posts collection, and use
**Schedule** next to Publish. See [Drafts, versions & scheduling](./drafts).

## 7. Live preview

Tell Easy CMS where a post is shown, and let the page follow the form:

```ts
// in the posts collection
preview: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
```

::: code-group

```vue [Nuxt: app/pages/posts/[slug].vue]
<script setup lang="ts">
// …after useFetch
useLivePreview(post) // auto-imported
</script>
```

```tsx [Next.js: app/posts/[slug]/post-view.tsx]
'use client'
import { useLivePreview } from '@easy-cms/next/live-preview'

// Render the post here, and use <PostView post={post} /> in the page.
export function PostView({ post: initial }: { post: { title: string } }) {
  const post = useLivePreview(initial)
  return <h1>{post.title}</h1>
}
```

:::

Press **Preview** in the editor: the real page appears next to the form and changes as you type.

<Screenshot name="preview" alt="Live preview next to the form" />

## 8. SEO

```bash [pm]
npm install @easy-cms/plugin-seo
```

```ts [easy-cms.config.ts]
import { seoPlugin } from '@easy-cms/plugin-seo'

export default defineConfig({
  // …
  plugins: [
    seoPlugin({
      collections: ['posts'],
      generateTitle: ({ doc }) => `${doc.title} | My Blog`,
      generateDescription: ({ doc }) => doc.excerpt as string,
    }),
  ],
})
```

Posts now have an SEO group with length meters, a search preview and Generate buttons. Use
`seoMeta(post)` in the post page for the `<title>`, description and share tags; see
[SEO](./seo#on-your-pages).

## 9. Deploy

1. **Create the first migration.** Production never changes the database on its own:

   ```bash [pm]
   npx easy-cms migrate:create init
   git add easy-cms/migrations && git commit -m "CMS schema"
   ```

2. **Pick a database.** SQLite works on a server with a persistent disk. On serverless
   platforms, switch to Postgres: `npm install @easy-cms/db-postgres` and
   `db: postgres({ url: process.env.DATABASE_URL })`. See [Databases](./databases).

3. **Set the environment** on the server: `EASY_CMS_SECRET` (a new random value, not the one
   from your laptop), `DATABASE_URL`, and `NODE_ENV=production`.

4. **Migrate, then start**, on every deploy:

   ```bash [pm]
   npx easy-cms migrate
   npm run build && npm start
   ```

5. **Store uploads safely.** Files go to `uploads/` by default; on serverless or several
   servers, use S3 or Cloudflare R2 (see [Uploads](./uploads)).

Go through the [checklist before going live](./security#checklist-before-going-live), and set up
[backups](./backups).

## Next steps

- [Recipes](./recipes/): short answers for common tasks.
- [Access control](./access-control): authors who edit only their own posts.
- [Localization](./localization): the blog in Thai and English.
