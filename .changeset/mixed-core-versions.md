---
"@easy-cms/drizzle": patch
"easy-cms": patch
---

`@easy-cms/drizzle` and `easy-cms` 1.50.0 failed to load beside `@easy-cms/core` 1.49 ("does not provide an export named 'importDefault'"), which npm installs when a project pins core and gets the newest database adapter. They look the loader up when a data migration or `easy-cms seed` needs it, and say to upgrade every package together if core is older.
