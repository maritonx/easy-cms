---
'@easy-cms/core': minor
'@easy-cms/drizzle': minor
'@easy-cms/db-sqlite': minor
'@easy-cms/db-postgres': minor
---

Cursor pagination. `find` takes `cursor` (REST `?cursor=`): `''` for the first page, then the page's `nextCursor`. Each page takes as long as the first, however deep, with no page numbers or totals. A cursor belongs to its query (where, sort, locale) and is refused with another; sorting by a value inside blocks can't use one. The new `maxPage` option caps how deep API clients may page with `page` (the signed-in admin keeps its pages); deeper requests get 400, pointing to `cursor`. No limit by default. Database adapters can implement the optional `findAfter`.
