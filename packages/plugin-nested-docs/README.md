# @easy-cms/plugin-nested-docs

Nested pages for [Easy CMS](https://maritonx.github.io/easy-cms/): a parent for each page, its
breadcrumbs and full path (`/about/team`) kept up to date when a page above it moves, and a tree
in the admin's list.

```ts
import { nestedDocsPlugin } from '@easy-cms/plugin-nested-docs'

export default defineConfig({
  // …
  plugins: [nestedDocsPlugin({ collections: ['pages'] })],
})
```

```ts
import { findByPath, getTree } from '@easy-cms/plugin-nested-docs'

const page = await findByPath(cms, 'pages', '/about/team')
const menu = await getTree(cms, 'pages', { depth: 2 })
```

See [Nested pages](https://maritonx.github.io/easy-cms/guide/nested-docs).
