import type { Access, AuthUser } from '../access.js'
import { evaluateAccess, FieldAccessChecker } from '../access-control.js'
import { INTERNAL_COLLECTIONS } from '../builtins.js'
import type { AdminLocale, CollectionConfig, GlobalConfig } from '../config.js'
import type { Field, Label } from '../fields.js'
import type { EasyCMS } from '../local-api.js'

/** A field as the admin UI sees it: plain JSON, no functions. */
export interface AdminField {
  name: string
  type: Field['type']
  label?: Label
  required?: boolean
  unique?: boolean
  defaultValue?: unknown
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  options?: { label: Label; value: string }[]
  hasMany?: boolean
  to?: string
  from?: string
  minRows?: number
  maxRows?: number
  fields?: AdminField[]
  /** Block kinds of a `blocks` field. */
  blocks?: { slug: string; labels?: { singular?: Label; plural?: Label }; fields: AdminField[] }[]
  /** The current user may not change this field. */
  readOnly?: boolean
  /** One value per content locale. */
  localized?: boolean
}

export interface AdminCollection {
  slug: string
  labels?: { singular?: Label; plural?: Label }
  icon?: string
  useAsTitle?: string
  drafts: boolean
  versions: boolean
  /** Has live preview (`preview` in the config). */
  preview: boolean
  /** Publishing can be scheduled. */
  schedule: boolean
  fields: AdminField[]
  permissions: { read: boolean; create: boolean; update: boolean; delete: boolean }
}

export interface AdminGlobal {
  slug: string
  label?: Label
  icon?: string
  drafts: boolean
  versions: boolean
  /** Has live preview (`preview` in the config). */
  preview: boolean
  /** Publishing can be scheduled. */
  schedule: boolean
  fields: AdminField[]
  permissions: { read: boolean; update: boolean }
}

export interface AdminSchema {
  locale: AdminLocale
  /** Content locales, when the config has `localization`. */
  localization: { locales: string[]; defaultLocale: string } | null
  collections: AdminCollection[]
  globals: AdminGlobal[]
}

/** A `where` result means "some documents", so the action is offered and the server decides per document. */
async function allowed(access: Access | undefined, user: AuthUser): Promise<boolean> {
  return (await evaluateAccess(access, { user })) !== false
}

async function serializeFields(
  fields: readonly Field[],
  update: FieldAccessChecker,
  localized: boolean,
): Promise<AdminField[]> {
  const out: AdminField[] = []
  for (const field of fields) {
    if (field.hidden) continue
    const f: AdminField = { name: field.name, type: field.type }
    if (field.label !== undefined) f.label = field.label
    if (field.required) f.required = true
    if (field.unique) f.unique = true
    if (field.defaultValue !== undefined) f.defaultValue = field.defaultValue
    if (!(await update.allows(field))) f.readOnly = true
    if (field.localized && localized) f.localized = true
    switch (field.type) {
      case 'text':
      case 'textarea':
        if (field.minLength !== undefined) f.minLength = field.minLength
        if (field.maxLength !== undefined) f.maxLength = field.maxLength
        break
      case 'number':
        if (field.min !== undefined) f.min = field.min
        if (field.max !== undefined) f.max = field.max
        break
      case 'select':
        f.options = field.options.map((o) =>
          typeof o === 'string' ? { label: o, value: o } : { label: o.label, value: o.value },
        )
        if (field.hasMany) f.hasMany = true
        break
      case 'slug':
        if (field.from) f.from = field.from
        break
      case 'relationship':
        f.to = field.to
        if (field.hasMany) f.hasMany = true
        break
      case 'upload':
        f.to = 'media'
        break
      case 'array':
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        f.fields = await serializeFields(field.fields, update, localized)
        break
      case 'blocks':
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        f.blocks = await Promise.all(
          field.blocks.map(async (block) => ({
            slug: block.slug,
            ...(block.labels ? { labels: block.labels } : {}),
            fields: await serializeFields(block.fields, update, localized),
          })),
        )
        break
      case 'group':
        f.fields = await serializeFields(field.fields, update, localized)
        break
    }
    out.push(f)
  }
  return out
}

async function collection(
  config: CollectionConfig,
  user: AuthUser,
  localized: boolean,
): Promise<AdminCollection> {
  const result: AdminCollection = {
    slug: config.slug,
    drafts: config.drafts === true,
    versions: Boolean(config.versions),
    preview: typeof config.preview === 'function',
    schedule: config.schedule === true,
    fields: await serializeFields(
      config.fields,
      new FieldAccessChecker('update', { user }),
      localized,
    ),
    permissions: {
      read: await allowed(config.access?.read, user),
      create: await allowed(config.access?.create, user),
      update: await allowed(config.access?.update, user),
      delete: await allowed(config.access?.delete, user),
    },
  }
  if (config.labels) result.labels = config.labels
  if (config.useAsTitle) result.useAsTitle = config.useAsTitle
  if (config.icon) result.icon = config.icon
  return result
}

async function global(
  config: GlobalConfig,
  user: AuthUser,
  localized: boolean,
): Promise<AdminGlobal> {
  const result: AdminGlobal = {
    slug: config.slug,
    drafts: config.drafts === true,
    versions: Boolean(config.versions),
    preview: typeof config.preview === 'function',
    schedule: config.schedule === true,
    fields: await serializeFields(
      config.fields,
      new FieldAccessChecker('update', { user }),
      localized,
    ),
    permissions: {
      read: await allowed(config.access?.read, user),
      update: await allowed(config.access?.update, user),
    },
  }
  if (config.label !== undefined) result.label = config.label
  if (config.icon) result.icon = config.icon
  return result
}

/** Everything the admin UI needs to render forms and menus for this user. */
export async function adminSchema(cms: EasyCMS, user: AuthUser): Promise<AdminSchema> {
  const collections = cms.config.collections.filter((c) => !INTERNAL_COLLECTIONS.has(c.slug))
  const localization = cms.config.localization
  const localized = localization !== null
  return {
    locale: cms.config.admin.locale,
    localization: localization
      ? { locales: [...localization.locales], defaultLocale: localization.defaultLocale }
      : null,
    collections: await Promise.all(collections.map((c) => collection(c, user, localized))),
    globals: await Promise.all(cms.config.globals.map((g) => global(g, user, localized))),
  }
}
