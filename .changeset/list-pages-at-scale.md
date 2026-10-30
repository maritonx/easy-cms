---
'@easy-cms/core': minor
'@easy-cms/drizzle': minor
'@easy-cms/admin': minor
---

List pages that hold up at 1M documents (#279). Lists show their rows first and the total after
them; past 10,000 matches it reads **10,000+**. **Rows per page** (20, 50 or 100) is remembered in
the browser, the page links show the first, nearby and last pages, and **Go to page** takes a
number. **Next** and **Previous** go by cursor, so they stay fast deep in a large list.
`cms.count()` takes `max`, stopping after `max + 1` matches, and `GET /admin/ui/total/:collection`
gives the admin a list's total.
