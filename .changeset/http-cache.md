---
'@easy-cms/core': minor
'@easy-cms/next': minor
---

HTTP caching of public reads for a CDN. With `httpCache: { sMaxAge, staleWhileRevalidate, purge }` (off by default), lists, documents and globals read without a login, a session or a key, and without drafts, get `Cache-Control: public, max-age=0, s-maxage, stale-while-revalidate`, a weak `ETag` (`304` for a matching `If-None-Match`), and cache tags as `Cache-Tag` and `Surrogate-Key` (`ecms`, `ecms:posts`, `ecms:posts:42`, `ecms:global:site`). Everything else stays `no-store`. Collections and globals can set their own times or `httpCache: false`. `purge` receives the tags of what readers saw change (published saves, publishing, unpublishing, deleting; not drafts). `cacheTags` is exported from `@easy-cms/core` and `@easy-cms/next`, for tagging fetches and `revalidateTag`.
