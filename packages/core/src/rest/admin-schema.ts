import type { Access, AuthUser } from '../access.js'
import { evaluateAccess, FieldAccessChecker } from '../access-control.js'
import { API_KEYS } from '../api-keys.js'
import type { SsoProviderRef } from '../auth/sso.js'
import { EMAIL_DELIVERIES, INTERNAL_COLLECTIONS, USERS, WEBHOOK_DELIVERIES } from '../builtins.js'
import type { AdminLocale, AdminViewAccess, CollectionConfig, GlobalConfig } from '../config.js'
import type { AdminComponent, Field, Label } from '../fields.js'
import type { EasyCMS } from '../local-api.js'
import type { RoleOperation } from '../roles.js'
import { adminModuleUrls } from './admin-modules.js'

/** Built-in collections listed under Settings in the menu. */
const SETTINGS = new Set([USERS, API_KEYS])

/** A Web Component from an admin module, with its `props` (plain JSON). */
export interface AdminComponentRef {
  tag: string
  props?: Record<string, unknown>
}

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
  /** An upload's allowed file types, e.g. `image/*`. */
  mimeTypes?: string[]
  /** A relationship with `filterOptions`: the picker asks the server which documents fit. */
  filtered?: boolean
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
  /** Shown in the edit page's side panel. */
  position?: 'sidebar'
  /** Components from admin modules: instead of the input, below the field, and in lists. */
  admin?: { component?: AdminComponentRef; after?: AdminComponentRef[]; cell?: AdminComponentRef }
  /** A field of an added type (`fieldTypes`), e.g. `color`; `type` is the base it's stored as. */
  customType?: string
}

export interface AdminCollection {
  slug: string
  labels?: { singular?: Label; plural?: Label }
  icon?: string
  useAsTitle?: string
  /** Documents open in a panel over the list. */
  editIn?: 'drawer'
  drafts: boolean
  versions: boolean
  /** Has live preview (`preview` in the config). */
  preview: boolean
  /** Publishing can be scheduled. */
  schedule: boolean
  fields: AdminField[]
  /** Panels from admin modules in the edit page's side column. */
  sidebar?: AdminComponentRef[]
  /** Listed under Settings in the menu (users, API keys, `admin.group: 'settings'`). */
  group?: 'settings'
  /** The list is a tree along this relationship field (`admin.list.tree`). */
  tree?: string
  /** The list's default order (`admin.list.sort`). */
  defaultSort?: string
  permissions: {
    read: boolean
    create: boolean
    update: boolean
    delete: boolean
    publish: boolean
  }
  /** With `auth.rbac`: the field naming a document's owner (`createdBy` or `admin.ownerField`). */
  owner?: string
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
  /** Panels from admin modules in the edit page's side column. */
  sidebar?: AdminComponentRef[]
  permissions: { read: boolean; update: boolean; publish: boolean }
}

/** A page of its own in the admin (`admin.pages`) that this user may open. */
export interface AdminPageRef {
  path: string
  label: Label
  icon?: string
  /** Where it is listed in the menu; `false`: not listed. */
  group: 'content' | 'settings' | false
  component: AdminComponentRef
}

/** A dashboard panel (`admin.dashboard`) this user may see. */
export interface AdminWidgetRef {
  component: AdminComponentRef
  width: 'half' | 'full'
}

export interface AdminSchema {
  locale: AdminLocale
  /** Admins can email users links to set their password (needs `email` and `serverURL`). */
  passwordLinks: boolean
  /** Menu order of collections (`admin.menu`); unlisted ones follow. */
  menu: string[]
  /** Content locales, when the config has `localization`. */
  localization: { locales: string[]; defaultLocale: string } | null
  collections: AdminCollection[]
  globals: AdminGlobal[]
  /** URLs under the API of the admin modules to load (`admin.modules`). */
  modules: string[]
  /** Files can be uploaded from links (`upload.fromURL`). */
  uploadFromURL: boolean
  /** Which saved deliveries the admin can show (webhooks, emails), for users who may see them. */
  deliveries?: { webhook: boolean; email: boolean }
  /** Admin pages this user may open: Settings → Backups, Email, Roles; deliveries; the status panel. */
  views: {
    status: boolean
    deliveries: boolean
    backups: boolean
    email: boolean
    roles: boolean
    sso: boolean
  }
  /** Roles from the admin are on (`auth.rbac`): documents have owners. */
  rbac: boolean
  /** Outside accounts users can sign in with and link (`auth.providers`). */
  providers: SsoProviderRef[]
  /** Pages this user may open (`admin.pages`). */
  pages: AdminPageRef[]
  /** Dashboard panels this user may see (`admin.dashboard`). */
  dashboard: AdminWidgetRef[]
}

