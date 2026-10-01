# Reading time with a hook

::: info What you'll build
A "minutes to read" number that the CMS computes on every save and editors can see but not
change. **Uses:** [hooks](../hooks), [field access](../access-control#field-access).
:::

## 1. The field

```ts
{
  name: 'readingTime',
  type: 'number',
  label: { en: 'Reading time (min)', th: 'เวลาอ่าน (นาที)' },
  position: 'sidebar',
  // Read-only in the admin and the API; the hook below sets it.
  access: { update: () => false },
}
```

Field access only filters what people send; hooks can still set the value.

## 2. The hook

```bash [pm]
npm install @easy-cms/richtext
```

```ts
import { richTextToPlainText } from '@easy-cms/richtext'

const WORDS_PER_MINUTE = 200

function minutes(body: unknown): number {
  const words = richTextToPlainText(body as never).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

// In the posts collection:
hooks: {
  beforeChange: [
    ({ data }) => (data.body === undefined ? data : { ...data, readingTime: minutes(data.body) }),
  ],
},
```

On an update that doesn't touch `body`, `data.body` is missing and the old value stays.

::: tip Thai text
Thai has no spaces between words, so counting words by spaces undercounts. Count characters
instead, roughly 800–1,000 per minute for Thai:
`Math.round(richTextToPlainText(body).length / 900)`.
:::

## 3. Fill existing posts

The hook runs on save. To fill posts that already exist, save each once:

```ts
const cms = await getEasyCMS(config) // or useEasyCMS() in Nuxt
const { docs } = await cms.find('posts', { limit: 0, draft: true, depth: 0 })
for (const post of docs) await cms.update('posts', post.id, { body: post.body })
```
