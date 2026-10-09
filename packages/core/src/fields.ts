import type { AuthUser, FieldAccess, ID, RequestContext, Where } from './access.js'
import type { FieldCondition } from './conditions.js'
import type { EasyCMS } from './local-api.js'
import { expandMimeTypes } from './media.js'

/** A label shown in the admin UI. Either one string or one string per admin locale. */
export type Label = string | { readonly [locale: string]: string }

export interface FieldValidateContext {
  /** The whole document being validated, including sibling fields. */
  readonly data: Readonly<Record<string, unknown>>
  readonly operation: 'create' | 'update'
}

/** Return `true` when valid, or an error message to show on the field. */
export type FieldValidate<TValue> = (
  value: TValue | null | undefined,
  ctx: FieldValidateContext,
) => true | string | Promise<true | string>

/**
 * A Web Component from an admin module (`admin.modules`), by its tag name, which must start
 * with `ecms-`. `props` (plain JSON) reach the element as its `options` property.
 */
export type AdminComponent =
  | string
  | { readonly tag: string; readonly props?: Readonly<Record<string, unknown>> }

/** How the admin shows a field, with components from admin modules. */
export interface FieldAdmin {
  /** Help below the field's label. */
  readonly description?: Label
  /** Its share of a row (`admin.layout`'s `row`). Default: an equal share. */
  readonly width?: '1/4' | '1/3' | '1/2' | '2/3' | '3/4' | 'full'
  /**
   * Shown only when its sibling fields match, e.g. `{ field: 'linkType', equals: 'external' }`.
   * A hidden field isn't required. See `FieldCondition`.
   */
  readonly condition?: FieldCondition
  /** Shown instead of the field's input; the admin keeps the label and error messages. */
  readonly component?: AdminComponent
  /** Shown below the field, e.g. a length meter or a preview. */
  readonly after?: readonly AdminComponent[]
  /** Shows the value in the admin's lists (e.g. a color swatch). Default: the plain value. */
  readonly cell?: AdminComponent
  /**
   * A column of the list at first (each user can change it): `true`, or per request, e.g.
   * only when the admin shows every tenant.
   */
  readonly column?: boolean | ((args: AdminFieldArgs) => boolean | Promise<boolean>)
  /** Relationships: offer to create the related document in place. Default true. */
  readonly allowCreate?: boolean
  /**
   * The value a new document's form starts with, worked out for each user, e.g. from the
   * request's context. The server's own default (`defaultValue`, hooks) still applies.
   */
  readonly defaultValue?: (args: AdminFieldArgs) => unknown
}

/** What per-request admin options of a field receive. */
export interface AdminFieldArgs {
  readonly user: AuthUser
  readonly context: RequestContext
}

/**
 * Field types that packages add (`fieldTypes` in the config), for the types inferred from the
 * config. A package declares its own by augmenting this interface:
 *
 * ```ts
 * declare module '@easy-cms/core' {
 *   interface CustomFieldTypes {
 *     color: { value: string; options: { readonly presets?: readonly string[] } }
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled in by packages, through module augmentation
export interface CustomFieldTypes {}

/** A field of a type from `CustomFieldTypes`: the common options, plus the type's own. */
export type CustomField = {
  [K in keyof CustomFieldTypes]: BaseField<
    K & string,
    CustomFieldTypes[K] extends { value: infer V } ? V : unknown
  > &
    (CustomFieldTypes[K] extends { options: infer O } ? O : unknown)
}[keyof CustomFieldTypes]

interface BaseField<TType extends string, TValue> {
  readonly type: TType
  readonly name: string
  readonly label?: Label
  readonly required?: boolean
  readonly unique?: boolean
  /**
   * With `unique` (or on a slug field): a sibling field (e.g. `parent` or `tenant`), or several,
   * whose documents only need to differ among themselves, so `/about/team` and `/careers/team`
   * can both be `team`. Single, unlocalized relationship, select, text or number fields.
   */
  readonly uniqueWithin?: string | readonly string[]
  readonly index?: boolean
  readonly defaultValue?: TValue
  readonly validate?: FieldValidate<TValue>
  readonly access?: FieldAccess
  /** Stored but never returned by the API nor accepted as input (e.g. a password hash). */
  readonly hidden?: boolean
  /**
   * One value per locale (needs `localization` in the config). Not for groups, arrays or
   * hasMany fields: localize the fields inside a group or array instead.
   */
  readonly localized?: boolean
  /** `sidebar`: shown in the edit page's side panel instead of the main form (top-level fields). */
  readonly position?: 'sidebar'
  /** Custom admin components for this field. */
  readonly admin?: FieldAdmin
  /** Set by Easy CMS on fields of an added type (`fieldTypes`): the type's name, e.g. `color`. */
  readonly customType?: string
}

export interface TextField extends BaseField<'text', string> {
  readonly minLength?: number
  readonly maxLength?: number
}

export interface TextareaField extends BaseField<'textarea', string> {
  readonly minLength?: number
  readonly maxLength?: number
}

export interface NumberField extends BaseField<'number', number> {
  readonly min?: number
  readonly max?: number
}

export interface BooleanField extends BaseField<'boolean', boolean> {}

/** Stored and returned as an ISO 8601 string. */
export interface DateField extends BaseField<'date', string> {}

export interface EmailField extends BaseField<'email', string> {}

export interface JsonField extends BaseField<'json', unknown> {}

export type SelectOption = string | { readonly label: Label; readonly value: string }

