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
| `uniqueWithin` | `string \| string[]` | With `unique` or on a slug: sibling fields (e.g. `parent`, `tenant`); values only differ among documents with the same values there. |
| `index` | `boolean` | Adds a database index. |
| `defaultValue` | the field's value | Used when a document is created without it. |
| `validate` | `(value, { data, operation }) => true \| string` | Custom check; may be async. |
| `access` | `{ read?, create?, update? }` | Field-level [access](/guide/access-control#field-access). `create`: who may set it when creating a document; default: its `update`. |
| `hidden` | `boolean` | Stored, but never returned nor accepted as input. |
| `localized` | `boolean` | One value per locale (needs `localization`). |
| `admin` | `FieldAdmin` | Admin components; see [below](#admin). |
| `customType` | `string` | Set by Easy CMS for fields of an [added type](/guide/field-types) (e.g. `color`); don't set it yourself. |

<!-- api: FieldAdmin -->
### admin

| Option | Type | |
|---|---|---|
| `component` | `AdminComponent` | A Web Component instead of the input. [Admin components](/guide/plugins#admin-components) |
| `after` | `AdminComponent[]` | Components shown below the field. |
| `cell` | `AdminComponent` | Shows the value in the list's column, e.g. a color swatch. |
| `description` | `Label` | Help below the field. |
| `width` | `'1/4' \| '1/3' \| '1/2' \| '2/3' \| '3/4' \| 'full'` | Its share of a row (`admin.layout`). Default: an equal share. |
| `condition` | `FieldCondition` | Shown only when sibling fields match, e.g. `{ field: 'linkType', equals: 'external' }`; also `not_equals`, `in`, `not_in`, `exists`, `and`, `or`, `not`. A hidden field isn't required. [The admin](/guide/admin#conditions) |
| `column` | `boolean \| ({ user, context }) => boolean` | A column of the list at first (each user can change it). |
| `allowCreate` | `boolean` | Relationships: offer to create the related document in place. Default `true`. |
| `initialValue` | `({ user, context }) => unknown` | The value a new document's form starts with, per user, e.g. from the request's context. The field's `defaultValue` still applies on the server. |
| `position` | `'sidebar'` | Shown in the edit page's side column (top-level fields). |

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

Packages add more types, e.g. `color` from `@easy-cms/fields`: see [Custom field types](/guide/field-types).

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
