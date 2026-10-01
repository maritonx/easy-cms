# @easy-cms/plugin-redirects

Redirects for Easy CMS: a Redirects list under Settings in the admin, and automatic redirects when a published page's address changes. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-redirects
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { redirectsPlugin } from '@easy-cms/plugin-redirects'

export default defineConfig({
  // …
  plugins: [
    redirectsPlugin({
      collections: ['posts'],
      url: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
    }),
  ],
})
```

```ts
import { resolveRedirect } from '@easy-cms/plugin-redirects'

// In your app's middleware
const redirect = await resolveRedirect(cms, new URL(request.url))
if (redirect) return Response.redirect(new URL(redirect.location, request.url), redirect.status)
```

## Links

[Redirects](https://maritonx.github.io/easy-cms/guide/redirects) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
