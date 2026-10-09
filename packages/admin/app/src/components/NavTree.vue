<script setup lang="ts">
import type { AdminNavGroup, AdminNavNode } from '@easy-cms/core'
import { ChevronDown, ChevronRight, Plus } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { badges, counts } from '../lib/counts'
import { label, t } from '../lib/i18n'
import { collectionIcon } from '../lib/icons'
import { entryOf, isFolded, itemForPath, keyOf, setFolded } from '../lib/nav'
import { session } from '../lib/session'

/**
 * The menu's groups and items, two levels deep: a group folds, a group inside it is a heading
 * that folds too. Items show their count, or (`admin.badge`) what needs attention.
 */
const props = defineProps<{ nodes: readonly AdminNavNode[]; depth?: number }>()
const depth = computed(() => props.depth ?? 0)
const route = useRoute()

/** Groups holding the page that is open: always unfolded. */
const current = computed(() => new Set(itemForPath(route.path)?.parents.map((g) => g.id) ?? []))
const open = (group: AdminNavGroup) => current.value.has(group.id) || !isFolded(group.id)
function toggle(group: AdminNavGroup) {
  setFolded(group.id, open(group))
}

const collection = (slug: string | undefined) =>
  slug ? session.schema?.collections.find((c) => c.slug === slug) : undefined

/** What needs attention in a folded group: the sum of its badges. */
function badgeSum(group: AdminNavGroup): number {
  return group.items.reduce((sum, node) => {
    if (node.kind === 'group') return sum + badgeSum(node)
    return node.kind === 'collection' ? sum + (badges[node.slug] ?? 0) : sum
  }, 0)
}

const rows = computed(() =>
  props.nodes.map((node) => {
    if (node.kind === 'group') return { node, group: node, entry: null }
    const entry = entryOf(node)
    const c = collection(entry?.collection)
    return {
      node,
      group: null,
      entry,
      key: keyOf(node),
      badge: c?.badge && entry?.collection ? (badges[entry.collection] ?? 0) : 0,
      badgeTone: c?.badge?.tone ?? 'accent',
      badgeLabel: c?.badge?.label ? label(c.badge.label, '') : '',
      count: c && !c.noCount && entry?.collection ? counts[entry.collection] : undefined,
      // Media is added by uploading, in the library.
      create: c?.permissions.create === true && c.slug !== 'media',
      singular: c ? label(c.labels?.singular, c.slug) : '',
    }
  }),
)
const id = (group: AdminNavGroup) => `nav-${group.id.replace(/[^a-z0-9-]/gi, '_')}`
</script>

<template>
  <ul class="nav-list" :class="`depth-${depth}`" role="list">
    <li v-for="row in rows" :key="row.group ? `g:${row.group.id}` : row.key">
      <template v-if="row.group">
        <button
          type="button"
          :class="depth === 0 ? 'nav-group' : 'nav-subgroup'"
          :aria-expanded="open(row.group)"
          :aria-controls="id(row.group)"
          data-nav
          @click="toggle(row.group)"
        >
          <component
            :is="collectionIcon(row.group.icon)"
            v-if="depth === 0"
            :size="18"
            aria-hidden="true"
          />
          <span class="nav-text">{{ label(row.group.label, row.group.id) }}</span>
          <span
            v-if="!open(row.group) && badgeSum(row.group) > 0"
            class="nav-badge"
            :aria-label="t('nav.attention', { n: badgeSum(row.group) })"
          >{{ badgeSum(row.group) }}</span>
          <component
            :is="open(row.group) ? ChevronDown : ChevronRight"
            :size="16"
            class="chev"
            aria-hidden="true"
          />
        </button>
        <div v-show="open(row.group)" :id="id(row.group)">
          <NavTree :nodes="row.group.items" :depth="depth + 1" />
        </div>
      </template>
      <div v-else-if="row.entry" class="nav-row">
        <RouterLink
          :to="row.entry.to"
          class="nav-link"
          :class="{ nested: depth > 0 }"
          active-class="active"
          data-nav
        >
          <component :is="row.entry.icon" v-if="depth === 0" :size="18" aria-hidden="true" />
          <span class="nav-text">{{ row.entry.label }}</span>
          <span
            v-if="row.badge > 0"
            class="nav-badge"
            :class="`tone-${row.badgeTone}`"
            :aria-label="row.badgeLabel ? `${row.badge} ${row.badgeLabel}` : t('nav.attention', { n: row.badge })"
          >{{ row.badge }}</span>
          <span v-else-if="row.count !== undefined" class="nav-count" aria-hidden="true">{{ row.count }}</span>
        </RouterLink>
        <RouterLink
          v-if="row.create && row.entry.collection"
          :to="`/collections/${row.entry.collection}/new`"
          class="nav-add"
          :aria-label="t('nav.create', { name: row.singular })"
          :title="t('nav.create', { name: row.singular })"
        >
          <Plus :size="15" aria-hidden="true" />
        </RouterLink>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.nav-group,
.nav-subgroup {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  min-height: 2.35rem;
  padding: 0 0.65rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.nav-subgroup {
  min-height: 2rem;
  padding-left: 2.35rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}
.depth-2 .nav-link.nested {
  padding-left: 2.35rem;
}
.nav-group:hover,
.nav-subgroup:hover {
  background: var(--surface-2);
}
.chev {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--faint);
}
.nav-badge + .chev {
  margin-left: 0.35rem;
}
.nav-row {
  position: relative;
  display: flex;
  align-items: center;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex: 1;
  min-width: 0;
  min-height: 2.35rem;
  padding: 0 0.65rem;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-weight: 500;
  text-decoration: none;
}
.nav-link.nested {
  padding-left: 2.35rem;
}
.nav-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-link:hover {
  background: var(--surface-2);
  color: var(--text);
}
.nav-link.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}
.nav-count {
  margin-left: auto;
  color: var(--faint);
  font-size: 0.8rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.nav-badge {
  margin-left: auto;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.4rem;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.nav-badge.tone-warning {
  background: var(--warning-text);
  color: #fff;
}
.nav-badge.tone-danger {
  background: var(--danger);
  color: #fff;
}
/* Create in place: shown on hover and keyboard focus, so the count stays readable. */
.nav-add {
  position: absolute;
  right: 0.3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-muted);
  opacity: 0;
}
.nav-row:hover .nav-add,
.nav-add:focus-visible {
  opacity: 1;
}
.nav-add:hover {
  background: var(--surface-2);
  color: var(--accent-ink);
}
@media (hover: none) {
  .nav-add {
    display: none;
  }
}
</style>
