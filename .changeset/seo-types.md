---
"@easy-cms/plugin-seo": patch
---

Types that fit what the docs show: generators may return a field as read (`({ doc }) => doc.excerpt`, `({ doc }) => doc.cover`); text, media ids and media documents are used, other values suggest nothing. `seo.head` fits `useHead()` in Nuxt 4.6 (unhead 3), whose link types differ per `rel`.
