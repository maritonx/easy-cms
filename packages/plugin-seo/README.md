# @easy-cms/plugin-seo

SEO for Easy CMS: meta fields with length meters, a search preview and Generate buttons in the admin; page metadata, sitemaps, robots.txt, hreflang, JSON-LD and llms.txt for your site. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-seo
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { seoPlugin } from '@easy-cms/plugin-seo'

export default defineConfig({
  // …
  plugins: [
    seoPlugin({
      collections: ['posts'],
      generateTitle: ({ doc }) => `${doc.title} | My Blog`,
      generateDescription: ({ doc }) => doc.excerpt,
    }),
  ],
})
```

```ts
import { seoMeta } from '@easy-cms/plugin-seo'

useSeoMeta(seoMeta(post, { url: `/posts/${post.slug}` }).nuxt) // Nuxt
return seoMeta(post, { config, url: `/posts/${post.slug}` }).next // Next.js generateMetadata()
```

## Links

[SEO](https://maritonx.github.io/easy-cms/guide/seo) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
