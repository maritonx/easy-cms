# @easy-cms/plugin-seo

## 0.20.1

### Patch Changes

- @easy-cms/core@0.20.1
  - @easy-cms/richtext@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b7564cb]
  - @easy-cms/core@0.20.0
  - @easy-cms/richtext@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [34d5e66]
  - @easy-cms/core@0.19.0
  - @easy-cms/richtext@0.19.0

## 0.18.0

### Minor Changes

- b0bfcad: SEO for AI search and assistants.
  
  - **AI crawlers:** `robotsTxt({ ai: { training: false } })` keeps AI training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot…) out while AI search (OAI-SearchBot, Claude-SearchBot, PerplexityBot) and assistants opening a page for someone may still read and cite your pages. Each group (`training`, `search`, `user`) can be set; all are allowed by default. `rules` adds other crawlers, and `AI_CRAWLERS` lists the known ones.
  - **llms.txt:** `llmsTxt(cms)` writes a short Markdown index of the site (llmstxt.org) from the same pages as the sitemap, and `llmsFullTxt(cms)` the Markdown of every page in one file. Set the title, summary and links to Markdown pages with the plugin's `llms` option.
  - **Markdown pages:** `docMarkdown(cms, { collection, doc })` renders a document as Markdown (title, description, dates, rich text, long text and the text in blocks), for routes like `/posts/hello.md`; `markdown` in the plugin's options writes your own per collection. `@easy-cms/richtext` has `renderMarkdown()`.
  - **IndexNow:** `indexNow: { key }` tells Bing and other IndexNow search engines about pages as they are published, changed, unpublished or deleted, in batches and only for public https addresses. `indexNowKeyFile()` serves the key file in Nuxt and Next.js apps.
  - The standalone server also serves `/llms.txt`, `/llms-full.txt` and the IndexNow key file.

### Patch Changes

- Updated dependencies [b0bfcad]
  - @easy-cms/richtext@0.18.0
  - @easy-cms/core@0.18.0

## 0.17.0

### Minor Changes

- 0507a14: SEO for the whole site, not just each page.
  
  - **Sitemap:** `sitemap(cms)` (the shape of Next.js `app/sitemap.ts`) and `sitemapXml(cms)` list the pages visitors can see: published documents with an address from `generateURL`, with `lastmod` and hreflang links to every locale. Over 50,000 addresses become a sitemap index.
  - **robots.txt:** `robotsTxt({ config })` keeps crawlers out of the admin and the API (not uploaded files) and points them to the sitemap; `disallowAll` for staging.
  - **Hide from search engines:** a new `meta.noindex` checkbox adds `robots: noindex` and leaves the page out of the sitemap. It is a new column: run `easy-cms migrate:create` after updating.
  - **seoMeta:** `url: (doc, locale) => …` adds hreflang links and `x-default`; `locale` adds `og:locale`; `type: 'article'` adds the published and modified times and author. It also returns `jsonLd` (BlogPosting or WebPage) and `head` for Nuxt's `useHead()`. `siteJsonLd()` makes Organization and WebSite data, and `jsonLdScript()` renders JSON-LD safely in a `<script>`.
  - **Root endpoints:** `endpoints` accept `root: true` to serve a path from the site's root, e.g. `/robots.txt`. The standalone server (`easy-cms serve`) serves them, so it has `/sitemap.xml` and `/robots.txt` with the SEO plugin; Nuxt and Next.js apps add the routes themselves. `createRootEndpointHandler(cms)` is exported for other servers.

### Patch Changes

- Updated dependencies [0507a14]
  - @easy-cms/core@0.17.0

## 0.16.1

### Patch Changes

- Updated dependencies [8b14b83]
  - @easy-cms/core@0.16.1

## 0.16.0

### Patch Changes

- @easy-cms/core@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [fdb3985]
  - @easy-cms/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [6c7eb74]
  - @easy-cms/core@0.14.0

## 0.13.1

### Patch Changes

- @easy-cms/core@0.13.1

## 0.13.0

### Minor Changes

- bf9fa90: Plugins can now add REST endpoints and admin UI, and the first official plugin is here.
  
  - `endpoints: [{ path, method, handler }]` adds routes under the REST API, with the same auth, CSRF and error format.
  - Admin components: Web Components from `admin.modules` can replace a field's input (`admin.component`), sit below a field (`admin.after`) or add panels to the edit page's side column (`admin.sidebar`). The admin passes the form's state as properties and listens for `change` and `set-field` events.
  - `@easy-cms/plugin-seo`: meta title, description and share image with length meters, a search result preview and Generate buttons in the admin, and `seoMeta()` for Nuxt's `useSeoMeta` and Next.js `generateMetadata`.

### Patch Changes

- Updated dependencies [bf9fa90]
  - @easy-cms/core@0.13.0
