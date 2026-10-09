import {
  type Access,
  type AuthUser,
  type ID,
  isSystemAdmin,
  type RequestContext,
} from '../access.js'
import { evaluateAccess, FieldAccessChecker } from '../access-control.js'
import { API_KEYS } from '../api-keys.js'
import type { SsoProviderRef } from '../auth/sso.js'
import {
  EMAIL_DELIVERIES,
  INTERNAL_COLLECTIONS,
  MEDIA,
  MEDIA_FOLDERS,
  USERS,
  WEBHOOK_DELIVERIES,
} from '../builtins.js'
import type { FieldCondition } from '../conditions.js'
import type {
  AdminLocale,
  AdminSwitcher,
  AdminViewAccess,
  CollectionConfig,
  GlobalConfig,
  LayoutNode,
  SidebarPanel,
} from '../config.js'
import type { AdminComponent, Field, Label } from '../fields.js'
import type { EasyCMS } from '../local-api.js'
import { expandMimeTypes } from '../media.js'
import {
  groupOf,
  LABEL_ORDER,
  MEDIA_ORDER,
  navGroups,
  navIds,
  type ResolvedNavGroup,
} from '../nav.js'
import type { RoleOperation } from '../roles.js'
import { adminModuleUrls } from './admin-modules.js'

/** Built-in collections listed under Settings › Users & access in the menu. */
const PEOPLE = new Set([USERS, API_KEYS])

/** A Web Component from an admin module, with its `props` (plain JSON). */
export interface AdminComponentRef {
  tag: string
  props?: Record<string, unknown>
  /** A side panel at the top of the side column (`position: 'top'`). */
  position?: 'top'
}

/** Where the edit page puts its fields (`admin.layout`), with unplaced fields filled in. */
export type AdminLayoutNode =
  | { type: 'field'; name: string }
  | { type: 'row'; fields: string[] }
  | {
      type: 'collapsible'
      label: Label
      collapsed?: boolean
      description?: Label
      nodes: AdminLayoutNode[]
    }
  | { type: 'tab'; label: Label; description?: Label; nodes: AdminLayoutNode[] }

/** An entry of the admin menu. */
export type AdminNavItem =
  | { kind: 'collection'; slug: string }
  | { kind: 'global'; slug: string }
  | { kind: 'page'; path: string }
  | { kind: 'view'; view: 'roles' | 'sso' | 'backups' | 'email' | 'deliveries' | 'audit' }

/** A group of the admin menu (`admin.nav`), with what this user may open in it. */
export interface AdminNavGroup {
  kind: 'group'
  id: string
  label: Label
  icon?: string
  items: AdminNavNode[]
}

export type AdminNavNode = AdminNavItem | AdminNavGroup

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
  /** An upload's media folder (`folder`): where its picker opens; `only`: nowhere else. */
  folder?: { id: ID; only: boolean }
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
  /** A column of the list at first (`admin.column`). */
  column?: boolean
  /** A relationship that offers no "Create" in place (`admin.allowCreate: false`). */
  noCreate?: boolean
  /** A field of an added type (`fieldTypes`), e.g. `color`; `type` is the base it's stored as. */
  customType?: string
  /** Help below its label (`admin.description`). */
  description?: Label
  /** Its share of a row (`admin.width`). */
  width?: string
  /** Shown only when its siblings match (`admin.condition`). */
  condition?: FieldCondition
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
  /** Tabs, sections and rows of the edit page (`admin.layout`). */
  layout?: AdminLayoutNode[]
  /** A number in the menu (`admin.badge`); the menu's counts come from `GET <api>/admin/ui/counts`. */
  badge?: { tone: 'accent' | 'warning' | 'danger'; label?: Label }
  /** No document count beside it in the menu (`admin.count: false`). */
  noCount?: boolean
  /** What the list says while it has no documents (`admin.empty`). */
  empty?: { description?: Label; link?: { label: Label; href: string } }
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
  /** Deleting asks to type the title, and says what goes too (`admin.confirmDelete`). */
  confirmDelete?: { typeTitle?: boolean; impact?: string }
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
  /** Tabs, sections and rows of the edit page (`admin.layout`). */
  layout?: AdminLayoutNode[]
  permissions: { read: boolean; update: boolean; publish: boolean }
}

/** A page of its own in the admin (`admin.pages`) that this user may open. */
export interface AdminPageRef {
  path: string
  label: Label
  icon?: string
  component: AdminComponentRef
}

