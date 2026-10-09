import type { AdminNavGroup, AdminNavItem, AdminNavNode } from '@easy-cms/core'
import { DatabaseBackup, KeyRound, Mail, ScrollText, Send, ShieldCheck } from '@lucide/vue'
import { type Component, computed, reactive, watch } from 'vue'
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
  audit: { to: '/audit', key: 'audit.title', icon: ScrollText },
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

// --- What each person changes in the menu (kept in this browser) ---------------------------

interface NavState {
  /** Groups folded away, by id. */
  folded: string[]
  /** Items pinned to the top, by key, in order. */
  pinned: string[]
  /** Only icons (wide screens). */
  rail: boolean
}

const STORAGE = 'easy-cms-nav'

function load(): NavState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<NavState>
    return {
      folded: Array.isArray(saved.folded) ? saved.folded : [],
      pinned: Array.isArray(saved.pinned) ? saved.pinned : [],
      rail: saved.rail === true,
    }
  } catch {
    return { folded: [], pinned: [], rail: false }
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

export const isFolded = (id: string) => navState.folded.includes(id)
export function setFolded(id: string, folded: boolean) {
  const rest = navState.folded.filter((x) => x !== id)
  navState.folded = folded ? [...rest, id] : rest
}

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
