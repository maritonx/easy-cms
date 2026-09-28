# Get your site ready for search engines

::: info What you'll build
Pages with good titles, descriptions and share cards, a sitemap and robots.txt, links between
the Thai and English versions, and structured data, then the site submitted to Google.
**Uses:** [SEO plugin](../seo), [localization](../localization).
:::

## Add the plugin with real addresses

Set `admin.siteUrl` to the public address, and make `generateURL` return each page's real path,
per locale. Everything below uses it.

```ts [easy-cms.config.ts]
import { seoPlugin } from '@easy-cms/plugin-seo'

export default defineConfig({
  admin: { siteUrl: 'https://example.com' },
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  plugins: [
    seoPlugin({
      collections: ['posts'],
      globals: ['site'],
      generateTitle: ({ doc }) => (doc.title ? `${doc.title} | My Blog` : null),
      generateDescription: ({ doc }) => doc.excerpt ?? null,
      generateImage: ({ doc }) => doc.cover ?? null,
      generateURL: ({ doc, collection, locale }) =>
        collection === 'posts'
          ? doc.slug ? `/${locale}/posts/${doc.slug}` : null
          : `/${locale}`,
    }),
  ],
})
```

Create a migration for the new fields: `npx easy-cms migrate:create seo`.

## Metadata on every page

In each page that shows a document, use `seoMeta()` with the same address. `type: 'article'` for
posts adds the publish date and BlogPosting data. See [On your pages](../seo#on-your-pages) for
Nuxt and Next.js.

```ts
const seo = seoMeta(post, {
  config,
  locale,
  url: (p, l) => `/${l}/posts/${p.slug}`,
  type: 'article',
})
```

Put `siteJsonLd({ name, url, logo })` in the layout once, so search engines know who publishes
the site.

## Sitemap and robots.txt

Add the two routes from [Sitemap](../seo#sitemap) and [robots.txt](../seo#robots-txt). Then check:

```bash
curl https://example.com/robots.txt
curl https://example.com/sitemap.xml
```

The sitemap should list your published posts in both languages, each with `xhtml:link` lines
to the other. Drafts and pages marked **Hide from search engines** are not in it.

## Check a page

1. Open a post and view its source: `<title>`, `<meta name="description">`, `og:*` tags,
   `<link rel="canonical">`, and `<link rel="alternate" hreflang="…">` for each language.
2. Paste its address into Google's [Rich Results Test](https://search.google.com/test/rich-results)
   to check the structured data.
3. Share it in a chat app to see the card with the share image.

## Tell Google

1. Add the site in [Google Search Console](https://search.google.com/search-console) and verify it.
2. Under **Sitemaps**, submit `https://example.com/sitemap.xml`.
3. Use **URL inspection** on a new post to ask for it to be crawled.

Search Console then shows which pages are indexed, and why others are not.

## Staging sites

A staging copy should stay out of search. Turn it off in `robots.txt` with your own variable
(not `NODE_ENV`, which is `production` on staging too):

```ts
robotsTxt({ config, disallowAll: process.env.SITE_ENV !== 'production' })
```
