import type { ID } from './access.js'
import type { CollectionConfig, Config, PluginTypes, TypedPlugin } from './config.js'
import type { Block, CustomFieldTypes, Field, RichTextDocument, SelectOption } from './fields.js'

type Simplify<T> = { [K in keyof T]: T[K] } & {}

type OptionValue<O> = O extends string ? O : O extends { readonly value: infer V } ? V : never

type SelectValue<F> = F extends { readonly options: readonly (infer O extends SelectOption)[] }
  ? F extends { readonly hasMany: true }
    ? OptionValue<O>[]
    : OptionValue<O>
  : never

/** The built-in users collection as seen by the type system (hidden fields left out). */
export interface BuiltinUsersCollection {
  readonly slug: 'users'
  readonly fields: readonly [
    { readonly name: 'email'; readonly type: 'email'; readonly required: true },
    { readonly name: 'name'; readonly type: 'text' },
    {
      readonly name: 'role'
      readonly type: 'select'
      readonly options: readonly string[]
      readonly required: true
    },
    { readonly name: 'active'; readonly type: 'boolean' },
  ]
}

/** The built-in API keys collection (`apiKeys: true`); the key's hash is left out. */
export interface BuiltinApiKeysCollection {
  readonly slug: 'api-keys'
  readonly fields: readonly [
    { readonly name: 'name'; readonly type: 'text'; readonly required: true },
    { readonly name: 'permissions'; readonly type: 'json' },
    { readonly name: 'expiresAt'; readonly type: 'date' },
    { readonly name: 'prefix'; readonly type: 'text' },
    { readonly name: 'user'; readonly type: 'relationship'; readonly to: 'users' },
    { readonly name: 'lastUsedAt'; readonly type: 'date' },
  ]
}

/** The built-in media folders (`upload.folders: true`). */
export interface BuiltinMediaFoldersCollection {
  readonly slug: 'media-folders'
  readonly fields: readonly [
    { readonly name: 'name'; readonly type: 'text'; readonly required: true },
    { readonly name: 'parent'; readonly type: 'relationship'; readonly to: 'media-folders' },
    { readonly name: 'key'; readonly type: 'text' },
    { readonly name: 'private'; readonly type: 'boolean' },
    { readonly name: 'permissions'; readonly type: 'json' },
  ]
}

/** `media-folders` when the config turns folders on. */
type FoldersOf<C extends Config> = C extends { readonly upload: { readonly folders: true } }
  ? BuiltinMediaFoldersCollection
  : never

/** `api-keys` when the config turns API keys on. */
type ApiKeysOf<C extends Config> = C extends { readonly apiKeys: true }
  ? BuiltinApiKeysCollection
  : never

// ---------------------------------------------------------------------------
// What plugins add (`definePlugin`): fields on collections and globals, and collections.

/** The `PluginTypes` of each plugin in the config (a union). */
type PluginTypesOf<C extends Config> = C extends { readonly plugins: readonly (infer P)[] }
  ? P extends TypedPlugin<infer T extends PluginTypes>
    ? T
    : never
  : never

/** Fields that plugins add to the collection (or global) `S`, as a union. */
type AddedFields<T, S> = T extends { readonly [K in 'fields' | 'globalFields']?: infer M }
  ? M extends { readonly [slug: string]: readonly Field[] }
    ? string extends keyof M
      ? never // options that aren't literals: unknown collections
      : S extends keyof M
        ? M[S][number]
        : never
    : never
  : never
type PluginFields<C extends Config, S, Key extends 'fields' | 'globalFields'> = AddedFields<
  PluginTypesOf<C> extends infer T
    ? T extends PluginTypes
      ? Pick<T, Key & keyof T>
      : never
    : never,
  S
>

/** Collections that plugins add. */
type PluginCollections<C extends Config> =
  PluginTypesOf<C> extends infer T
    ? T extends { readonly collections: readonly (infer K extends CollectionConfig)[] }
      ? K
      : never
    : never

/** A collection or global with the fields plugins add to it. */
type WithPluginFields<
  C extends Config,
  T extends { readonly slug: string; readonly fields: readonly Field[] },
  Key extends 'fields' | 'globalFields',
> = [PluginFields<C, T['slug'], Key>] extends [never]
  ? T
  : Omit<T, 'fields'> & {
      readonly fields: readonly (T['fields'][number] | PluginFields<C, T['slug'], Key>)[]
    }

/**
 * The config's own collections. A literal config without `collections` has none (only plugins
 * add some); a loosely typed `Config` has any.
 */
type OwnCollections<C extends Config> = 'collections' extends keyof C
  ? NonNullable<C['collections']>[number]
  : never

/** Every collection of a config, including the built-in ones and those plugins add. */
type AllCollections<C extends Config> =
  | OwnCollections<C>
  | BuiltinUsersCollection
  | BuiltinMediaCollection
  | ApiKeysOf<C>
  | FoldersOf<C>
  | PluginCollections<C>

