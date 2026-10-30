import type { AdminNavGroup, AdminNavItem, AdminNavNode } from '@easy-cms/core'
import {
  CalendarDays,
  DatabaseBackup,
  House,
  KeyRound,
  ListChecks,
  Mail,
  ScrollText,
  Send,
  ShieldCheck,
} from '@lucide/vue'
import { type Component, computed, reactive, ref, watch } from 'vue'
import { badges } from './counts'
import { label, t } from './i18n'
import { collectionIcon, globalIcon } from './icons'
import { session } from './session'

/** An entry of the menu, ready to show. */
export interface NavEntry {
  /** Stable, e.g. `collection:posts`: for pins and the command palette. */
  key: string
  to: string
  label: string
  icon: Component
  /** A collection's slug: for counts, badges and creating. */
  collection?: string
}

const VIEWS: Record<
  Extract<AdminNavItem, { kind: 'view' }>['view'],
  { to: string; key: Parameters<typeof t>[0]; icon: Component }
> = {
  roles: { to: '/roles', key: 'roles.title', icon: ShieldCheck },
  sso: { to: '/sso', key: 'sso.title', icon: KeyRound },
  backups: { to: '/backups', key: 'backups.title', icon: DatabaseBackup },
  email: { to: '/email', key: 'email.title', icon: Mail },
  deliveries: { to: '/deliveries', key: 'deliveries.title', icon: Send },
  jobs: { to: '/jobs', key: 'jobs.title', icon: ListChecks },
  audit: { to: '/audit', key: 'audit.title', icon: ScrollText },
  calendar: { to: '/calendar', key: 'calendar.title', icon: CalendarDays },
}

export const keyOf = (item: AdminNavItem): string => {
  switch (item.kind) {
    case 'collection':
      return `collection:${item.slug}`
    case 'global':
      return `global:${item.slug}`
    case 'page':
      return `page:${item.path}`
    case 'view':
      return `view:${item.view}`
  }
}

/** What a menu item shows and opens; `null` when the schema no longer has it. */
export function entryOf(item: AdminNavItem): NavEntry | null {
  const schema = session.schema
  if (!schema) return null
  switch (item.kind) {
    case 'collection': {
      const c = schema.collections.find((x) => x.slug === item.slug)
      if (!c) return null
      return {
        key: keyOf(item),
        to: `/collections/${c.slug}`,
        label: label(c.labels?.plural, c.slug),
        icon: collectionIcon(c.icon),
        collection: c.slug,
      }
    }
    case 'global': {
      const g = schema.globals.find((x) => x.slug === item.slug)
      if (!g) return null
      return {
        key: keyOf(item),
        to: `/globals/${g.slug}`,
        label: label(g.label, g.slug),
        icon: globalIcon(g.icon),
      }
    }
    case 'page': {
      const p = schema.pages.find((x) => x.path === item.path)
      if (!p) return null
      return {
        key: keyOf(item),
        to: `/p/${p.path}`,
        label: label(p.label, p.path),
        icon: collectionIcon(p.icon),
      }
    }
    case 'view': {
      const v = VIEWS[item.view]
      return { key: keyOf(item), to: v.to, label: t(v.key), icon: v.icon }
    }
  }
}

/** Every item of the menu with the groups it is in, outermost first. */
export function flatten(
  nodes: readonly AdminNavNode[] = session.schema?.nav ?? [],
  parents: AdminNavGroup[] = [],
): { item: AdminNavItem; parents: AdminNavGroup[] }[] {
  return nodes.flatMap((node) =>
    node.kind === 'group' ? flatten(node.items, [...parents, node]) : [{ item: node, parents }],
  )
}

/** The menu item a route belongs to: its own, or (an edit page) its collection's. */
export function itemForPath(path: string): { item: AdminNavItem; parents: AdminNavGroup[] } | null {
  let best: { item: AdminNavItem; parents: AdminNavGroup[] } | null = null
  let length = 0
  for (const found of flatten()) {
    const entry = entryOf(found.item)
    if (!entry) continue
    if ((path === entry.to || path.startsWith(`${entry.to}/`)) && entry.to.length > length) {
      best = found
      length = entry.to.length
    }
  }
  return best
}

