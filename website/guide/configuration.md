# Configuration

Everything about your content lives in `easy-cms.config.ts` at the project root:

```ts
import { defineConfig, isAdmin } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  admin: { locale: 'th' },
  collections: [
    {
      slug: 'posts',
      drafts: true,
      useAsTitle: 'title',
      access: { read: () => true, update: isAdmin },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'siteName', type: 'text' }] }],
})
```

`defineConfig` returns the config unchanged, keeping its literal types so documents can be typed
from it. The config is validated at startup; every problem is reported at once with where it is
and how to fix it.

## Top-level options

| Option | Default | |
|---|---|---|
| `secret` | — | **Required**, at least 32 characters. Signs sessions. Read it from an env var. |
| `db` | — | **Required**. A database adapter: `sqlite()` or `postgres()`. See [Databases](./databases). |
| `serverURL` | — | Public origin such as `https://example.com`. Makes media URLs absolute. |
| `webhooks` | `[]` | Endpoints notified when content changes. See [Webhooks](./webhooks). |
| `cronSecret` | `CRON_SECRET` | Lets a cron run [scheduled jobs](./drafts#scheduled-publishing) at `<api>/jobs/run`. |
| `localization` | — | `{ locales, defaultLocale?, fallback? }`: content in several languages. See [Localization](./localization). |
| `cors` | `[]` | Origins whose browser code may call the REST API, or `'*'` for any (anonymous requests). Origins in `auth.trustedOrigins` are always allowed, with cookies. |
| `routes.api` | `/api/cms` | Where the REST API is served. |
| `admin.path` | `/admin` | Where the admin UI is served. |
| `admin.locale` | `en` | Default admin language: `en` or `th`. |
| `admin.brand` | — | `{ name, logo, color }`: your or your client's brand in the admin. See [Branding the admin](#branding-the-admin). |
| `auth` | | See [Users & auth](./auth). |
| `upload` | | See [Uploads & media](./uploads). |
| `collections` | `[]` | See below. |
| `globals` | `[]` | See below. |
| `plugins` | `[]` | Functions `(config) => config`, run in order before validation. |

## Collections

A collection is a type of content with many documents: posts, products, pages.

| Option | |
|---|---|
| `slug` | URL and table name: lowercase letters, digits, `-`, `_`. |
| `fields` | The [fields](./fields). |
| `labels` | `{ singular, plural }`, each a string or `{ en, th }`. |
| `useAsTitle` | Top-level field shown as the document title in the admin. |
| `icon` | Icon in the admin menu (default `file-text`); one of the names under [Branding the admin](#branding-the-admin). |
| `drafts` | Adds `status` (`draft` \| `published`). See [Drafts](./drafts). |
| `versions` | `true` or `{ max }`: keep a version of every save, with history and restore; with `drafts`, drafts of published documents are kept separately. See [Versions](./drafts#versions). |
| `preview` | `({ doc }) => url`: the page that shows a document, for [live preview](./live-preview). |
| `schedule` | Publish and unpublish at a set time (needs `drafts`). See [Scheduled publishing](./drafts#scheduled-publishing). |
| `access` | `{ read, create, update, delete }`. See [Access control](./access-control). |
| `hooks` | See [Hooks](./hooks). |

Every document also has `id` (integer), `createdAt` and `updatedAt`.

Two collections are built in: [`users`](./auth) and [`media`](./uploads). Declare a collection
with the same slug to add fields, access rules or hooks to them.

Reserved slugs: `admin`, `globals`, `jobs`, `sessions`, `login-attempts`, `document-versions`,
`scheduled-jobs`, `migrations`, `access`.

## Globals

A global has exactly one document: site settings, navigation, a footer.

```ts
globals: [
  {
    slug: 'site',
    label: { en: 'Site settings', th: 'ตั้งค่าเว็บไซต์' },
    access: { read: () => true },
    fields: [
      { name: 'siteName', type: 'text', defaultValue: 'My site' },
      { name: 'menu', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'url', type: 'text' }] },
    ],
  },
],
```

Globals accept `fields`, `label`, `icon`, `drafts`, `versions`, `preview`, `access` (`read`, `update`) and `hooks`
(`beforeChange`, `afterChange`, `afterRead`).

## Branding the admin

Agencies can show their client's brand instead of Easy CMS's:

```ts
admin: {
  brand: {
    name: 'Acme Coffee',     // menu, login page and browser tab
    logo: '/acme-logo.svg',  // a path on your site or an https:// URL
    color: '#b45309',        // main color; lighter and darker shades are derived
  },
},
collections: [
  { slug: 'posts', icon: 'newspaper', fields: [/* … */] },
  { slug: 'menu', icon: 'utensils', fields: [/* … */] },
],
globals: [{ slug: 'site', icon: 'house', fields: [/* … */] }],
```

Text on the brand color turns dark when white would be hard to read. Each user picks light,
dark or their system's theme in the menu.

Icons ([Lucide](https://lucide.dev)): `file-text`, `newspaper`, `book-open`, `notebook`, `folder`, `tag`, `tags`, `image`, `images`, `video`, `music`, `file`, `users`, `user`, `building`, `store`, `shopping-bag`, `shopping-cart`, `package`, `box`, `calendar`, `calendar-days`, `map-pin`, `globe`, `house`, `layout-grid`, `layers`, `star`, `heart`, `message-square`, `mail`, `phone`, `briefcase`, `graduation-cap`, `utensils`, `car`, `settings`, `sliders-horizontal`, `palette`, `megaphone`, `bell`, `link`, `quote`, `circle-help`, `award`, `ticket`, `camera`.

## Plugins

A plugin receives the config and returns a new one:

```ts
const seo = (): Plugin => (config) => ({
  ...config,
  collections: config.collections?.map((c) => ({
    ...c,
    fields: [...c.fields, { name: 'metaDescription', type: 'textarea', maxLength: 160 }],
  })),
})

export default defineConfig({ /* … */ plugins: [seo()] })
```