/** A dashboard panel (`admin.dashboard`) this user may see. */
export interface AdminWidgetRef {
  component: AdminComponentRef
  width: 'half' | 'full'
}

export interface AdminSchema {
  locale: AdminLocale
  /** A choice for the whole admin, e.g. the tenant (`admin.switcher`). */
  switcher: AdminSwitcher | null
  /** Admins can email users links to set their password (needs `email` and `serverURL`). */
  passwordLinks: boolean
  /** The menu: groups and what this user may open in them, in order. */
  nav: AdminNavNode[]
  /** More entries of the command palette (`admin.commands`). */
  commands: { label: Label; href: string; icon?: string; keywords?: string[] }[]
  /** Content locales, when the config has `localization`. */
  localization: { locales: string[]; defaultLocale: string } | null
  collections: AdminCollection[]
  globals: AdminGlobal[]
  /** URLs under the API of the admin modules to load (`admin.modules`). */
  modules: string[]
  /** Files can be uploaded from links (`upload.fromURL`). */
  uploadFromURL: boolean
  /** What the media library takes (`upload.maxFileSize`, `upload.mimeTypes` with groups expanded). */
  upload: { maxFileSize: number; mimeTypes: string[] }
  /**
   * The media library has folders (`upload.folders`); `permissions`: this user may choose which
   * roles use each folder (admins, with `auth.rbac`).
   */
  folders?: { permissions: boolean; private: boolean }
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
    audit: boolean
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
async function allowed(
  access: Access | undefined,
  user: AuthUser,
  context: RequestContext,
): Promise<boolean> {
  return (await evaluateAccess(access, { user, context })) !== false
}

async function serializeFields(
  fields: readonly Field[],
  checks: { update: FieldAccessChecker; read: FieldAccessChecker },
  localized: boolean,
  /** A media folder's id from its key (`upload.folders`). */
  folderId: ((key: string) => Promise<ID | null>) | undefined,
  /** For options worked out per request (`admin.column`, `admin.defaultValue`). */
  who: { user: AuthUser; context: RequestContext },
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
    if (field.admin?.initialValue) {
      const value = await field.admin.initialValue(who)
      if (value !== undefined) f.defaultValue = value
    }
    const column = field.admin?.column
    if (column === true || (typeof column === 'function' && (await column(who)))) f.column = true
    if (field.admin?.allowCreate === false) f.noCreate = true
    if (!(await update.allows(field))) f.readOnly = true
    if (field.localized && localized) f.localized = true
    if (field.admin?.position === 'sidebar') f.position = 'sidebar'
    if (field.admin?.component || field.admin?.after?.length || field.admin?.cell) {
      f.admin = {
        ...(field.admin.component ? { component: componentRef(field.admin.component) } : {}),
        ...(field.admin.after?.length ? { after: field.admin.after.map(componentRef) } : {}),
        ...(field.admin.cell ? { cell: componentRef(field.admin.cell) } : {}),
      }
    }
    if (field.customType) f.customType = field.customType
    if (field.admin?.description !== undefined) f.description = field.admin.description
    if (field.admin?.width) f.width = field.admin.width
    if (field.admin?.condition) f.condition = JSON.parse(JSON.stringify(field.admin.condition))
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
        if (field.filterOptions) f.filtered = true
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        if (field.mimeTypes) f.mimeTypes = expandMimeTypes(field.mimeTypes)
        if (field.folder && folderId) {
          // None while no scope is chosen (e.g. all tenants): the picker opens at the top.
          const id = await folderId(field.folder)
          if (id !== null) f.folder = { id, only: field.folderOnly === true }
        }
        break
      case 'array':
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        f.fields = await serializeFields(field.fields, checks, localized, folderId, who)
        break
      case 'blocks':
        if (field.minRows !== undefined) f.minRows = field.minRows
        if (field.maxRows !== undefined) f.maxRows = field.maxRows
        f.blocks = await Promise.all(
          field.blocks.map(async (block) => ({
            slug: block.slug,
            ...(block.labels ? { labels: block.labels } : {}),
            fields: await serializeFields(block.fields, checks, localized, folderId, who),
          })),
        )
        break
      case 'group':
        f.fields = await serializeFields(field.fields, checks, localized, folderId, who)
        break
    }
    out.push(f)
  }
  return out
}

