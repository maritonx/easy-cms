<script setup lang="ts">
import { Languages, LayoutDashboard, LogOut, Menu, Monitor, Moon, Sun, X } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { counts, refreshCounts } from '../lib/counts'
import { label, locale, setLocale, t } from '../lib/i18n'
import { collectionIcon, globalIcon } from '../lib/icons'
import { menuOrder } from '../lib/menu'
import { logout, session } from '../lib/session'
import { settings } from '../lib/settings'
import { brandName, initials, setTheme, type ThemeMode, themeMode } from '../lib/theme'

const router = useRouter()
const route = useRoute()
const readable = computed(() =>
  menuOrder(
    session.schema?.collections.filter((c) => c.permissions.read) ?? [],
    session.schema?.menu,
  ),
)
/** Listed under Settings rather than Content. */
const SETTINGS = ['users', 'api-keys']
const collections = computed(() => readable.value.filter((c) => !SETTINGS.includes(c.slug)))
const settingsCollections = computed(() =>
  SETTINGS.flatMap((slug) => readable.value.filter((c) => c.slug === slug)),
)
const globals = computed(() => session.schema?.globals.filter((g) => g.permissions.read) ?? [])

/** Small screens: the menu opens over the page. */
const menuOpen = ref(false)
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    // Creating or deleting changes the counts next to the menu items.
    void refreshCounts()
  },
)
onMounted(() => void refreshCounts(true))

const themes: {
  mode: ThemeMode
  icon: typeof Sun
  key: 'theme.light' | 'theme.dark' | 'theme.system'
}[] = [
  { mode: 'light', icon: Sun, key: 'theme.light' },
  { mode: 'dark', icon: Moon, key: 'theme.dark' },
  { mode: 'system', icon: Monitor, key: 'theme.system' },
]

async function onLogout() {
  await logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="layout" :class="{ 'menu-open': menuOpen }">
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
    </header>
    <div v-if="menuOpen" class="backdrop" aria-hidden="true" @click="menuOpen = false" />

    <nav class="sidebar" aria-label="Main">
      <div class="sidebar-top">
        <RouterLink to="/" class="brand">
          <img v-if="settings.brand.logo" :src="settings.brand.logo" alt="" class="logo-img" />
          <span v-else class="logo" aria-hidden="true">{{ brandName().slice(0, 1) }}</span>
          <span class="brand-text">
            <span class="brand-name">{{ brandName() }}</span>
            <span class="brand-sub">{{ t('app.subtitle') }}</span>
          </span>
        </RouterLink>
        <button
          type="button"
          class="btn btn-ghost btn-icon close"
          :aria-label="t('nav.close')"
          @click="menuOpen = false"
        >
          <X :size="18" aria-hidden="true" />
        </button>
      </div>

      <RouterLink to="/" class="nav-link" exact-active-class="active">
        <LayoutDashboard :size="18" aria-hidden="true" />
        <span>{{ t('nav.dashboard') }}</span>
      </RouterLink>

      <template v-if="collections.length">
        <h2 class="nav-heading">{{ t('nav.collections') }}</h2>
        <RouterLink
          v-for="c in collections"
          :key="c.slug"
          :to="`/collections/${c.slug}`"
          class="nav-link"
          active-class="active"
        >
          <component :is="collectionIcon(c.icon)" :size="18" aria-hidden="true" />
          <span>{{ label(c.labels?.plural, c.slug) }}</span>
          <span v-if="counts[c.slug] !== undefined" class="nav-count" aria-hidden="true">{{ counts[c.slug] }}</span>
        </RouterLink>
      </template>

      <template v-if="globals.length || settingsCollections.length">
        <h2 class="nav-heading">{{ t('nav.globals') }}</h2>
        <RouterLink
          v-for="g in globals"
          :key="g.slug"
          :to="`/globals/${g.slug}`"
          class="nav-link"
          active-class="active"
        >
          <component :is="globalIcon(g.icon)" :size="18" aria-hidden="true" />
          <span>{{ label(g.label, g.slug) }}</span>
        </RouterLink>
        <RouterLink
          v-for="c in settingsCollections"
          :key="c.slug"
          :to="`/collections/${c.slug}`"
          class="nav-link"
          active-class="active"
        >
          <component :is="collectionIcon(c.icon)" :size="18" aria-hidden="true" />
          <span>{{ label(c.labels?.plural, c.slug) }}</span>
          <span v-if="counts[c.slug] !== undefined" class="nav-count" aria-hidden="true">{{ counts[c.slug] }}</span>
        </RouterLink>
      </template>

      <div class="sidebar-footer">
        <div class="footer-tools">
          <div class="segmented" role="group" :aria-label="t('theme.label')">
            <button
              v-for="option in themes"
              :key="option.mode"
              type="button"
              :class="{ on: themeMode === option.mode }"
              :aria-pressed="themeMode === option.mode"
              :aria-label="t(option.key)"
              :title="t(option.key)"
              @click="setTheme(option.mode)"
            >
              <component :is="option.icon" :size="15" aria-hidden="true" />
            </button>
          </div>
          <!-- The admin's interface language; content languages are chosen on each document. -->
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :title="t('account.language')"
            @click="setLocale(locale === 'th' ? 'en' : 'th')"
          >
            <Languages :size="15" aria-hidden="true" />
            {{ t('nav.language') }}
          </button>
        </div>
        <div class="account">
          <RouterLink to="/account" class="account-link" active-class="active">
            <span class="avatar" aria-hidden="true">{{ initials(session.user?.email) }}</span>
            <span class="account-text">
              <span class="account-title">{{ t('nav.account') }}</span>
              <span class="account-email">{{ session.user?.email }}</span>
            </span>
          </RouterLink>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="t('nav.logout')"
            :title="t('nav.logout')"
            @click="onLogout"
          >
            <LogOut :size="17" aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
    <main class="content">
      <!-- Keyed by path: query changes (filters, an open drawer) keep the page. -->
      <RouterView :key="$route.path" />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 17.75rem minmax(0, 1fr);
  min-height: 100vh;
}
.topbar,
.close,
.backdrop {
  display: none;
}
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.9rem 0.75rem;
  background: var(--surface);
  border-right: 1px solid var(--border);
}
.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.75rem;
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
.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.brand-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brand-sub {
  color: var(--faint);
  font-size: 0.8rem;
  font-weight: 400;
}
.nav-count {
  margin-left: auto;
  color: var(--faint);
  font-size: 0.8rem;
  font-weight: 500;
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
.nav-heading {
  margin: 1.15rem 0 0.35rem;
  padding: 0 0.7rem;
  font-size: 0.8rem;
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
.nav-link span {
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
}
.sidebar-footer {
  margin-top: auto;
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.footer-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.25rem;
}
.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: var(--surface-2);
}
.segmented button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 1.75rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--faint);
  cursor: pointer;
}
.segmented button:hover {
  color: var(--text);
}
.segmented button.on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}
.account {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border);
}
.account-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-grow: 1;
  min-width: 0;
  padding: 0.35rem 0.4rem;
  border-radius: var(--radius-sm);
  color: var(--text);
  text-decoration: none;
}
.account-link:hover,
.account-link.active {
  background: var(--surface-2);
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 0.78rem;
  font-weight: 600;
}
.account-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.account-title {
  font-size: 0.875rem;
  font-weight: 500;
}
.account-email {
  font-size: 0.78rem;
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* Small screens: a top bar, and the menu slides over the page. */
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
    width: min(18rem, 85vw);
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
  .close {
    display: inline-flex;
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
