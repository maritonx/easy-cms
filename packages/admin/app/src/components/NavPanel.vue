<script setup lang="ts">
import { Filter, LayoutDashboard, PanelLeftClose, Pin, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { t } from '../lib/i18n'
import {
  filterNav,
  HOME,
  itemCount,
  matches,
  pinnedEntries,
  railGroups,
  shownGroup,
} from '../lib/nav'
import { modKey } from '../lib/shortcuts'
import NavTree from './NavTree.vue'
import SwitcherSelect from './SwitcherSelect.vue'

/**
 * The menu's second column: the items of the group picked in the rail, its groups as headings.
 * Home also has the dashboard and the pinned items. A long group can be filtered.
 */
defineProps<{ collapsible: boolean }>()
const emit = defineEmits<{ collapse: []; close: [] }>()

/** From this many items, a group gets a filter. */
const FILTER_FROM = 9

const group = computed(
  () => railGroups.value.find((g) => g.id === shownGroup.value) ?? railGroups.value[0],
)
const home = computed(() => group.value?.id === HOME)
const query = ref('')
watch(
  () => group.value?.id,
  () => {
    query.value = ''
  },
)

const nodes = computed(() => filterNav(group.value?.nodes ?? [], query.value))
const dashboard = computed(() => home.value && matches(t('nav.dashboard'), query.value))
const pinned = computed(() =>
  home.value ? pinnedEntries.value.filter((e) => matches(e.label, query.value)) : [],
)
const filterable = computed(
  () =>
    itemCount(group.value?.nodes ?? []) + (home.value ? pinnedEntries.value.length + 1 : 0) >=
    FILTER_FROM,
)
const empty = computed(() => !nodes.value.length && !dashboard.value && !pinned.value.length)
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <div class="panel-title">
        <h2>{{ group?.label }}</h2>
        <button
          v-if="collapsible"
          type="button"
          class="icon-btn"
          :aria-label="t('nav.collapse')"
          :title="`${t('nav.collapse')} ( [ )`"
          @click="emit('collapse')"
        >
          <PanelLeftClose :size="17" aria-hidden="true" />
        </button>
        <button type="button" class="icon-btn close" :aria-label="t('nav.close')" @click="emit('close')">
          <X :size="18" aria-hidden="true" />
        </button>
      </div>
      <SwitcherSelect />
      <div v-if="filterable" class="filter">
        <Filter :size="14" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          :placeholder="t('nav.filter', { group: group?.label ?? '' })"
          :aria-label="t('nav.filter', { group: group?.label ?? '' })"
          autocomplete="off"
          @keydown.esc="query = ''"
        />
      </div>
    </div>
    <div class="panel-list">
      <RouterLink v-if="dashboard" to="/" class="nav-link" exact-active-class="active" data-nav>
        <LayoutDashboard :size="18" aria-hidden="true" />
        <span class="nav-text">{{ t('nav.dashboard') }}</span>
      </RouterLink>
      <NavTree :nodes="nodes" />
      <section v-if="pinned.length" class="pinned" aria-labelledby="nav-pinned">
        <h3 id="nav-pinned" class="nav-heading"><Pin :size="11" aria-hidden="true" />{{ t('nav.pinned') }}</h3>
        <ul role="list">
          <li v-for="e in pinned" :key="e.key">
            <RouterLink :to="e.to" class="nav-link" active-class="active" data-nav>
              <component :is="e.icon" :size="18" aria-hidden="true" />
              <span class="nav-text">{{ e.label }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>
      <p v-if="empty" class="empty">{{ t('nav.noMatch', { query: query.trim(), key: modKey() }) }}</p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  width: 15.5rem;
  min-width: 0;
  height: 100%;
  background: var(--surface);
  border-right: 1px solid var(--border);
}
.panel-head {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 0.6rem 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 2rem;
}
.panel-title h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
.close {
  display: none;
}
.filter {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 0.4rem;
  color: var(--faint);
}
.filter svg {
  position: absolute;
  left: 0.6rem;
  pointer-events: none;
}
.filter input {
  width: 100%;
  height: 2.1rem;
  padding: 0 0.5rem 0 1.9rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
}
.panel-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.5rem 0.5rem 1.5rem;
}
.pinned {
  margin-top: 0.6rem;
}
.pinned ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.nav-heading {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0 0 0.25rem;
  padding: 0 0.65rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--faint);
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 2.35rem;
  padding: 0 0.65rem;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-weight: 500;
  text-decoration: none;
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
.empty {
  margin: 0.75rem 0.65rem;
  color: var(--faint);
  font-size: 0.85rem;
}
@media (max-width: 900px) {
  .close {
    display: inline-flex;
  }
}
</style>
