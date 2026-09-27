# Live preview

Editors see the real page next to the form, updated as they type, before anything is saved.

```ts
{
  slug: 'posts',
  preview: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
  fields: [/* … */],
}
```

`preview` returns the page that shows a document: a path on the site or an absolute URL, or
`null` when it has no page. Globals take the same option. The admin then shows a **Preview**
button; the page opens in a frame beside the form.

## How it works

1. The admin loads the page from `preview` once.
2. On every change it sends the form to the server (`POST /:collection/:id/preview`), which
   returns the document as a normal read would: relationships and uploads populated, `afterRead`
   hooks applied. Nothing is saved.
3. The admin posts that document to the page with `postMessage`; the page renders it.

So the page has to render from the document it receives. The helpers below do the wiring.

## Nuxt

`useLivePreview` is auto-imported. Give it the ref that holds the document:

```vue
<script setup lang="ts">
import { renderRichText } from '@easy-cms/richtext'

const { data: post } = await useFetch(`/api/posts/${useRoute().params.slug}`)
useLivePreview(post)
const html = computed(() => renderRichText(post.value?.body))
</script>
```

## Next.js

Load in a Server Component, render in a Client Component with `useLivePreview`:

```tsx
'use client'
import { useLivePreview } from '@easy-cms/next/live-preview'

export function PostView({ post: initial }: { post: Post }) {
  const post = useLivePreview(initial)
  return <h1>{post.title}</h1>
}
```

## Any frontend

```ts
import { subscribeLivePreview } from '@easy-cms/core/live-preview'

const stop = subscribeLivePreview((doc) => render(doc), {
  origin: 'https://cms.example.com', // the admin's origin; default: the page's own
})
```

Outside the admin's frame the helpers do nothing, so they can stay in production code.

## Things to know

- Render rich text on the client too (`renderRichText` from `@easy-cms/richtext` works in the
  browser), since the document carries the rich text JSON.
- With the Nuxt and Next adapters, the page and the admin share an origin and the editor's
  session, so a page that reads drafts for logged-in users (as the examples do) also shows drafts
  that were never published. A frontend on another origin gets the published page on first load
  and the edited document once the admin sends it.
- Only users who may update a document (or create one, for new documents) can preview it.
