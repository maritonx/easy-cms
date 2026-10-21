---
"@easy-cms/core": patch
---

Reads with `locale: 'all'` are typed as they return: `find`, `findById` and `findGlobal` type localized fields as `{ [locale]: value }` maps of the config's locales (localized relationships as ids). `CollectionDocument` and `GlobalDocument` take a third parameter, `true`, for that shape.
