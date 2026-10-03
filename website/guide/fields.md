# Fields

::: info What you'll learn
Every field type, its options, what it looks like in the admin, and how it is stored.

**Before this page:** [Configuration](./configuration).
:::

Every field has a `name` and a `type`. Common options:

| Option | |
|---|---|
| `label` | String or `{ en, th }`. Defaults to the humanized name. |
| `required` | Must have a value (skipped while saving a [draft](./drafts)). |
| `defaultValue` | Used when creating a document without this field. |
| `unique` | No two documents may share the value (top-level fields). |
| `index` | Create a database index. |
| `validate` | `(value, { data, operation }) => true \| 'error message'`, may be async. |
| `access` | `{ read, update }` field-level [access](./access-control#field-access). |
| `hidden` | Stored, but never returned by the API nor accepted as input. |
| `localized` | One value per locale; see [Localization](./localization). |
| `position` | `'sidebar'`: shown in the edit page's side panel (for top-level fields such as a category, tags or a date). |
| `admin` | `{ component, after }`: [admin components](./plugins#admin-components) instead of the input, and below the field. |

## Types

| Type | Value | Options |
|---|---|---|
| `text` | `string` | `minLength`, `maxLength` |
| `textarea` | `string` | `minLength`, `maxLength` |
| `email` | `string`, stored lowercase | |
| `number` | `number` | `min`, `max` |
| `boolean` | `boolean` | |
| `date` | ISO 8601 `string` (accepts `Date`) | |
| `select` | one of the options, or an array with `hasMany` | `options`, `hasMany` |
| `slug` | URL-safe `string`, unique in the collection | `from` |
| `json` | any JSON value | |
| `richText` | Tiptap JSON document | see [Rich text](./rich-text) |
| `upload` | id of a `media` document, or an array with `hasMany` | `hasMany`, `mimeTypes`: see [Uploads](./uploads#several-files-galleries) |
| `relationship` | id(s) of documents in another collection | `to`, `hasMany`, `minRows`, `maxRows` |
| `array` | list of rows, each with an `id` and sub-fields | `fields`, `minRows`, `maxRows` |
| `group` | nested object | `fields` |
| `blocks` | list of rows of different kinds, each with `id` and `blockType` | `blocks`, `minRows`, `maxRows` |

### select

```ts
{ name: 'kind', type: 'select', options: ['news', { label: { en: 'Blog', th: 'บล็อก' }, value: 'blog' }] }
{ name: 'tags', type: 'select', options: ['vue', 'react'], hasMany: true }
```

### slug

```ts
{ name: 'slug', type: 'slug', from: 'title' }
```

Filled from `title` when empty. Letters of any script are kept (`สวัสดี ชาวโลก` →
`สวัสดี-ชาวโลก`); duplicates get `-2`, `-3`. Changing the title later does not change the slug.

`uniqueWithin: 'parent'` makes slugs unique only among documents with the same value of another
field, e.g. pages under the same parent (as the [nested pages](./nested-docs) plugin does).

### relationship

```ts
{ name: 'author', type: 'relationship', to: 'users' }
{ name: 'related', type: 'relationship', to: 'posts', hasMany: true }
```

Ids are checked to exist when saving. Reads populate related documents to `depth` levels
(default 1, max 3); at depth 0 you get ids. Deleted or unreadable documents become `null`, or
are dropped from `hasMany` lists.

`filterOptions` limits which documents a relationship may point to. It runs on the server with
the document's id (`undefined` while creating) and the user, and returns a `where` on the target
collection, or `true` for any. The admin's picker offers only those, and saving checks them:

```ts
{
  name: 'manager',
  type: 'relationship',
  to: 'users',
  filterOptions: ({ id }) => ({ role: { equals: 'admin' } }),
}
```

### array and group

```ts
{
  name: 'links',
  type: 'array',
  maxRows: 5,
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'url', type: 'text' },
  ],
}
{ name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] }
```

Updating an array replaces all its rows; keep a row's `id` to keep its identity.

### blocks

Rows of different kinds, for pages editors lay out themselves:

```ts
{
  name: 'layout',
  type: 'blocks',
  blocks: [
    {
      slug: 'hero',
      labels: { singular: 'Hero' },
      fields: [
        { name: 'heading', type: 'text', required: true },
        { name: 'image', type: 'upload' },
      ],
    },
    { slug: 'text', fields: [{ name: 'body', type: 'richText' }] },
  ],
}
```

Each row is `{ id, blockType, ...fields }`; `blockType` picks the block. Rows are validated,
relationships and uploads inside them populated, and the generated types are a union of the
block kinds.

Blocks are stored as JSON. `where` can look inside them: a field name means that field in
whichever block has it, and a document matches when some block does.

```ts
await cms.find('pages', { where: { 'layout.blockType': { equals: 'hero' } } })
await cms.find('pages', { where: { 'layout.heading': { like: 'sale' } } })
await cms.find('pages', { where: { 'layout.heading.en': { equals: 'Hello' } } }) // a locale
await cms.find('pages', { where: { layout: { exists: false } } }) // no blocks at all
```

Lists inside blocks work the same way: some row must match.

```ts
await cms.find('pages', { where: { 'layout.meta.tone': { equals: 'warm' } } }) // a group
await cms.find('pages', { where: { 'layout.items.title': { equals: 'One' } } }) // an array
await cms.find('pages', { where: { 'layout.tags': { in: ['sale'] } } }) // hasMany values
await cms.find('pages', { where: { 'layout.content.blockType': { equals: 'quote' } } }) // blocks
```

`sort` uses the first value found, going through the blocks (and the rows of lists in them) in
order: `sort: '-layout.columns'`, `sort: 'layout.items.title'`. These queries read the JSON of each document,
so they suit filters more than large, hot lists.

## How fields are stored

Each collection is a table; fields are columns (group fields are flattened: `seo.title` →
`seo_title`). Arrays and `hasMany` values live in child tables; blocks are a JSON column. Two fields that would map to the
same column are reported as a config error.

## Next steps

- [Access control](./access-control): field-level access.
- [Rich text](./rich-text): show rich text on your pages.
