# @easy-cms/plugin-graphql

A GraphQL API for Easy CMS: a type, queries and mutations for every collection and global, with the same access rules as REST, batched relationship loading and limits per request. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

> [!WARNING]
> **Experimental.** This package has the same version number as the rest of Easy CMS, but its options, endpoints and data may still change in a minor release, after 1.0 too: it is not covered by the [stability promise](https://easy-cms-website.vercel.app/docs/backups#versioning).

## Install

```bash
npm install @easy-cms/plugin-graphql
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { graphqlPlugin } from '@easy-cms/plugin-graphql'

export default defineConfig({
  // …
  plugins: [graphqlPlugin()],
})
```

```graphql
{
  posts(where: { title: { like: "hello" } }, sort: [createdAt_DESC], limit: 5) {
    docs { id title category { name } }
    totalDocs
  }
}
```

Send it to `/api/cms/graphql`, or open that address in a browser for GraphiQL (outside production).

## Links

[GraphQL](https://maritonx.github.io/easy-cms/guide/graphql) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
