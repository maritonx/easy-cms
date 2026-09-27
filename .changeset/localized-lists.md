---
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
---

Localized arrays and hasMany fields: one list per locale (child tables get a `_locale` column; existing rows become the default locale's), queryable as `tags.en`. Reads with `locale: 'all'` no longer turn localized relationships into `null`.
