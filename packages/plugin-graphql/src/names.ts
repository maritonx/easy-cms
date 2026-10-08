import { singularize } from '@easy-cms/core'

/** What GraphQL allows as a name (types, fields, arguments, enum values). */
export const VALID_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/

export const isValidName = (name: string) => VALID_NAME.test(name) && !name.startsWith('__')

/** `media-folders` → `MediaFolders`, `blogPost` → `BlogPost`. */
export function pascal(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** `media-folders` → `mediaFolders`. */
export function camel(name: string): string {
  const p = pascal(name)
  return p.charAt(0).toLowerCase() + p.slice(1)
}

/** Names of a collection in the schema: its type, one document, and the list. */
export interface CollectionNames {
  /** The object type, e.g. `Post`. */
  readonly type: string
  /** The query for one document, e.g. `post(id)`. */
  readonly one: string
  /** The query for the list, e.g. `posts(where…)`. */
  readonly many: string
}

/** Names of a global in the schema: its type and its query. */
export interface GlobalNames {
  /** The object type, e.g. `Settings`. */
  readonly type: string
  /** The query, e.g. `settings`. */
  readonly one: string
}

/** Names you choose, by collection or global slug. */
export type NameOverrides = Readonly<Record<string, Partial<CollectionNames>>>

/** The built-in collections' names: `media` is both singular and plural. */
const BUILTIN: Readonly<Record<string, CollectionNames>> = {
  users: { type: 'User', one: 'user', many: 'users' },
  media: { type: 'Media', one: 'mediaItem', many: 'media' },
  'media-folders': { type: 'MediaFolder', one: 'mediaFolder', many: 'mediaFolders' },
}

/** From the slug, like `easy-cms generate:types`: `categories` → `Category`, `category`, `categories`. */
export function collectionNames(slug: string, overrides: NameOverrides = {}): CollectionNames {
  const defaults = BUILTIN[slug] ?? {
    type: pascal(singularize(slug)),
    one: camel(singularize(slug)),
    many: camel(slug),
  }
  return { ...defaults, ...overrides[slug] }
}

/** `site-settings` → `SiteSettings`, `siteSettings`. */
export function globalNames(slug: string, overrides: NameOverrides = {}): GlobalNames {
  const own = overrides[slug]
  return { type: own?.type ?? pascal(slug), one: own?.one ?? camel(slug) }
}
