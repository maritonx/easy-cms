# Localization

Content in several languages: localized fields hold one value per locale, other fields are
shared.

```ts
export default defineConfig({
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    {
      slug: 'posts',
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        { name: 'body', type: 'richText', localized: true },
        { name: 'cover', type: 'upload' }, // the same in every language
      ],
    },
  ],
})
```

| Option | Default | |
|---|---|---|
| `locales` | required | Locale codes, e.g. `['th', 'en']` or `['en', 'en-GB']` |
| `defaultLocale` | the first | Used when no locale is given; its values fill empty ones |
| `fallback` | `true` | Reads return the default locale's value when a locale's value is empty |

`localized: true` works on text, textarea, email, slug, rich text, number, boolean, date, JSON,
select, upload and relationship fields. For groups and arrays, localize the fields inside; hasMany
fields can't be localized yet.

## Reading and writing

```ts
await cms.find('posts') // default locale
await cms.find('posts', { locale: 'en' }) // English, falling back to Thai when empty
await cms.findById('posts', id, { locale: 'en', fallbackLocale: false }) // empty stays null
await cms.findById('posts', id, { locale: 'all' }) // title: { th: '…', en: '…' }

await cms.update('posts', id, { title: 'Hello' }, { locale: 'en' }) // Thai title kept
```

- Writes set the given locale's values (the default locale when none is given) and keep the other
  locales. `locale: 'all'` writes `{ [locale]: value }` maps directly.
- `required` and custom `validate` apply to the locale being written.
- `where` and `sort` use the locale being read: `{ locale: 'en', where: { title: { like: 'x' } } }`
  matches English titles. Name a locale explicitly with `title.en`.
- Localized slugs are generated and kept unique per locale; so are `unique` values.
- Versions keep every locale, and restoring brings them all back.

Over REST add `?locale=en` (or `all`) and `?fallback-locale=false`, on reads and writes.

## Admin

Collections and globals with localized fields get a language switcher; localized fields show the
language being edited. Editing shows empty values for untranslated fields instead of the
fallback. The list and live preview follow the chosen language; `preview` receives it as
`locale`:

```ts
preview: ({ doc, locale }) => `/${locale}/posts/${doc.slug}`
```

## Storage

Each localized field gets one column per locale. The default locale keeps the plain column
(`title`), the others add columns (`title__en`). So:

- Turning `localized` on for an existing field keeps its values as the default locale's.
- Adding a locale adds columns: create a migration as for any config change.
- Changing `defaultLocale` later points the plain columns at another locale; move the data in a
  migration if you do.
