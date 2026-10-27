# Local API

::: info What you'll learn
Every function of the typed Local API: finding, creating, updating, deleting, drafts, versions and access options.

**Before this page:** [Configuration](./configuration).
:::

The Local API is how your server code reads and writes content, without HTTP:

```ts
const cms = await useEasyCMS() // Nuxt server routes
const cms = await getEasyCMS(config) // Next.js
```

Outside a framework (scripts, tests):

```ts
import { createEasyCMS } from '@easy-cms/core'
import config from './easy-cms.config'

const cms = await createEasyCMS(config)
// …
await cms.destroy()
```

## Methods

```ts
await cms.find('posts', { where, sort: '-createdAt', limit: 10, page: 1, depth: 1, draft: false })
await cms.findById('posts', 12, { depth: 0 })
await cms.count('posts', { where })
await cms.create('posts', { title: 'Hello' })
await cms.update('posts', 12, { title: 'Hello again' })
await cms.delete('posts', 12)
await cms.findGlobal('site')
await cms.updateGlobal('site', { siteName: 'Easy' })
await cms.upload({ data, name: 'photo.jpg' }, { alt: '' })

// Collections and globals with versions (see Drafts & versions)
await cms.findVersions('posts', 12, { limit: 20, page: 1 })
await cms.findVersion('posts', 12, versionId)
await cms.restoreVersion('posts', 12, versionId)
await cms.unpublish('posts', 12)
await cms.discardDraft('posts', 12)

// Scheduled publishing and webhooks
await cms.schedule('posts', 12, { action: 'publish', at: new Date('2026-10-01T02:00:00Z') })
await cms.runJobs() // what servers do every minute: scheduled jobs and webhook retries
await cms.runScheduled() // only scheduled publishing
await cms.retryWebhooks() // only webhook deliveries that failed earlier
await cms.upcomingSchedules({ limit: 10 }) // next scheduled publishes across the site
await cms.flushWebhooks() // wait for webhook deliveries (serverless)
```

## Find results

`find` returns `{ docs, totalDocs, limit, page, totalPages, hasNextPage, hasPrevPage }`.
`limit: 0` returns every match. `findById` returns `null` when missing; `update` and `delete`
throw `NotFoundError`.

`totalDocs` counts every matching document, which takes time on large collections (hundreds of
thousands of documents). Where only "next page" matters, such as a blog archive or an infinite
scroll, pass `count: false`: `totalDocs` and `totalPages` are `null`, and `hasNextPage` still
says whether there is more. Totals are reused for [`countCacheSeconds`](/reference/config) (5 by
default), so a list many people open is counted once in that time. The documents are always
current; only the total can be that old, also right after a write. `0` counts every time.

Deep pages get slower the further in they are: the database steps over every document before
them. To go through a long list page by page, use a cursor instead of `page`:

```ts
let page = await cms.find('posts', { limit: 20, cursor: '' }) // the first page
while (page.nextCursor) {
  page = await cms.find('posts', { limit: 20, cursor: page.nextCursor })
}
```

Each page takes as long as the first. A cursor goes forward only, has no page numbers or totals
(`page`, `totalDocs` and `totalPages` are `null`), and belongs to its query: keep `where`, `sort`
and `locale` the same, or it is refused. Sorting by a value inside blocks can't use a cursor.

## Options

| Option | Default | |
|---|---|---|
| `where` | — | Filter, below |
| `sort` | `-createdAt` | Field path or list; `-` for descending |
| `limit`, `page` | `10`, `1` | Pagination |
| `count` | `true` | `find` only: `false` skips counting the matches, below |
| `cursor` | — | `find` only: cursor pagination instead of `page`, below |
| `depth` | `1` | Levels of relationships to populate (max 3) |
| `draft` | `false` | Include drafts |
| `locale` | default locale | With [localization](./localization): the locale to read or write, or `'all'` |
| `fallbackLocale` | `true` | Empty localized values fall back to the default locale |
| `overrideAccess` | `true` | `false` applies [access rules](./access-control) for `user` |
| `user` | `null` | The user to check access for |
| `live` | `false` | `update` only: upkeep of the live version, for values a plugin keeps up to date. A pending draft stays pending, and no version is added to the history |

## where

```ts
{
  status: { equals: 'published' },
  views: { gte: 100 },
  title: { like: 'nuxt' }, // case-insensitive contains
  tags: { in: ['vue', 'nuxt'] }, // hasMany: any of
  'seo.title': { exists: true }, // group fields
  'links.url': { like: 'github' }, // fields inside array rows
  or: [{ featured: { equals: true } }, { views: { gt: 1000 } }],
}
```

Operators: `equals`, `not_equals`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `like`, `exists`,
plus `and` / `or`. `not_equals` and `not_in` include empty values. Querying inside a related
document (`author.name`) is not supported.

## Types

Results and inputs are typed from your config: `cms.find('posts')` gives `docs` with `title:
string`, `cms.create` requires required fields, and unknown collection names are errors. See
[TypeScript](./typescript).

## Errors

Errors carry an HTTP-like `status`: `ValidationError` (400, with `errors: [{ field, message }]`),
`UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404),
`PayloadTooLargeError` (413), `TooManyRequestsError` (429), `QueryError` (400).

## Next steps

- [TypeScript](./typescript): the types it returns.
- [REST API](./rest-api): the same over HTTP.
