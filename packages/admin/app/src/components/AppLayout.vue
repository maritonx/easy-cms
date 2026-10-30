<script setup lang="ts">
import { Menu, Search } from '@lucide/vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { refreshCounts } from '../lib/counts'
import { t } from '../lib/i18n'
import { groupForPath, navState, shownGroup } from '../lib/nav'
import { settings } from '../lib/settings'
import { installShortcuts, openPalette } from '../lib/shortcuts'
import { brandName } from '../lib/theme'
import CommandPalette from './CommandPalette.vue'
import NavPanel from './NavPanel.vue'
import RailMenu from './RailMenu.vue'
import ShortcutsHelp from './ShortcutsHelp.vue'

const router = useRouter()
const route = useRoute()
installShortcuts(router)

/** The panel folds away on wide screens (`[` or its button), leaving the rail. */
const wide = ref(window.matchMedia('(min-width: 1024px)').matches)
window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => {
  wide.value = e.matches
})
const rail = computed(() => navState.rail && wide.value)

/** An icon of the rail shows its group in the panel, unfolding it; the page stays. */
function showGroup(id: string) {
  shownGroup.value = id
  if (rail.value) navState.rail = false
}

/** Small screens: the menu opens over the page. */
const menuOpen = ref(false)
const main = ref<HTMLElement>()
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    // Creating or deleting changes the counts next to the menu items.
    void refreshCounts()
  },
)
// The panel follows the page to its group; pages not in the menu leave it as it is.
watch(
  () => route.path,
  (path) => {
    const group = groupForPath(path)
    if (group) shownGroup.value = group
  },
  { immediate: true },
)
// A new page: focus moves to its heading, so screen readers start there.
watch(
  () => route.path,
  async () => {
    await nextTick()
    setTimeout(() => {
      const heading = main.value?.querySelector<HTMLElement>('h1')
      if (!heading || main.value?.contains(document.activeElement)) return
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }, 0)
  },
)
onMounted(() => void refreshCounts(true))

/** Arrow keys move through a column of the menu. */
function onMenuKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (!target.matches('[data-nav]')) return
  const items = [
    ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-nav]'),
  ].filter((el) => el.offsetParent !== null)
  const at = items.indexOf(target)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  } else if (event.key === 'Home') {
    event.preventDefault()
    items[0]?.focus()
  } else if (event.key === 'End') {
    event.preventDefault()
    items.at(-1)?.focus()
  }
}
</script>

<template>
  <a class="skip-link" href="#main">{{ t('nav.skip') }}</a>
  <div class="layout" :class="{ 'menu-open': menuOpen, rail }">
    <header class="topbar">
      <button
        type="button"
        class="btn btn-ghost btn-icon"
        :aria-label="t('nav.menu')"
        :aria-expanded="menuOpen"
        @click="menuOpen = true"
      >
        <Menu :size="20" aria-hidden="true" />
      </button>
      <RouterLink to="/" class="brand compact">
        <img v-if="settings.brand.logo" :src="settings.brand.logo" alt="" class="logo-img" />
        <span v-else class="logo" aria-hidden="true">{{ brandName().slice(0, 1) }}</span>
        {{ brandName() }}
      </RouterLink>
      <button type="button" class="btn btn-ghost btn-icon topbar-search" :aria-label="t('palette.title')" @click="openPalette">
        <Search :size="20" aria-hidden="true" />
      </button>
    </header>
    <div v-if="menuOpen" class="backdrop" aria-hidden="true" @click="menuOpen = false" />

    <nav class="sidebar" :aria-label="t('nav.main')">
      <RailMenu :collapsed="rail" @pick="showGroup" @expand="navState.rail = false" @keydown="onMenuKey" />
      <NavPanel
        v-show="!rail"
        id="nav-panel"
        :collapsible="wide"
        @collapse="navState.rail = true"
        @close="menuOpen = false"
        @keydown="onMenuKey"
      />
    </nav>
    <main id="main" ref="main" class="content" tabindex="-1">
      <!-- Keyed by path: query changes (filters, an open drawer) keep the page. -->
      <RouterView :key="$route.path" />
    </main>
  </div>
  <CommandPalette />
  <ShortcutsHelp />
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 100vh;
}
.skip-link {
  position: absolute;
  left: 0.75rem;
  top: -4rem;
  z-index: 200;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
  text-decoration: none;
}
.skip-link:focus {
  top: 0.75rem;
}
.content:focus {
  outline: none;
}
.topbar-search {
  margin-left: auto;
}
.topbar,
.backdrop {
  display: none;
}
/* Two columns: the rail of groups, and the panel of the group it shows. */
.sidebar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  height: 100vh;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  padding: 0.25rem 0.4rem;
  font-weight: 600;
  font-size: 1rem;
  color: var(--text);
  text-decoration: none;
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
  font-size: 0.95rem;
}
.logo-img {
  width: auto;
  max-width: 8rem;
  height: 2rem;
  object-fit: contain;
}
.content {
  /* Pages that span the width (edit header, save bar) offset these paddings. */
  --page-x: 2.75rem;
  --page-top: 2rem;
  --page-bottom: 4rem;
  padding: var(--page-top) var(--page-x) var(--page-bottom);
  width: 100%;
  min-width: 0;
}

/* Small screens: a top bar, and both columns slide over the page. */
@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    /* The top bar keeps its height; the page takes the rest. */
    grid-template-rows: auto minmax(0, 1fr);
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .brand.compact .logo,
  .brand.compact .logo-img {
    height: 1.75rem;
  }
  .brand.compact .logo {
    width: 1.75rem;
  }
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 40;
    max-width: 92vw;
    transform: translateX(-100%);
    /* Hidden while closed, so Tab doesn't walk into it. */
    visibility: hidden;
    transition:
      transform 0.2s ease,
      visibility 0.2s;
    box-shadow: var(--shadow);
  }
  .menu-open .sidebar {
    transform: none;
    visibility: visible;
  }
  .menu-open .backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgb(0 0 0 / 40%);
  }
  .content {
    --page-x: 1rem;
    --page-top: 1.25rem;
    --page-bottom: 3rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sidebar {
    transition: none;
  }
}
</style>