/** The built-in media collection; its documents are typed as `MediaDocument`. */
export interface BuiltinMediaCollection {
  readonly slug: 'media'
  readonly fields: readonly []
}

type CollectionBySlug<C extends Config, S> = WithPluginFields<
  C,
  Extract<AllCollections<C>, { readonly slug: S }>,
  'fields'
>
type GlobalBySlug<C extends Config, S> = WithPluginFields<
  C,
  Extract<NonNullable<C['globals']>[number], { readonly slug: S }>,
  'globalFields'
>

/** Relationships are ids at depth 0 and documents when populated. */
type RelationValue<C extends Config, S> = [CollectionBySlug<C, S>] extends [never]
  ? ID | Record<string, unknown>
  : ID | CollectionDocument<C, S & string>

export interface MediaSize {
  filename: string
  width: number
  height: number
  filesize: number
  url: string
}

/** A document of the built-in `media` collection, as returned by the API. */
export interface MediaDocument {
  id: ID
  filename: string
  originalName?: string | null
  mimeType: string
  filesize: number
  width?: number | null
  height?: number | null
  alt?: string | null
  /** Its media folder (`upload.folders`), when it is in one. */
  folder?: ID | null
  /** In a private folder: `url` needs a signed-in user who may see it, or `cms.signedMediaURL()`. */
  private?: boolean | null
  /** URL of the file: public, or for private files the API's, which checks who asks. */
  url: string
  /** Resized copies, when `upload.imageSizes` is set and sharp is installed. */
  sizes: Record<string, MediaSize>
  createdAt: string
  updatedAt: string
  [field: string]: unknown
}

export type FieldValue<F extends Field, C extends Config = Config> = F extends {
  readonly type: 'text' | 'textarea' | 'email' | 'slug' | 'date'
}
  ? string
  : F extends { readonly type: 'number' }
    ? number
    : F extends { readonly type: 'boolean' }
      ? boolean
      : F extends { readonly type: 'json' }
        ? unknown
        : F extends { readonly type: 'select' }
          ? SelectValue<F>
          : F extends { readonly type: 'richText' }
            ? RichTextDocument
            : F extends { readonly type: 'upload' }
              ? F extends { readonly hasMany: true }
                ? (ID | MediaDocument)[]
                : ID | MediaDocument
              : F extends { readonly type: 'relationship'; readonly to: infer S }
                ? F extends { readonly hasMany: true }
                  ? RelationValue<C, S>[]
                  : RelationValue<C, S>
                : F extends {
                      readonly type: 'array'
                      readonly fields: infer Sub extends readonly Field[]
                    }
                  ? Simplify<FieldsValue<Sub, C> & { id: string }>[]
                  : F extends {
                        readonly type: 'group'
                        readonly fields: infer Sub extends readonly Field[]
                      }
                    ? FieldsValue<Sub, C>
                    : F extends {
                          readonly type: 'blocks'
                          readonly blocks: infer B extends readonly Block[]
                        }
                      ? BlockValue<B[number], C>[]
                      : CustomValue<F>

/** The value of a field of an added type (`CustomFieldTypes`). */
type CustomValue<F> = F extends { readonly type: infer T extends keyof CustomFieldTypes }
  ? CustomFieldTypes[T] extends { value: infer V }
    ? V
    : unknown
  : never

/** One row of a `blocks` field: the block's fields plus `id` and `blockType` (distributes over kinds). */
type BlockValue<B, C extends Config> = B extends {
  readonly slug: infer S
  readonly fields: infer Sub extends readonly Field[]
}
  ? Simplify<FieldsValue<Sub, C> & { id: string; blockType: S }>
  : never

type BlockInput<B> = B extends {
  readonly slug: infer S
  readonly fields: infer Sub extends readonly Field[]
}
  ? Simplify<FieldsInput<Sub> & { id?: string; blockType: S }>
  : never

type Visible<Fs extends readonly Field[]> = Exclude<Fs[number], { readonly hidden: true }>
/** Always set when read: required fields, and lists and groups (empty `[]` / `{}` otherwise). */
type Present =
  | { readonly required: true }
  | { readonly type: 'array' | 'blocks' | 'group' }
  | { readonly hasMany: true }
type RequiredFields<Fs extends readonly Field[]> = Extract<Visible<Fs>, Present>
type OptionalFields<Fs extends readonly Field[]> = Exclude<Visible<Fs>, Present>

/** The shape of the data described by a list of fields. */
export type FieldsValue<Fs extends readonly Field[], C extends Config = Config> = Simplify<
  { -readonly [F in RequiredFields<Fs> as F['name']]: FieldValue<F, C> } & {
    -readonly [F in OptionalFields<Fs> as F['name']]?: FieldValue<F, C> | null
  }
