---
"@easy-cms/drizzle": minor
---

Changing `localization.defaultLocale` keeps every locale's values: migrations (and development push) move them between columns. Snapshots now record the locales; migrations created before this release don't, so create one before the first change.