/** Props go to the browser as JSON; a round trip drops functions and other non-JSON values. */
function componentRef(component: AdminComponent): AdminComponentRef {
  if (typeof component === 'string') return { tag: component }
  return component.props
    ? { tag: component.tag, props: JSON.parse(JSON.stringify(component.props)) }
    : { tag: component.tag }
}

/** A `where` result means "some documents", so the action is offered and the server decides per document. */
async function allowed(access: Access | undefined, user: AuthUser): Promise<boolean> {
  return (await evaluateAccess(access, { user })) !== false
}

async function serializeFields(
  fields: readonly Field[],
  checks: { update: FieldAccessChecker; read: FieldAccessChecker },
  localized: boolean,
): Promise<AdminField[]> {
  const { update } = checks
  const out: AdminField[] = []
  for (const field of fields) {
    // Fields the user may not read are left out: no input, list column or filter.
    if (field.hidden || !(await checks.read.allows(field))) continue
    const f: AdminField = { name: field.name, type: field.type }
    if (field.label !== undefined) f.label = field.label
    if (field.required) f.required = true
    if (field.unique) f.unique = true
    if (field.defaultValue !== undefined) f.defaultValue = field.defaultValue
    if (!(await update.allows(field))) f.readOnly = true
    if (field.localized && localized) f.localized = true
    if (field.position === 'sidebar') f.position = 'sidebar'
    if (field.admin?.component || field.admin?.after?.length || field.admin?.cell) {
      f.admin = {
        ...(field.admin.component ? { component: componentRef(field.admin.component) } : {}),
        ...(field.admin.after?.length ? { after: field.admin.after.map(componentRef) } : {}),
        ...(field.admin.cell ? { cell: componentRef(field.admin.cell) } : {}),
      }
    }
    if (field.customType) f.customType = field.customType
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
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        if (field.filterOptions) f.filtered = true
        break
      case 'upload':
        f.to = 'media'
        if (field.hasMany) f.hasMany = true
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        if (field.mimeTypes) f.mimeTypes = [...field.mimeTypes]
        break
      case 'array':
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        f.fields = await serializeFields(field.fields, checks, localized)
        break
      case 'blocks':
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        f.blocks = await Promise.all(
          field.blocks.map(async (block) => ({
            slug: block.slug,
            ...(block.labels ? { labels: block.labels } : {}),
            fields: await serializeFields(block.fields, checks, localized),
          })),
        )
        break
      case 'group':
        f.fields = await serializeFields(field.fields, checks, localized)
        break
    }
    out.push(f)
  }
  return out
}

/** Field access for the user: `access` in the code and, with roles, their role's field rules. */
async function checkers(cms: EasyCMS, user: AuthUser) {
  const rules = await cms.roles.fieldRules(user)
  return {
    update: new FieldAccessChecker('update', { user }, rules),
    read: new FieldAccessChecker('read', { user }, rules),
  }
}

/** Allowed by access rules and, with roles, by the user's role. */
async function may(
  cms: EasyCMS,
  access: Access | undefined,
  user: AuthUser,
  target: { collection: string } | { global: string },
  operation: RoleOperation,
): Promise<boolean> {
  return (
    (await allowed(access, user)) && (await cms.roles.allows(user, target, operation)) !== false
  )
}

async function collection(
  cms: EasyCMS,
  config: CollectionConfig,
  user: AuthUser,
  localized: boolean,
  roles: { key: string; name: string }[],
): Promise<AdminCollection> {
  const target = { collection: config.slug }
  const fields = await serializeFields(config.fields, await checkers(cms, user), localized)
  // With roles from the admin, a user's role is one of Settings → Roles.
  if (config.slug === USERS && cms.roles.enabled) {
    const role = fields.find((f) => f.name === 'role')
    if (role) {
      role.type = 'select'
      role.options = roles.map((r) => ({ label: r.name || r.key, value: r.key }))
    }
  }
  const result: AdminCollection = {
    slug: config.slug,
    drafts: config.drafts === true,
    versions: Boolean(config.versions),
    preview: typeof config.preview === 'function',
    schedule: config.schedule === true,
    fields,
    permissions: {
      read: await may(cms, config.access?.read, user, target, 'read'),
      create: await may(cms, config.access?.create, user, target, 'create'),
      update: await may(cms, config.access?.update, user, target, 'update'),
      delete: await may(cms, config.access?.delete, user, target, 'delete'),
      publish:
        config.drafts === true && (await may(cms, config.access?.update, user, target, 'publish')),
    },
  }
  if (config.labels) result.labels = config.labels
  if (config.useAsTitle) result.useAsTitle = config.useAsTitle
  if (config.icon) result.icon = config.icon
  if (config.admin?.sidebar?.length) result.sidebar = config.admin.sidebar.map(componentRef)
  if (config.admin?.group === 'settings' || SETTINGS.has(config.slug)) result.group = 'settings'
  if (config.admin?.list?.tree) result.tree = config.admin.list.tree
  if (config.admin?.list?.sort) result.defaultSort = config.admin.list.sort
  const owner = cms.roles.ownerOf(config.slug)
  if (owner && fields.some((f) => f.name === owner)) result.owner = owner
  // Drafts, history and preview need the whole page.
  if (config.editIn === 'drawer' && !result.drafts && !result.versions && !result.preview)
    result.editIn = 'drawer'
  return result
}

