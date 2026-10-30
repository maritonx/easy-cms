# @easy-cms/core

The core of Easy CMS: the config, the typed Local API, the REST handler, auth and access control,
hooks, drafts and versions, localization, uploads, webhooks and plugins. Part of
[Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt
and Next.js.

## Install

Start with `npm create easy-cms@latest`, which installs this package with a framework adapter
and a database adapter. By hand:

```bash
npm install @easy-cms/core @easy-cms/db-sqlite
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
// easy-cms.config.ts
import { type CollectionDocument, defineConfig, isAdmin } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

const config = defineConfig({
  secret: process.env.EASY_CMS_SECRET!,
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: { read: () => true, update: isAdmin },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
})

export default config
export type Post = CollectionDocument<typeof config, 'posts'>
```

The Nuxt and Next.js adapters (or `easy-cms serve`) serve the admin and REST API from this config;
`useEasyCMS()` / `getEasyCMS(config)` give you the Local API, typed from it.

> From 1.0, breaking changes come only in a major release, with an upgrade guide. See
> [Versions and deprecations](https://easycms.dev/docs/versioning) and the
> [changelog](https://github.com/maritonx/easy-cms/blob/main/packages/core/CHANGELOG.md).

## Links

[Configuration](https://easycms.dev/docs/configuration) · [Local API](https://easycms.dev/docs/local-api) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