>

type SystemFields<T extends { readonly drafts?: unknown }> = {
  id: ID
  createdAt: string
  updatedAt: string
} & (T extends { readonly drafts: true } ? { status: 'draft' | 'published' } : unknown)

/** What document types are inferred from: a collection's or global's fields and drafts. */
type FieldsOwner = { readonly fields: readonly Field[]; readonly drafts?: unknown }

export type InferCollection<T extends FieldsOwner, C extends Config = Config> = Simplify<
  SystemFields<T> & FieldsValue<T['fields'], C>
>

export type InferGlobal<T extends FieldsOwner, C extends Config = Config> = Simplify<
  /** `null` until the global is saved for the first time. */
  { updatedAt: string | null } & (T extends { readonly drafts: true }
    ? { status: 'draft' | 'published' }
    : unknown) &
    FieldsValue<T['fields'], C>
>

export type CollectionSlug<C extends Config> =
  | OwnCollections<C>['slug']
  | 'users'
  | 'media'
  | ApiKeysOf<C>['slug']
  | FoldersOf<C>['slug']
  | PluginCollections<C>['slug']
export type GlobalSlug<C extends Config> = NonNullable<C['globals']>[number]['slug']

/** Document type of a collection, e.g. `CollectionDocument<typeof config, 'posts'>`. */
export type CollectionDocument<C extends Config, S extends CollectionSlug<C>> = S extends 'media'
  ? MediaDocument
  : InferCollection<CollectionBySlug<C, S>, C>

/** Data type of a global, e.g. `GlobalDocument<typeof config, 'site'>`. */
export type GlobalDocument<C extends Config, S extends GlobalSlug<C>> = InferGlobal<
  GlobalBySlug<C, S>,
  C
>

// ---------------------------------------------------------------------------
// Input types for create / update

type InputValue<F extends Field> = F extends { readonly type: 'relationship' }
  ? F extends { readonly hasMany: true }
    ? readonly ID[]
    : ID
  : F extends { readonly type: 'select'; readonly hasMany: true }
    ? Readonly<SelectValue<F>>
    : F extends { readonly type: 'upload' }
      ? F extends { readonly hasMany: true }
        ? readonly ID[]
        : ID
      : F extends { readonly type: 'date' }
        ? string | Date
        : F extends { readonly type: 'array'; readonly fields: infer Sub extends readonly Field[] }
          ? readonly Simplify<FieldsInput<Sub> & { id?: string }>[]
          : F extends {
                readonly type: 'group'
                readonly fields: infer Sub extends readonly Field[]
              }
            ? FieldsInput<Sub>
            : F extends {
                  readonly type: 'blocks'
                  readonly blocks: infer B extends readonly Block[]
                }
              ? readonly BlockInput<B[number]>[]
              : FieldValue<F>

/**
 * Required fields must be given, unless Easy CMS can fill them (default value, slug from another
 * field) or a condition may hide them (`admin.condition`).
 */
type NeedsInput<F extends Field> = F extends { readonly required: true }
  ? F extends { readonly defaultValue: unknown }
    ? never
    : F extends { readonly type: 'slug'; readonly from: string }
      ? never
      : F extends { readonly admin: { readonly condition: object } }
        ? never
        : F
  : never

export type FieldsInput<Fs extends readonly Field[]> = Simplify<
  { -readonly [F in NeedsInput<Visible<Fs>> as F['name']]: InputValue<F> } & {
    -readonly [F in Exclude<
      Visible<Fs>,
      NeedsInput<Visible<Fs>>
    > as F['name']]?: InputValue<F> | null
  }
>

type StatusInput<T> = T extends { readonly drafts: true }
  ? { status?: 'draft' | 'published' }
  : unknown

/**
 * A user's password, hashed and never returned. Optional when creating: a user without one sets
 * it from an invitation link.
 */
type PasswordInput<S, Required extends boolean> = S extends 'users'
  ? Required extends true
    ? { password: string }
    : { password?: string }
  : unknown

/** Data accepted by `create`, e.g. `CreateInput<typeof config, 'posts'>`. */
export type CreateInput<C extends Config, S extends CollectionSlug<C>> = Simplify<
  FieldsInput<CollectionBySlug<C, S>['fields']> &
    StatusInput<CollectionBySlug<C, S>> &
    PasswordInput<S, false>
>

/** Data accepted by `update`: any subset of `CreateInput`. */
export type UpdateInput<C extends Config, S extends CollectionSlug<C>> = Partial<CreateInput<C, S>>

/** Data accepted by `updateGlobal`. */
export type GlobalInput<C extends Config, S extends GlobalSlug<C>> = Partial<
  Simplify<FieldsInput<GlobalBySlug<C, S>['fields']> & StatusInput<GlobalBySlug<C, S>>>
>
