---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Saved views of the admin's lists (#87): a list's filters, search, sort, columns, rows per page and row height are saved as a view, a tab above the list, for yourself or shared with everyone who may read the collection. Views can be updated, renamed, deleted and chosen as the one a list opens with; links open them (`?view=<id>`). `admin.views` in a collection's config adds views for everyone. Views are kept in a new internal `saved-views` table: after upgrading, run `easy-cms migrate:create` and deploy the migration.
