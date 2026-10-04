# @easy-cms/plugin-seo

## 0.31.0

### Patch Changes

- Updated dependencies [36fc19b]
  - @easy-cms/core@0.31.0
  - @easy-cms/richtext@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies [f9d5512]
  - @easy-cms/core@0.30.0
  - @easy-cms/richtext@0.30.0

## 0.29.0

### Minor Changes

- 5e92063: The dashboard tells admins what needs attention, and what the system is.
  
  - **Needs attention** (admins only, shown only when something is wrong): webhook deliveries that failed in the last 7 days, emails waiting over an hour or failed, scheduled publishing over 10 minutes late (nothing calls `jobs/run`), no `email`, and no `serverURL` in production. Each links to the new Health checks guide.
  - **System** (admins only): the Easy CMS version, database, file storage, email adapter, plugins with their versions, and field types.
  - Both come from the new `GET <api>/admin/status`, for admins only. Easy CMS doesn't check for new versions.
  - **`definePlugin(plugin, { name, version })`** names a plugin for the dashboard; the official plugins name themselves. `EmailAdapter` gets an optional `name` (`smtp`, `console`). Core exports `VERSION`.
  - In development, the admin's HTML is read on each request, so a rebuilt admin shows up without a restart.

### Patch Changes

- Updated dependencies [5e92063]
  - @easy-cms/core@0.29.0
  - @easy-cms/richtext@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [479e17a]
  - @easy-cms/core@0.28.0
  - @easy-cms/richtext@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [ffa2f84]
  - @easy-cms/core@0.27.0
  - @easy-cms/richtext@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [bcf3c0c]
  - @easy-cms/core@0.26.0
  - @easy-cms/richtext@0.26.0

## 0.25.0

### Minor Changes

- 434599a: Typed plugin fields.
  
  - **`definePlugin<T>(plugin)`** tells the inferred document types what a plugin adds: fields on collections and globals, and whole collections. `CollectionDocument`, `cms.find()` and the rest then know them, with no command to run.
  - **The official plugins declare theirs:** `post.meta` (SEO), `page.parent`, `page.path` and `page.breadcrumbs` (nested pages, with the names you give), the `redirects` collection with its `to_<collection>` fields, and the `forms` and `form-submissions` collections.
  - `findByPath()` returns the page typed from your config; `getTree()` and `rebuildNestedDocs()` take your typed `cms`.
  - New types in core: `PluginTypes`, `TypedPlugin`, `DocumentOf` and `SlugOf` for helpers that take an `EasyCMS<C>`.

### Patch Changes

- Updated dependencies [434599a]
  - @easy-cms/core@0.25.0
  - @easy-cms/richtext@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [230a347]
  - @easy-cms/core@0.24.0
  - @easy-cms/richtext@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [0107902]
  - @easy-cms/core@0.23.0
  - @easy-cms/richtext@0.23.0

## 0.22.2

### Patch Changes

- @easy-cms/core@0.22.2
  - @easy-cms/richtext@0.22.2

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.
- Updated dependencies [d742afc]
  - @easy-cms/core@0.22.1
  - @easy-cms/richtext@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [63995c6]
  - @easy-cms/core@0.22.0
  - @easy-cms/richtext@0.22.0

## 0.21.0

### Minor Changes

- 0e69436: Nested pages.
  
  - **New package `@easy-cms/plugin-nested-docs`:** pages inside pages (About → Team). Each document in the listed collections gets a `parent`, its full `path` (`/about/team`) and its `breadcrumbs`, per language when the slug is localized. When a page gets a new slug or parent, the pages under it are updated too, when it is published; with the redirects plugin their old addresses redirect. A page can't be moved under itself, levels are limited (`maxDepth`), and a page with pages under it can't be deleted (or they move up, with `onDeleteParent: 'orphan'`). `findByPath()`, `getTree()` and `GET /api/cms/tree/:collection` show pages and menus; `npx easy-cms nested:rebuild` works out the paths of pages that existed before. Needs a migration for the new fields.
  - **Relationship `filterOptions`:** which documents a relationship may point to, worked out on the server. The admin's picker offers only those, and saving checks them.
  - **Slug `uniqueWithin`:** slugs unique only among documents with the same value of another field, e.g. `uniqueWithin: 'parent'`.
  - **Tree lists:** `admin: { list: { tree: 'parent' } }` shows a collection's list as a tree; `list.sort` sets the list's default order.
  - **`update(…, { live: true })`:** upkeep of the live version that leaves a pending draft pending and adds no version.
  - **CLI commands from the config:** `commands: [{ name, description, run }]`, e.g. from plugins.
  - **SEO:** `seoMeta({ breadcrumbs })` adds BreadcrumbList JSON-LD.

### Patch Changes

- Updated dependencies [0e69436]
  - @easy-cms/core@0.21.0
  - @easy-cms/richtext@0.21.0

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
