---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/nuxt": minor
"@easy-cms/plugin-seo": minor
---

Plugins can now add REST endpoints and admin UI, and the first official plugin is here.

- `endpoints: [{ path, method, handler }]` adds routes under the REST API, with the same auth, CSRF and error format.
- Admin components: Web Components from `admin.modules` can replace a field's input (`admin.component`), sit below a field (`admin.after`) or add panels to the edit page's side column (`admin.sidebar`). The admin passes the form's state as properties and listens for `change` and `set-field` events.
- `@easy-cms/plugin-seo`: meta title, description and share image with length meters, a search result preview and Generate buttons in the admin, and `seoMeta()` for Nuxt's `useSeoMeta` and Next.js `generateMetadata`.
