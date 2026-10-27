# Search

::: info What you'll learn
Search published content by relevance, Thai included, with a search adapter: what is indexed,
how it stays current, and how readers' access is kept.

**Before this page:** [Configuration](./configuration), [Drafts](./drafts).
:::

Filters with `like` find documents whose field contains some text. On Postgres,
[`index: 'trigram'`](./databases#at-1-000-000-posts) keeps that fast on large collections, in
Thai as in other languages. That is enough for an admin list or a filter on one field.

A search box on a site wants more: one query across several fields and collections, the best
matches first, and words found where they appear in rich text and blocks. That is what a
**search adapter** is for.

```ts
import { defineConfig, memorySearch } from '@easy-cms/core'

export default defineConfig({
  search: memorySearch(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      search: { fields: ['title', 'excerpt', 'body', 'seo.description'] },
      fields: [/* … */],
    },
  ],
})
```

```ts
const { hits, total } = await cms.search('น้ำท่วม', { limit: 10 })
// hits: [{ collection: 'posts', doc: { id, title, … } }, …], best match first
```

## What is indexed

- Collections with `search` only. `fields` lists what to index, **most important first**: a
  match in the title ranks above a match in the body.
- Text, textarea, email, slug and select fields; rich text as its plain text; arrays, groups and
  blocks as all the text inside them. Paths go through groups: `seo.description`.
- **Published documents only.** With [drafts](./drafts), a draft isn't indexed, and a draft saved
  on a published document leaves the published version in the index until it is published.
  Unpublishing or deleting a document takes it out.
- With [localization](./localization), each locale is indexed on its own; searches look in one
  locale (the default unless `locale` is given).

The configuration is checked at startup: a field that doesn't exist or holds no text, or `search`
on a collection without an adapter, stops it with the reason.

## Results and access

The index only knows ids. `cms.search()` asks it for the best matches, then reads those
documents like `find`, with the access options you pass:

```ts
// As a visitor would see them: their read access applies.
await cms.search(q, { overrideAccess: false, user: null })
```

- A document the reader may not read is left out of the page, so a page can hold fewer
  documents than `limit`. `total` counts every match, before access.
- Options: `collections` (default: all with `search`), `locale`, `limit` (default 10, at most
  100), `page`, `depth`.

Over REST, `GET <api>/search` takes `q`, `collections` (comma-separated), `locale`, `limit`,
`page` and `depth`, and applies the caller's access:

```http
GET /api/cms/search?q=coffee&collections=posts,pages&limit=5
```

The admin's command palette (<kbd>⌘K</kbd> or <kbd>Ctrl K</kbd>) lists the index's matches
first, then documents whose title matches, drafts included.

## Keeping the index current

Saving, publishing, unpublishing and deleting a document updates the index right after the save.
The index reads the document again rather than taking what the save had, so a late or repeated
update is harmless.

- Without the [outbox](./hooks#outbox), indexing runs in the background; a failure is logged
  and the index stays behind until the document is saved again or the index is rebuilt.
- With `outbox: true`, indexing is a step of the outbox entry: retried until it succeeds, and
  listed under **Settings → Jobs → Outbox** if it gives up.

`easy-cms search:reindex [collection]` (or `cms.reindexSearch()`) builds the index again from the
database: after adding `search` to a collection, changing its fields, or to repair it.

## `memorySearch()`

The built-in adapter keeps the index in the server's memory:

- **Thai without spaces works.** Words are split with `Intl.Segmenter`, the dictionary-based
  word breaks of ICU that Node has built in: `ข่าวน้ำท่วมกรุงเทพมหานคร` is found with `น้ำท่วม` or
  `กรุงเทพ`.
- Every word searched must be in the document, at the start of one of its words or across words.
  Whole words rank above parts of words.
- It is built from the database when the server starts (searches wait for it), and each process
  has its own. Use it in development, tests and small sites run as one process. With
  `scheduler: false`, call `cms.reindexSearch()` yourself.
- In production it logs a warning: for large sites or several instances, use an adapter for a
  search engine.

The dashboard's **System** card shows the adapter in use.

## Writing an adapter

An adapter for a search engine (Meilisearch, Typesense, OpenSearch…) implements `SearchAdapter`
from `@easy-cms/core`. Easy CMS turns documents into plain text; the adapter never needs to know
about fields.

```ts
import type { SearchAdapter } from '@easy-cms/core'

export function mySearch(options: { url: string; apiKey: string }): SearchAdapter {
  return {
    name: 'my-engine',
    apiVersion: 1,
    // Before a reindex: create indexes, set which attributes are searchable, in this order.
    async setup(collections) {},
    // { collection, id, locale, text: { title: '…', body: '…' } }: add or replace.
    async index(entries) {},
    // Every locale of these documents.
    async remove(documents) {},
    async clear(collection) {},
    // { query, collections, locale, limit, offset } → { hits: [{ collection, id }], total }
    async search(query) {
      return { hits: [], total: 0 }
    },
    // Shown to admins; never secrets.
    describe: () => [{ key: 'url', value: options.url }],
  }
}
```

- Keep `text`'s keys in their order as the weight of each field: they come from `search.fields`.
- An engine with Thai word segmentation is needed for Thai text: check it before choosing one.
- `ephemeral: true` says the index starts empty in each process, as `memorySearch()`'s does.

See [ADR-0056](https://github.com/maritonx/easy-cms/blob/main/docs/adr/0056-search-adapter.md)
for why search is an adapter and not a server Easy CMS needs.
