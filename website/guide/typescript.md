# TypeScript

::: info What you'll learn
How document types come from your config with no build step, how to name them in your code,
and how to generate a types file for apps that can't import the config.

**Before this page:** [Local API](./local-api).
:::

## Inferred from the config

Declare the config with `defineConfig`. It keeps the literal types (slugs, field names, select
options), so the Local API is typed without any generation step:

```ts
const cms = await getEasyCMS(config) // useEasyCMS() in Nuxt
const { docs } = await cms.find('posts')

docs[0].title // string (required: true)
docs[0].excerpt // string | null | undefined (optional)
docs[0].tags // ('vue' | 'nuxt')[] (select with hasMany)
docs[0].author // number | User (a relationship: an id, or the document when populated)
docs[0].status // 'draft' | 'published' (drafts: true)

await cms.find('pots') // error: unknown collection
await cms.create('posts', { titel: 'Hi' }) // error: unknown field, and `title` is missing
```

What each field becomes:

| Field | Type |
|---|---|
| `text`, `textarea`, `email`, `slug`, `date` | `string` (`date` as ISO 8601) |
| `number` | `number` |
| `boolean` | `boolean` |
| `select` | the options as a union; an array of them with `hasMany` |
| `relationship`, `upload` | the id, or the related document when populated; arrays with `hasMany` |
| `group` | an object of its fields |
| `array` | an array of rows with `id` and the row's fields |
| `blocks` | an array of rows, one type per block, told apart by `blockType` |
| `richText` | the Tiptap document |
| `json` | `unknown` |

Fields without `required: true` are optional: `null` or missing. `hidden` fields are not in the
type.

### Blocks

Rows of a `blocks` field are a union; check `blockType` to narrow:

```ts
for (const section of post.sections ?? []) {
  if (section.blockType === 'quote') section.author // only quote rows have author
}
```

## Naming the types

```ts
import type { CollectionDocument, CreateInput, GlobalDocument, UpdateInput } from '@easy-cms/core'
import type config from './easy-cms.config'

export type Post = CollectionDocument<typeof config, 'posts'>
export type NewPost = CreateInput<typeof config, 'posts'>
export type PostChanges = UpdateInput<typeof config, 'posts'>
export type Site = GlobalDocument<typeof config, 'site'>
```

`import type` keeps the config (and its database driver) out of browser bundles, so components
can use `Post` too.

### In Nuxt

Server routes return typed data, and `useFetch` passes the type on to the page:

```ts
// server/api/posts.get.ts
export default defineEventHandler(async () => (await useEasyCMS()).find('posts'))
```

```vue
<script setup lang="ts">
const { data } = await useFetch('/api/posts') // data.value.docs is Post[]
</script>
```

## Generated types for other apps

For a frontend that can't import your config, such as a Vite app in another repository calling
the REST API:

```bash
npx easy-cms generate:types              # writes easy-cms-types.ts
npx easy-cms generate:types --out ../web/src/cms.ts
```

The file has no imports: one interface per collection and global, plus `Collections` and
`Globals` maps.

```ts
import type { Post } from './easy-cms-types'

const res = await fetch('/api/cms/posts?limit=10')
const { docs }: { docs: Post[] } = await res.json()
```

Run it again after changing the config, or in CI to check the file is up to date:

```bash
npx easy-cms generate:types && git diff --exit-code easy-cms-types.ts
```

## Next steps

- [Local API](./local-api): every function and its options.
- [REST API](./rest-api): the same operations over HTTP.