/** Whether a page is under Settings in the menu (users, API keys, site settings…). */
export const inSettings = (path: string) => itemForPath(path)?.parents[0]?.id === 'settings'

/** The groups above a page, for its breadcrumb: e.g. Shop › Sales. */
export function crumbsFor(path: string): string[] {
  return itemForPath(path)?.parents.map((g) => label(g.label, g.id)) ?? []
}

// --- The two columns: groups in the rail, the open group's items in the panel ---------------

/** The rail's first icon: the dashboard, the items in no group (Calendar, Media…) and pins. */
export const HOME = ':home'

/** An icon of the rail: a group of the menu, or Home. */
export interface RailGroup {
  id: string
  label: string
  icon: Component
  /** What the panel lists: the group's items, and its groups as headings. */
  nodes: readonly AdminNavNode[]
}

export const railGroups = computed<RailGroup[]>(() => {
  const nav = session.schema?.nav ?? []
  return [
    { id: HOME, label: t('nav.home'), icon: House, nodes: nav.filter((n) => n.kind !== 'group') },
    ...nav
      .filter((n): n is AdminNavGroup => n.kind === 'group')
      .map((g) => ({
        id: g.id,
        label: label(g.label, g.id),
        icon: collectionIcon(g.icon),
        nodes: g.items,
      })),
  ]
})

/** The group the panel shows: the page's, until another icon of the rail is clicked. */
export const shownGroup = ref(HOME)

/** The rail group a page is in; `null` for pages not in the menu (account, not found). */
export function groupForPath(path: string): string | null {
  if (path === '/') return HOME
  const found = itemForPath(path)
  if (!found) return null
  return found.parents[0]?.id ?? HOME
}

/** What needs attention among these items, their groups' included. */
export function badgeSum(nodes: readonly AdminNavNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.kind === 'group') return sum + badgeSum(node.items)
    return node.kind === 'collection' ? sum + (badges[node.slug] ?? 0) : sum
  }, 0)
}

/** Items, groups' included: past a few, the panel offers to filter them. */
export function itemCount(nodes: readonly AdminNavNode[]): number {
  return nodes.reduce((n, node) => n + (node.kind === 'group' ? itemCount(node.items) : 1), 0)
}

/** Whether a name has the filter's text in it. */
export const matches = (name: string, query: string) =>
  name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

/** The items whose name has `query` in it, in the groups that still hold some. */
export function filterNav(nodes: readonly AdminNavNode[], query: string): AdminNavNode[] {
  if (!query.trim()) return [...nodes]
  return nodes.flatMap((node): AdminNavNode[] => {
    if (node.kind === 'group') {
      const items = filterNav(node.items, query)
      return items.length ? [{ ...node, items }] : []
    }
    const entry = entryOf(node)
    return entry && matches(entry.label, query) ? [node] : []
  })
}

// --- What each person changes in the menu (kept in this browser) ---------------------------

interface NavState {
  /** Items pinned to Home, by key, in order. */
  pinned: string[]
  /** Only the rail: the panel folded away (wide screens). */
  rail: boolean
}

const STORAGE = 'easy-cms-nav'

function load(): NavState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<NavState>
    return {
      pinned: Array.isArray(saved.pinned) ? saved.pinned : [],
      rail: saved.rail === true,
    }
  } catch {
    return { pinned: [], rail: false }
  }
}

export const navState = reactive<NavState>(load())
watch(navState, (value) => {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(value))
  } catch {
    // Private mode: the menu forgets on reload.
  }
})

export const isPinned = (key: string) => navState.pinned.includes(key)
export function togglePin(key: string) {
  navState.pinned = isPinned(key)
    ? navState.pinned.filter((k) => k !== key)
    : [...navState.pinned, key]
}

/** Pinned items that still exist for this user. */
export const pinnedEntries = computed(() => {
  const items = new Map(flatten().map(({ item }) => [keyOf(item), item]))
  return navState.pinned
    .map((key) => items.get(key))
    .filter((item): item is AdminNavItem => item !== undefined)
    .map(entryOf)
    .filter((e): e is NavEntry => e !== null)
})