export interface SelectField extends BaseField<'select', string | readonly string[]> {
  readonly options: readonly SelectOption[]
  readonly hasMany?: boolean
}

export interface SlugField extends BaseField<'slug', string> {
  /** Name of a sibling `text` field to generate the slug from. */
  readonly from?: string
}

/** Tiptap / ProseMirror JSON document. */
export interface RichTextDocument {
  readonly type: 'doc'
  readonly content?: readonly unknown[]
}

export interface RichTextField extends BaseField<'richText', RichTextDocument> {}

/** References a document in the built-in `media` collection: a file or an image. */
export interface UploadField extends BaseField<'upload', never> {
  /** Several files, e.g. a gallery: the value is a list, in the order editors arrange. */
  readonly hasMany?: boolean
  /** With `hasMany`: the fewest files. */
  readonly minRows?: number
  /** With `hasMany`: the most files. */
  readonly maxRows?: number
  /**
   * The file types allowed, e.g. `['image/*']` or `['image/*', 'application/pdf']`. The admin
   * offers only these, and saving refuses others.
   */
  readonly mimeTypes?: readonly string[]
  /**
   * With `upload.folders`: the `key` of the media folder this field's files go in, e.g.
   * `'banners'`. Its picker opens there and its uploads land there; the folder is made when it
   * is first needed.
   */
  readonly folder?: string
  /** With `folder`: only files in that folder (and its subfolders) may be chosen. */
  readonly folderOnly?: boolean
  /** Which media documents may be chosen, as for relationships: offered and checked on save. */
  readonly filterOptions?: FilterOptions
}

export interface FilterOptionsArgs {
  /** The document being edited; `undefined` while it is being created. */
  readonly id: ID | undefined
  readonly user: AuthUser | null
  readonly cms: EasyCMS
  /** The request's context (`onRequest`), `{}` when there is none. */
  readonly context: RequestContext
}

/**
 * Which documents a relationship may point to: a `where` on the target collection, or `true`
 * for any. Runs on the server: the admin's picker offers only these, and saving checks them.
 */
export type FilterOptions = (args: FilterOptionsArgs) => Where | true | Promise<Where | true>

export interface RelationshipField extends BaseField<'relationship', never> {
  /** Slug of the target collection. */
  readonly to: string
  readonly hasMany?: boolean
  /** With `hasMany`: the fewest documents. */
  readonly minRows?: number
  /** With `hasMany`: the most documents. */
  readonly maxRows?: number
  readonly filterOptions?: FilterOptions
}

export interface ArrayField extends BaseField<'array', never> {
  readonly fields: readonly Field[]
  readonly minRows?: number
  readonly maxRows?: number
}

export interface GroupField extends BaseField<'group', never> {
  readonly fields: readonly Field[]
}

/** One kind of block in a `blocks` field. */
export interface Block {
  /** Stored in each row as `blockType`. */
  readonly slug: string
  readonly labels?: { readonly singular?: Label; readonly plural?: Label }
  readonly fields: readonly Field[]
}

/**
 * A list of rows, each one of several block kinds (e.g. hero, text, gallery), for pages that
 * editors lay out themselves. Rows are `{ id, blockType, ...fields }`, stored as JSON.
 */
export interface BlocksField extends BaseField<'blocks', never> {
  readonly blocks: readonly Block[]
  readonly minRows?: number
  readonly maxRows?: number
}

/** The fields `uniqueWithin` names, as a list. */
export const uniqueWithinOf = (field: Field): readonly string[] =>
  field.uniqueWithin === undefined ? [] : [field.uniqueWithin].flat()

/** Fields with `hasMany`: their value is a list of options, documents or files. */
export const isHasMany = (field: Field): boolean =>
  (field.type === 'select' || field.type === 'relationship' || field.type === 'upload') &&
  field.hasMany === true

/**
 * Whether a MIME type is one of `patterns` (`image/*` matches every image but SVG, which can
 * carry scripts and is allowed only when listed by name: `image/svg+xml`).
 */
export function mimeAllowedBy(mimeType: string, patterns: readonly string[]): boolean {
  const type = mimeType.toLowerCase()
  return expandMimeTypes(patterns).some((pattern) => {
    const p = pattern.toLowerCase()
    return p.endsWith('/*') ? type.startsWith(p.slice(0, -1)) && type !== SVG : type === p
  })
}

const SVG = 'image/svg+xml'

/** Fields whose value is a list of rows: `array` and `blocks`. */
export const hasRows = (field: Field): field is ArrayField | BlocksField =>
  field.type === 'array' || field.type === 'blocks'

/** The fields of one row of an `array` or `blocks` field (`undefined` for an unknown block). */
export function rowFields(
  field: ArrayField | BlocksField,
  row: unknown,
): readonly Field[] | undefined {
  if (field.type === 'array') return field.fields
  const type =
    row && typeof row === 'object' ? (row as { blockType?: unknown }).blockType : undefined
  return field.blocks.find((block) => block.slug === type)?.fields
}

export type Field =
  | CustomField
  | TextField
  | TextareaField
  | NumberField
  | BooleanField
  | DateField
  | EmailField
  | JsonField
  | SelectField
  | SlugField
  | RichTextField
  | UploadField
  | RelationshipField
  | ArrayField
  | GroupField
  | BlocksField

export type FieldType = Field['type']

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'boolean',
  'date',
  'email',
  'json',
  'select',
  'slug',
  'richText',
  'upload',
  'relationship',
  'array',
  'group',
  'blocks',
] as const satisfies readonly FieldType[]
