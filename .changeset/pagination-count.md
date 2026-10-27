---
'@easy-cms/core': minor
'@easy-cms/drizzle': minor
'@easy-cms/db-sqlite': minor
'@easy-cms/db-postgres': minor
---

Lists count less. `find` takes `count: false` (REST `?count=false`): no `totalDocs` and `totalPages` (`null`), and `hasNextPage` from one row more, for archives and infinite scroll on large collections. Counts of paginated lists are reused for `countCacheSeconds` (default 5; `0` counts every time), so a list many people open is counted once in that time; the documents are always current, only the total can be that old. Database adapters can implement the optional `findPage`; without it, `find` runs and its totals are dropped.