/** Field access for the user: `access` in the code and, with roles, their role's field rules. */
async function checkers(cms: EasyCMS, user: AuthUser, context: RequestContext) {
  const rules = await cms.roles.fieldRules(user)
  return {
    update: new FieldAccessChecker('update', { user, context }, rules),
    read: new FieldAccessChecker('read', { user, context }, rules),
  }
}

/** Allowed by access rules and, with roles, by the user's role. */
async function may(
  cms: EasyCMS,
  access: Access | undefined,
  user: AuthUser,
  target: { collection: string } | { global: string },
  operation: RoleOperation,
  context: RequestContext,
): Promise<boolean> {
  return (
    (await allowed(access, user, context)) &&
    (await cms.roles.allows(user, target, operation)) !== false
  )
}

async function collection(
  cms: EasyCMS,
  config: CollectionConfig,
  user: AuthUser,
  localized: boolean,
  roles: { key: string; name: string }[],
  context: RequestContext,
): Promise<AdminCollection> {
  const target = { collection: config.slug }
  const fields = await serializeFields(
    config.fields,
    await checkers(cms, user, context),
    localized,
    folderIds(cms, user, context),
    { user, context },
  )
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
      read: await may(cms, config.access?.read, user, target, 'read', context),
      create: await may(cms, config.access?.create, user, target, 'create', context),
      update: await may(cms, config.access?.update, user, target, 'update', context),
      delete: await may(cms, config.access?.delete, user, target, 'delete', context),
      publish:
        config.drafts === true &&
        (await may(cms, config.access?.update, user, target, 'publish', context)),
    },
  }
  if (config.labels) result.labels = config.labels
  if (config.useAsTitle) result.useAsTitle = config.useAsTitle
  if (config.admin?.icon) result.icon = config.admin.icon
  if (config.admin?.sidebar?.length) result.sidebar = config.admin.sidebar.map(panelRef)
  if (config.admin?.layout?.length) result.layout = layoutOf(config.admin.layout, fields)
  const badge = config.admin?.badge
  if (badge)
    result.badge = { tone: badge.tone ?? 'accent', ...(badge.label ? { label: badge.label } : {}) }
  if (config.admin?.count === false) result.noCount = true
  if (config.admin?.empty) result.empty = JSON.parse(JSON.stringify(config.admin.empty))
  if (config.admin?.list?.tree) result.tree = config.admin.list.tree
  if (config.admin?.list?.sort) result.defaultSort = config.admin.list.sort
  if (config.admin?.confirmDelete) result.confirmDelete = { ...config.admin.confirmDelete }
  const owner = cms.roles.ownerOf(config.slug)
  if (owner && fields.some((f) => f.name === owner)) result.owner = owner
  // Drafts, history and preview need the whole page.
  if (config.admin?.editIn === 'drawer' && !result.drafts && !result.versions && !result.preview)
    result.editIn = 'drawer'
  return result
}

async function global(
  cms: EasyCMS,
  config: GlobalConfig,
  user: AuthUser,
  localized: boolean,
  context: RequestContext,
): Promise<AdminGlobal> {
  const target = { global: config.slug }
  const checks = await checkers(cms, user, context)
  const result: AdminGlobal = {
    slug: config.slug,
    drafts: config.drafts === true,
    versions: Boolean(config.versions),
    preview: typeof config.preview === 'function',
    schedule: config.schedule === true,
    fields: await serializeFields(config.fields, checks, localized, folderIds(cms, user, context), {
      user,
      context,
    }),
    permissions: {
      read: await may(cms, config.access?.read, user, target, 'read', context),
      update: await may(cms, config.access?.update, user, target, 'update', context),
      publish:
        config.drafts === true &&
        (await may(cms, config.access?.update, user, target, 'publish', context)),
    },
  }
  if (config.label !== undefined) result.label = config.label
  if (config.admin?.icon) result.icon = config.admin.icon
  if (config.admin?.sidebar?.length) result.sidebar = config.admin.sidebar.map(panelRef)
  if (config.admin?.layout?.length) result.layout = layoutOf(config.admin.layout, result.fields)
  return result
}

