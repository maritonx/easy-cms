# @easy-cms/plugin-seo

SEO for [Easy CMS](https://maritonx.github.io/easy-cms/): a `meta` group (title, description,
share image) on the collections and globals you choose, with length meters, a search result
preview and Generate buttons in the admin, and page metadata for Nuxt and Next.js.

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

See [SEO](https://maritonx.github.io/easy-cms/guide/seo).