async function global(
  cms: EasyCMS,
  config: GlobalConfig,
  user: AuthUser,
  localized: boolean,
): Promise<AdminGlobal> {
  const target = { global: config.slug }
  const checks = await checkers(cms, user)
  const result: AdminGlobal = {
    slug: config.slug,
    drafts: config.drafts === true,
    versions: Boolean(config.versions),
    preview: typeof config.preview === 'function',
    schedule: config.schedule === true,
    fields: await serializeFields(config.fields, checks, localized),
    permissions: {
      read: await may(cms, config.access?.read, user, target, 'read'),
      update: await may(cms, config.access?.update, user, target, 'update'),
      publish:
        config.drafts === true && (await may(cms, config.access?.update, user, target, 'publish')),
    },
  }
  if (config.label !== undefined) result.label = config.label
  if (config.icon) result.icon = config.icon
  if (config.admin?.sidebar?.length) result.sidebar = config.admin.sidebar.map(componentRef)
  return result
}

/** Everything the admin UI needs to render forms and menus for this user. */
export async function adminSchema(
  cms: EasyCMS,
  user: AuthUser,
  origin?: string,
): Promise<AdminSchema> {
  const collections = cms.config.collections.filter((c) => !INTERNAL_COLLECTIONS.has(c.slug))
  const localization = cms.config.localization
  const localized = localization !== null
  const admin = user.role === 'admin' && !user.apiKey
  const deliveries = cms.config.collections.some(
    (c) => c.slug === WEBHOOK_DELIVERIES || c.slug === EMAIL_DELIVERIES,
  )
  const views = {
    status: await cms.roles.canView(user, 'status'),
    deliveries: deliveries && (await cms.roles.canView(user, 'deliveries')),
    backups: admin,
    email: admin,
    roles: admin && cms.roles.enabled,
    sso: admin && cms.auth.sso.enabled,
  }
  const roles = await cms.roles.options()
  return {
    locale: cms.config.admin.locale,
    passwordLinks: cms.auth.canSendPasswordLinks(origin),
    menu: [...cms.config.admin.menu],
    localization: localization
      ? { locales: [...localization.locales], defaultLocale: localization.defaultLocale }
      : null,
    collections: await Promise.all(
      collections.map((c) => collection(cms, c, user, localized, roles)),
    ),
    globals: await Promise.all(cms.config.globals.map((g) => global(cms, g, user, localized))),
    modules: adminModuleUrls(cms),
    uploadFromURL: cms.config.upload.fromURL !== undefined,
    views,
    rbac: cms.roles.enabled,
    providers: cms.auth.sso.providers(),
    ...(views.deliveries
      ? {
          deliveries: {
            webhook: cms.config.collections.some((c) => c.slug === WEBHOOK_DELIVERIES),
            email: cms.config.collections.some((c) => c.slug === EMAIL_DELIVERIES),
          },
        }
      : {}),
    pages: await pages(cms, user),
    dashboard: await widgets(cms, user),
  }
}

/** Whether a page or widget is shown to this user; a failing check hides it. */
async function shown(access: AdminViewAccess | undefined, user: AuthUser): Promise<boolean> {
  if (!access) return true
  try {
    return (await access({ user })) === true
  } catch {
    return false
  }
}

async function pages(cms: EasyCMS, user: AuthUser): Promise<AdminPageRef[]> {
  const out: AdminPageRef[] = []
  for (const page of cms.config.admin.pages) {
    if (!(await shown(page.access, user)) || !(await cms.roles.canView(user, `page:${page.path}`)))
      continue
    out.push({
      path: page.path,
      label: page.label,
      ...(page.icon ? { icon: page.icon } : {}),
      group: page.group ?? 'content',
      component: componentRef(page.component),
    })
  }
  return out
}

async function widgets(cms: EasyCMS, user: AuthUser): Promise<AdminWidgetRef[]> {
  const out: AdminWidgetRef[] = []
  for (const widget of cms.config.admin.dashboard) {
    const tag = typeof widget.component === 'string' ? widget.component : widget.component.tag
    if (!(await shown(widget.access, user)) || !(await cms.roles.canView(user, `widget:${tag}`)))
      continue
    out.push({ component: componentRef(widget.component), width: widget.width ?? 'half' })
  }
  return out
}