/** Everything the admin UI needs to render forms and menus for this user. */
export async function adminSchema(
  cms: EasyCMS,
  user: AuthUser,
  origin?: string,
  context: RequestContext = {},
): Promise<AdminSchema> {
  const collections = cms.config.collections.filter((c) => !INTERNAL_COLLECTIONS.has(c.slug))
  const localization = cms.config.localization
  const localized = localization !== null
  // Settings are for admins of the whole system, not of a part (`scoped`, e.g. one tenant).
  const admin = isSystemAdmin(user)
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
    audit: cms.audit.enabled && (await cms.roles.canView(user, 'audit')),
  }
  const roles = await cms.roles.options()
  const adminCollections = await Promise.all(
    collections.map((c) => collection(cms, c, user, localized, roles, context)),
  )
  const adminGlobals = await Promise.all(
    cms.config.globals.map((g) => global(cms, g, user, localized, context)),
  )
  const adminPages = await pages(cms, user)
  return {
    locale: cms.config.admin.locale,
    switcher: cms.config.admin.switcher || null,
    passwordLinks: cms.auth.canSendPasswordLinks(origin),
    nav: buildNav(cms, adminCollections, adminGlobals, adminPages, views),
    commands: cms.config.admin.commands.map((c) => JSON.parse(JSON.stringify(c))),
    localization: localization
      ? { locales: [...localization.locales], defaultLocale: localization.defaultLocale }
      : null,
    collections: adminCollections,
    globals: adminGlobals,
    modules: adminModuleUrls(cms),
    uploadFromURL: cms.config.upload.fromURL !== undefined,
    upload: {
      maxFileSize: cms.config.upload.maxFileSize,
      mimeTypes: expandMimeTypes(cms.config.upload.mimeTypes),
    },
    ...(cms.folders.enabled
      ? {
          folders: {
            permissions: admin && cms.roles.enabled,
            // Admins can make folders private when there is somewhere private to keep files.
            private: admin && cms.privateStorage !== null,
          },
        }
      : {}),
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
    pages: adminPages,
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
      component: componentRef(page.component),
    })
  }
  return out
}

async function widgets(cms: EasyCMS, user: AuthUser): Promise<AdminWidgetRef[]> {
  const out: AdminWidgetRef[] = []
  for (const widget of cms.config.admin.dashboard) {
    const tag = typeof widget.component === 'string' ? widget.component : widget.component.tag
    const id = widget.id ?? tag
    if (!(await shown(widget.access, user)) || !(await cms.roles.canView(user, `widget:${id}`)))
      continue
    out.push({ component: componentRef(widget.component), width: widget.width ?? 'half' })
  }
  return out
}

/** Media folders by key, made when first needed; `undefined` without `upload.folders`. */
function folderIds(
  cms: EasyCMS,
  user: AuthUser,
  context: RequestContext,
): ((key: string) => Promise<ID | null>) | undefined {
  return cms.folders.enabled ? (key) => cms.keyedFolder(key, { user, context }) : undefined
}

/** A side panel; `position: 'top'` puts it above the side fields. */
function panelRef(panel: SidebarPanel): AdminComponentRef {
  const ref = componentRef(panel as AdminComponent)
  if (typeof panel === 'object' && 'position' in panel && panel.position === 'top')
    ref.position = 'top'
  return ref
}

/**
 * The edit page's layout for the fields this user sees: names they can't read are dropped, and
 * fields not placed follow at the end (in the first tab).
 */
function layoutOf(layout: readonly LayoutNode[], fields: readonly AdminField[]): AdminLayoutNode[] {
  const shown = new Set(fields.filter((f) => f.position !== 'sidebar').map((f) => f.name))
  const placed = new Set<string>()
  const convert = (nodes: readonly LayoutNode[]): AdminLayoutNode[] =>
    nodes.flatMap((node): AdminLayoutNode[] => {
      if (typeof node === 'string') {
        if (!shown.has(node)) return []
        placed.add(node)
        return [{ type: 'field', name: node }]
      }
      if ('row' in node) {
        const names = node.row.filter((n) => shown.has(n))
        for (const n of names) placed.add(n)
        return names.length ? [{ type: 'row', fields: names }] : []
      }
      if ('collapsible' in node) {
        const inner = convert(node.fields)
        return inner.length
          ? [
              {
                type: 'collapsible',
                label: node.collapsible,
                ...(node.collapsed ? { collapsed: true } : {}),
                ...(node.description !== undefined ? { description: node.description } : {}),
                nodes: inner,
              },
            ]
          : []
      }
      const inner = convert(node.fields)
      return [
        {
          type: 'tab',
          label: node.tab,
          ...(node.description !== undefined ? { description: node.description } : {}),
          nodes: inner,
        },
      ]
    })
  const out = convert(layout)
  const rest: AdminLayoutNode[] = [...shown]
    .filter((n) => !placed.has(n))
    .map((name) => ({ type: 'field', name }))
  const first = out[0]
  if (first?.type === 'tab') first.nodes.push(...rest)
  else out.push(...rest)
  // Tabs with nothing this user may see are left out.
  return out.filter((n) => n.type !== 'tab' || n.nodes.length > 0)
}

