# Field reference

Every field option, checked against the types in `@easy-cms/core` by a test. For how fields
look in the admin and how they are stored, see [Fields](/guide/fields).

<!-- api: BaseField -->
## Options of every field

| Option | Type | |
|---|---|---|
| `name` | `string` | **Required**. A JavaScript identifier; unique among its siblings. |
| `type` | see [types](#types) | **Required**. |
| `label` | `string \| { en, th }` | Default: the name, humanized. |
| `required` | `boolean` | Must have a value (not checked while saving a draft). |
| `unique` | `boolean` | No two documents share the value (top-level fields). |
| `index` | `boolean` | Adds a database index. |
| `defaultValue` | the field's value | Used when a document is created without it. |
| `validate` | `(value, { data, operation }) => true \| string` | Custom check; may be async. |
| `access` | `{ read?, update? }` | Field-level [access](/guide/access-control#field-access). |
| `hidden` | `boolean` | Stored, but never returned nor accepted as input. |
| `localized` | `boolean` | One value per locale (needs `localization`). |
| `position` | `'sidebar'` | Shown in the edit page's side column (top-level fields). |
| `admin` | `FieldAdmin` | Admin components; see [below](#admin). |

<!-- api: FieldAdmin -->
### admin

| Option | Type | |
|---|---|---|
| `component` | `AdminComponent` | A Web Component instead of the input. [Admin components](/guide/plugins#admin-components) |
| `after` | `AdminComponent[]` | Components shown below the field. |

An `AdminComponent` is a tag name starting with `ecms-`, or `{ tag, props }`.

## Types

| Type | Value | Extra options |
|---|---|---|
| `text` | `string` | [`minLength`, `maxLength`](#text-and-textarea) |
| `textarea` | `string` | [`minLength`, `maxLength`](#text-and-textarea) |
| `email` | `string` (lowercase) | |
| `number` | `number` | [`min`, `max`](#number) |
| `boolean` | `boolean` | |
| `date` | ISO 8601 `string` | |
| `select` | an option, or an array with `hasMany` | [`options`, `hasMany`](#select) |
| `slug` | URL-safe `string`, unique | [`from`](#slug) |
| `json` | any JSON | |
| `richText` | Tiptap JSON | see [Rich text](/guide/rich-text) |
| `upload` | id of a `media` document, or an array with `hasMany` | [`hasMany`, `mimeTypes`](#upload) |
| `relationship` | id(s) of documents | [`to`, `hasMany`, `minRows`, `maxRows`](#relationship) |
| `array` | rows with `id` and sub-fields | [`fields`, `minRows`, `maxRows`](#array) |
| `group` | an object | [`fields`](#group) |
| `blocks` | rows of several kinds, with `blockType` | [`blocks`, `minRows`, `maxRows`](#blocks) |

<!-- api: TextField -->
<!-- api: TextareaField -->
### text and textarea

| Option | Type | |
|---|---|---|
| `minLength` | `number` | Fewest characters. |
| `maxLength` | `number` | Most characters; the admin stops typing there. |

<!-- api: NumberField -->
### number

| Option | Type | |
|---|---|---|
| `min` | `number` | Smallest value. |
| `max` | `number` | Largest value. |

<!-- api: SelectField -->
### select

| Option | Type | |
|---|---|---|
| `options` | `(string \| { label, value })[]` | **Required**. The choices; `label` may be `{ en, th }`. |
| `hasMany` | `boolean` | Pick several (checkboxes); the value is an array. |

<!-- api: SlugField -->
### slug

| Option | Type | |
|---|---|---|
| `from` | `string` | A sibling `text` field to make the slug from when it is empty. |
| `uniqueWithin` | `string` | A sibling field (e.g. `parent`): slugs only differ among documents with the same value there. |

<!-- api: UploadField -->
### upload

| Option | Type | |
|---|---|---|
| `hasMany` | `boolean` | Several files, in the order editors arrange (a gallery); the value is an array. |
| `minRows` | `number` | With `hasMany`: the fewest files. |
| `maxRows` | `number` | With `hasMany`: the most files. |
| `mimeTypes` | `string[]` | Allowed file types, e.g. `['image/*']`; the picker offers only these and saving checks them. |

<!-- api: RelationshipField -->
### relationship

| Option | Type | |
|---|---|---|
| `to` | `string` | **Required**. Slug of the target collection. |
| `hasMany` | `boolean` | Several documents; the value is an array. |
| `minRows` | `number` | With `hasMany`: the fewest documents. |
| `maxRows` | `number` | With `hasMany`: the most documents. |
| `filterOptions` | `({ id, user, cms }) => Where \| true` | Which documents it may point to; the admin's picker offers only these and saving checks them. |

<!-- api: ArrayField -->
### array

| Option | Type | |
|---|---|---|
| `fields` | `Field[]` | **Required**. The fields of each row. |
| `minRows` | `number` | Fewest rows. |
| `maxRows` | `number` | Most rows. |

<!-- api: GroupField -->
### group

| Option | Type | |
|---|---|---|
| `fields` | `Field[]` | **Required**. The fields inside. |

<!-- api: BlocksField -->
### blocks

| Option | Type | |
|---|---|---|
| `blocks` | `Block[]` | **Required**. The kinds of rows; see [Block](#block). |
| `minRows` | `number` | Fewest rows. |
| `maxRows` | `number` | Most rows. |

<!-- api: Block -->
#### Block

| Option | Type | |
|---|---|---|
| `slug` | `string` | **Required**. Stored in each row as `blockType`. |
| `labels` | `{ singular?, plural? }` | Names in the admin. |
| `fields` | `Field[]` | **Required**. The block's fields. |
