# @easy-cms/plugin-multi-tenant

Several sites or clients in one Easy CMS: each tenant has its own documents in the collections you name, its own value of the globals you name, and its own members with a role there. Admins switch tenants at the top of the menu; frontends name their tenant with a header or their domain. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-multi-tenant
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { multiTenantPlugin } from '@easy-cms/plugin-multi-tenant'

export default defineConfig({
  // …
  plugins: [multiTenantPlugin({ collections: ['posts', 'pages', 'media'], globals: ['site'] })],
})
```

```bash
curl -H 'x-easy-cms-tenant: brand-a' https://cms.example.com/api/cms/posts
```

## Links

[Multi-tenant](https://maritonx.github.io/easy-cms/guide/multi-tenant) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
