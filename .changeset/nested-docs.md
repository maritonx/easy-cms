---
"@easy-cms/plugin-nested-docs": minor
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/admin": minor
"@easy-cms/plugin-seo": minor
"easy-cms": minor
---

Nested pages.

- **New package `@easy-cms/plugin-nested-docs`:** pages inside pages (About → Team). Each document in the listed collections gets a `parent`, its full `path` (`/about/team`) and its `breadcrumbs`, per language when the slug is localized. When a page gets a new slug or parent, the pages under it are updated too, when it is published; with the redirects plugin their old addresses redirect. A page can't be moved under itself, levels are limited (`maxDepth`), and a page with pages under it can't be deleted (or they move up, with `onDeleteParent: 'orphan'`). `findByPath()`, `getTree()` and `GET /api/cms/tree/:collection` show pages and menus; `npx easy-cms nested:rebuild` works out the paths of pages that existed before. Needs a migration for the new fields.
- **Relationship `filterOptions`:** which documents a relationship may point to, worked out on the server. The admin's picker offers only those, and saving checks them.
- **Slug `uniqueWithin`:** slugs unique only among documents with the same value of another field, e.g. `uniqueWithin: 'parent'`.
- **Tree lists:** `admin: { list: { tree: 'parent' } }` shows a collection's list as a tree; `list.sort` sets the list's default order.
- **`update(…, { live: true })`:** upkeep of the live version that leaves a pending draft pending and adds no version.
- **CLI commands from the config:** `commands: [{ name, description, run }]`, e.g. from plugins.
- **SEO:** `seoMeta({ breadcrumbs })` adds BreadcrumbList JSON-LD.
