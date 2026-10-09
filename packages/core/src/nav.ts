import type { AdminIcon, NavGroup } from './config.js'
import type { Label } from './fields.js'

/** The menu's groups that are always there. Declaring their ids changes labels, icons, order. */
export const BUILTIN_NAV: readonly NavGroup[] = [
  { id: 'content', label: { en: 'Content', th: 'เนื้อหา' }, icon: 'file-text', order: 0 },
  {
    id: 'settings',
    label: { en: 'Settings', th: 'ตั้งค่า' },
    icon: 'settings',
    order: 1000,
    children: [
      { id: 'site', label: { en: 'Site', th: 'เว็บไซต์' }, icon: 'globe' },
      { id: 'people', label: { en: 'Users & access', th: 'ผู้ใช้และสิทธิ์' }, icon: 'users' },
      { id: 'system', label: { en: 'System', th: 'ระบบ' }, icon: 'sliders-horizontal' },
    ],
  },
]

/** Where the media library sits among the groups. */
export const MEDIA_ORDER = 10
/** Groups made from a label (`admin.group: 'Shop'`) come after declared ones. */
const LABEL_ORDER = 500

export const NAV_ID = /^[a-z][a-z0-9-]*$/

export interface ResolvedNavGroup {
  /** `shop`, or `shop.catalog` for a child. */
  readonly id: string
  readonly label: Label
  readonly icon?: AdminIcon
  readonly order: number
  readonly children: readonly ResolvedNavGroup[]
}

function mergeGroups(lists: readonly (readonly NavGroup[])[], parent = ''): ResolvedNavGroup[] {
  const byId = new Map<string, { group: NavGroup; children: NavGroup[][]; index: number }>()
  let index = 0
  for (const list of lists)
    for (const group of list) {
      const found = byId.get(group.id)
      if (found) {
        // The first declaration of a field wins: the site's own config comes before plugins'.
        found.group = { ...group, ...stripUndefined(found.group) }
        if (group.children) found.children.push([...group.children])
      } else {
        byId.set(group.id, {
          group,
          children: group.children ? [[...group.children]] : [],
          index: index++,
        })
      }
    }
  return [...byId.values()]
    .map(({ group, children, index }) => ({
      id: parent ? `${parent}.${group.id}` : group.id,
      label: group.label,
      ...(group.icon ? { icon: group.icon } : {}),
      order: group.order ?? 100 + index,
      children: mergeGroups(children, parent ? `${parent}.${group.id}` : group.id),
    }))
    .sort((a, b) => a.order - b.order)
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

/** The menu's groups: the config's (plugins' included) merged over the built-in ones. */
export function navGroups(declared: readonly NavGroup[]): ResolvedNavGroup[] {
  return mergeGroups([declared, BUILTIN_NAV])
}

/** Every group id, children as `parent.child`. */
export function navIds(groups: readonly ResolvedNavGroup[]): Set<string> {
  const ids = new Set<string>()
  for (const g of groups) {
    ids.add(g.id)
    for (const c of g.children) ids.add(c.id)
  }
  return ids
}

/**
 * The group an `admin.group` value names: a declared id, `settings` (Settings › Site), or a label,
 * which makes a group of its own (`label:<json>`).
 */
export function groupOf(
  group: unknown,
  ids: ReadonlySet<string>,
  fallback: string,
): { id: string; label?: Label } {
  if (group === undefined || group === null) return { id: fallback }
  if (group === 'settings') return { id: 'settings.site' }
  if (typeof group === 'string' && ids.has(group)) return { id: group }
  return { id: `label:${JSON.stringify(group)}`, label: group as Label }
}

export { LABEL_ORDER }
