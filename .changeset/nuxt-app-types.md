---
"@easy-cms/nuxt": patch
---

`useEasyCMS()` is typed in the app's TypeScript project too, not only the server's: typed `$fetch` and `useFetch` routes import server handlers, which `nuxi typecheck` then checked without the Easy CMS types (implicit `any` errors).
