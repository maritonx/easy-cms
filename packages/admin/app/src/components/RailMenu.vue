<script setup lang="ts">
import { PanelLeftOpen, Search } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '../lib/i18n'
import { badgeSum, groupForPath, type RailGroup, railGroups, shownGroup } from '../lib/nav'
import { settings } from '../lib/settings'
import { modKey, openPalette } from '../lib/shortcuts'
import { brandName } from '../lib/theme'
import AccountMenu from './AccountMenu.vue'

/**
 * The menu's first column: an icon for each group. Clicking one shows its items in the panel
 * beside it, without leaving the page. Settings sits at the foot, with search and the account.
 */
const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ pick: [id: string]; expand: [] }>()
const route = useRoute()

/** The group of the page that is open: marked, wherever the panel is. */
const current = computed(() => groupForPath(route.path))
const top = computed(() => railGroups.value.filter((g) => g.id !== 'settings'))
const foot = computed(() => railGroups.value.filter((g) => g.id === 'settings'))

const shown = (g: RailGroup) => !props.collapsed && g.id === shownGroup.value
function name(g: RailGroup) {
  const sum = badgeSum(g.nodes)
  return sum ? `${g.label}, ${t('nav.attention', { n: sum })}` : g.label
}
</script>

<template>
  <div class="rail">
    <RouterLink to="/" class="brand" :aria-label="brandName()" :title="brandName()">
      <img v-if="settings.brand.logo" :src="settings.brand.logo" alt="" class="logo-img" />
      <span v-else class="logo" aria-hidden="true">{{ brandName().slice(0, 1) }}</span>
    </RouterLink>
    <div class="groups">
      <template v-for="(list, i) in [top, foot]" :key="i">
        <div v-if="i === 1" class="spacer" />
        <button
          v-for="g in list"
          :key="g.id"
          type="button"
          class="rail-btn"
          :class="{ shown: shown(g), current: g.id === current }"
          :aria-label="name(g)"
          :aria-pressed="shown(g)"
          aria-controls="nav-panel"
          data-nav
          @click="emit('pick', g.id)"
        >
          <span class="rail-icon"><component :is="g.icon" :size="20" aria-hidden="true" /></span>
          <span class="rail-label" aria-hidden="true">{{ g.label }}</span>
          <span v-if="badgeSum(g.nodes)" class="dot" aria-hidden="true">{{ badgeSum(g.nodes) }}</span>
        </button>
      </template>
    </div>
    <div class="foot">
      <button
        v-if="collapsed"
        type="button"
        class="icon-btn"
        :aria-label="t('nav.expand')"
        :title="`${t('nav.expand')} ( [ )`"
        @click="emit('expand')"
      >
        <PanelLeftOpen :size="18" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="icon-btn"
        :aria-label="t('palette.title')"
        :title="`${t('palette.title')} (${modKey()} K)`"
        @click="openPalette"
      >
        <Search :size="19" aria-hidden="true" />
      </button>
      <AccountMenu />
    </div>
  </div>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 4.5rem;
  height: 100%;
  padding: 0.75rem 0;
  background: var(--surface-2);
  border-right: 1px solid var(--border);
}
.brand {
  display: inline-flex;
  margin-bottom: 0.75rem;
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
  font-size: 1rem;
}
.logo-img {
  width: 2.5rem;
  height: 2.5rem;
  object-fit: contain;
}
.groups {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 0 0.35rem;
  overflow-y: auto;
}
.spacer {
  flex: 1;
}
.rail-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  width: 100%;
  padding: 0.4rem 0.1rem 0.35rem;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  cursor: pointer;
}
.rail-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 1.9rem;
  border-radius: 8px;
}
/* Group names are the site's own, often Thai: two lines at most. */
.rail-label {
  max-width: 100%;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 0.68rem;
  line-height: 1.2;
  text-align: center;
  overflow-wrap: anywhere;
}
.rail-btn:hover {
  color: var(--text);
}
.rail-btn:hover .rail-icon {
  background: var(--border);
}
.rail-btn.shown {
  color: var(--accent-ink);
  font-weight: 600;
}
.rail-btn.shown .rail-icon {
  background: var(--accent-soft);
}
/* The page's group, when the panel shows another. */
.rail-btn.current::before {
  content: "";
  position: absolute;
  left: -0.35rem;
  top: 0.65rem;
  width: 3px;
  height: 1.25rem;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.dot {
  position: absolute;
  top: 0.15rem;
  right: 0.45rem;
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
  font-variant-numeric: tabular-nums;
}
.foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: 3.25rem;
  margin-top: 0.5rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border);
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--border);
  color: var(--text);
}
</style>
