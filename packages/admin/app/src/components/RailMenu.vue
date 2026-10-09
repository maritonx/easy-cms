<script setup lang="ts">
import type { AdminNavGroup, AdminNavNode } from '@easy-cms/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { badges } from '../lib/counts'
import { label, t } from '../lib/i18n'
import { collectionIcon } from '../lib/icons'
import { entryOf, itemForPath } from '../lib/nav'
import NavTree from './NavTree.vue'

/**
 * The menu as icons only (wide screens): a group opens its items in a panel beside it; names show
 * as tooltips and to screen readers.
 */
const props = defineProps<{ nodes: readonly AdminNavNode[] }>()
const route = useRoute()
const openGroup = ref<string | null>(null)
const panelTop = ref(0)
const root = ref<HTMLElement>()

const current = computed(() => new Set(itemForPath(route.path)?.parents.map((g) => g.id) ?? []))

function badgeSum(group: AdminNavGroup): number {
  return group.items.reduce((sum, node) => {
    if (node.kind === 'group') return sum + badgeSum(node)
    return node.kind === 'collection' ? sum + (badges[node.slug] ?? 0) : sum
  }, 0)
}

function toggle(group: AdminNavGroup, event: MouseEvent) {
  if (openGroup.value === group.id) {
    openGroup.value = null
    return
  }
  const button = event.currentTarget as HTMLElement
  panelTop.value = button.offsetTop
  openGroup.value = group.id
}
const opened = computed(
  () =>
    props.nodes.find((n): n is AdminNavGroup => n.kind === 'group' && n.id === openGroup.value) ??
    null,
)

function close() {
  openGroup.value = null
}
function onDocument(event: Event) {
  if (root.value && !root.value.contains(event.target as Node)) close()
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && openGroup.value) {
    const id = openGroup.value
    close()
    root.value?.querySelector<HTMLElement>(`[data-group="${id}"]`)?.focus()
  }
}
watch(openGroup, (value) => {
  if (value) {
    document.addEventListener('pointerdown', onDocument)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('pointerdown', onDocument)
    document.removeEventListener('keydown', onKey)
  }
})
watch(() => route.fullPath, close)
onBeforeUnmount(close)
</script>

<template>
  <div ref="root" class="rail">
    <template v-for="node in nodes" :key="node.kind === 'group' ? `g:${node.id}` : JSON.stringify(node)">
      <button
        v-if="node.kind === 'group'"
        type="button"
        class="rail-btn"
        :class="{ current: current.has(node.id) }"
        :aria-label="badgeSum(node) ? `${label(node.label, node.id)}, ${t('nav.attention', { n: badgeSum(node) })}` : label(node.label, node.id)"
        :title="label(node.label, node.id)"
        :aria-expanded="openGroup === node.id"
        :data-group="node.id"
        data-nav
        @click="toggle(node, $event)"
      >
        <component :is="collectionIcon(node.icon)" :size="20" aria-hidden="true" />
        <span v-if="badgeSum(node)" class="dot" aria-hidden="true">{{ badgeSum(node) }}</span>
      </button>
      <RouterLink
        v-else-if="entryOf(node)"
        :to="entryOf(node)!.to"
        class="rail-btn"
        active-class="current"
        :aria-label="entryOf(node)!.label"
        :title="entryOf(node)!.label"
        data-nav
      >
        <component :is="entryOf(node)!.icon" :size="20" aria-hidden="true" />
      </RouterLink>
    </template>
    <div
      v-if="opened"
      class="flyout"
      role="group"
      :aria-label="label(opened.label, opened.id)"
      :style="{ top: `${panelTop}px` }"
    >
      <strong class="flyout-title">{{ label(opened.label, opened.id) }}</strong>
      <NavTree :nodes="opened.items" :depth="1" />
    </div>
  </div>
</template>

<style scoped>
.rail {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}
.rail-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.rail-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
.rail-btn.current {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.dot {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.25rem;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.65rem;
  font-weight: 700;
}
.flyout {
  position: absolute;
  left: calc(100% + 0.75rem);
  z-index: 50;
  width: 15.5rem;
  max-height: 70vh;
  overflow-y: auto;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.flyout-title {
  display: block;
  padding: 0.35rem 0.65rem 0.5rem;
  font-size: 0.9rem;
}
.flyout :deep(.nav-link.nested),
.flyout :deep(.nav-subgroup) {
  padding-left: 0.65rem;
}
</style>
