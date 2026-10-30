# @easy-cms/plugin-nested-docs

Nested pages for Easy CMS: a parent for each page, its full path (`/about/team`) and breadcrumbs kept up to date when a page above it moves, and a tree in the admin. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-nested-docs
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

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

## Links

[Nested pages](https://easycms.dev/docs/nested-docs) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
