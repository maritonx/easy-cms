---
"@easy-cms/core": minor
"@easy-cms/plugin-seo": minor
"@easy-cms/plugin-nested-docs": minor
"@easy-cms/plugin-redirects": minor
"@easy-cms/plugin-form-builder": minor
---

Typed plugin fields.

- **`definePlugin<T>(plugin)`** tells the inferred document types what a plugin adds: fields on collections and globals, and whole collections. `CollectionDocument`, `cms.find()` and the rest then know them, with no command to run.
- **The official plugins declare theirs:** `post.meta` (SEO), `page.parent`, `page.path` and `page.breadcrumbs` (nested pages, with the names you give), the `redirects` collection with its `to_<collection>` fields, and the `forms` and `form-submissions` collections.
- `findByPath()` returns the page typed from your config; `getTree()` and `rebuildNestedDocs()` take your typed `cms`.
- New types in core: `PluginTypes`, `TypedPlugin`, `DocumentOf` and `SlugOf` for helpers that take an `EasyCMS<C>`.