type ViewKey = Extract<AdminNavItem, { kind: 'view' }>['view']

/** Where Settings pages of the admin go in the menu. */
const VIEW_GROUPS: readonly [ViewKey, string][] = [
  ['roles', 'settings.people'],
  ['sso', 'settings.people'],
  ['backups', 'settings.system'],
  ['email', 'settings.system'],
  ['deliveries', 'settings.system'],
  ['audit', 'settings.system'],
]

/** The menu for this user: groups (the config's merged over the built-in ones) and their items. */
function buildNav(
  cms: EasyCMS,
  collections: readonly AdminCollection[],
  globals: readonly AdminGlobal[],
  pageRefs: readonly AdminPageRef[],
  views: Record<ViewKey | 'status', boolean>,
): AdminNavNode[] {
  const groups = navGroups(cms.config.admin.nav)
  const ids = navIds(groups)
  // Items of each group: those with `admin.order` first (lower first), then in config order.
  const placed = new Map<string, { item: AdminNavItem; order: number; index: number }[]>()
  const labelGroups = new Map<string, Label>()
  let index = 0
  const put = (group: { id: string; label?: Label }, item: AdminNavItem, order?: number) => {
    if (group.label !== undefined && !labelGroups.has(group.id))
      labelGroups.set(group.id, group.label)
    const list = placed.get(group.id) ?? []
    list.push({ item, order: order ?? Number.POSITIVE_INFINITY, index: index++ })
    placed.set(group.id, list)
  }
  const configOf = (slug: string) => cms.config.collections.find((c) => c.slug === slug)
  let media = false
  for (const c of collections) {
    if (!c.permissions.read || c.slug === MEDIA_FOLDERS) continue
    if (c.slug === MEDIA) {
      media = true
      continue
    }
    const admin = configOf(c.slug)?.admin
    if (admin?.group === false) continue
    const group = PEOPLE.has(c.slug)
      ? { id: 'settings.people' }
      : groupOf(admin?.group, ids, 'content')
    put(group, { kind: 'collection', slug: c.slug }, admin?.order)
  }
  for (const g of globals) {
    if (!g.permissions.read) continue
    const admin = cms.config.globals.find((x) => x.slug === g.slug)?.admin
    if (admin?.group === false) continue
    put(groupOf(admin?.group, ids, 'settings.site'), { kind: 'global', slug: g.slug }, admin?.order)
  }
  for (const p of pageRefs) {
    const config = cms.config.admin.pages.find((x) => x.path === p.path)
    const group = config?.group ?? 'content'
    if (group === false) continue
    put(groupOf(group, ids, 'content'), { kind: 'page', path: p.path }, config?.order)
  }
  for (const [view, group] of VIEW_GROUPS)
    if (views[view]) put({ id: group }, { kind: 'view', view })
  const items = new Map<string, AdminNavItem[]>()
  for (const [id, list] of placed)
    items.set(
      id,
      list.sort((a, b) => a.order - b.order || a.index - b.index).map((p) => p.item),
    )

  const toGroup = (g: ResolvedNavGroup): AdminNavGroup | null => {
    const children = g.children.map(toGroup).filter((c): c is AdminNavGroup => c !== null)
    const own = items.get(g.id) ?? []
    if (own.length === 0 && children.length === 0) return null
    return {
      kind: 'group',
      id: g.id,
      label: g.label,
      ...(g.icon ? { icon: g.icon } : {}),
      items: [...own, ...children],
    }
  }
  const root: { order: number; node: AdminNavNode }[] = []
  for (const g of groups) {
    const node = toGroup(g)
    if (node) root.push({ order: g.order, node })
  }
  let i = 0
  for (const [id, label] of labelGroups) {
    const own = items.get(id) ?? []
    if (own.length)
      root.push({ order: LABEL_ORDER + i++, node: { kind: 'group', id, label, items: own } })
  }
  if (media) root.push({ order: MEDIA_ORDER, node: { kind: 'collection', slug: MEDIA } })
  return root.sort((a, b) => a.order - b.order).map((r) => r.node)
}
