<script setup lang="ts">
import { Languages, LogOut, Monitor, Moon, Sun, UserRound } from '@lucide/vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { locale, setLocale, t } from '../lib/i18n'
import { logOutAndLeave, session } from '../lib/session'
import { initials, setTheme, type ThemeMode, themeMode } from '../lib/theme'

/** The avatar at the foot of the rail: theme, interface language, account and logging out. */
const router = useRouter()
const route = useRoute()
const open = ref(false)
const root = ref<HTMLElement>()
const button = ref<HTMLButtonElement>()

const themes: {
  mode: ThemeMode
  icon: typeof Sun
  key: 'theme.light' | 'theme.dark' | 'theme.system'
}[] = [
  { mode: 'light', icon: Sun, key: 'theme.light' },
  { mode: 'dark', icon: Moon, key: 'theme.dark' },
  { mode: 'system', icon: Monitor, key: 'theme.system' },
]

function onDocument(event: Event) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  open.value = false
  button.value?.focus()
}
watch(open, (value) => {
  if (value) {
    document.addEventListener('pointerdown', onDocument)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('pointerdown', onDocument)
    document.removeEventListener('keydown', onKey)
  }
})
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)
onBeforeUnmount(() => {
  open.value = false
})
</script>

<template>
  <div ref="root" class="account-menu">
    <button
      ref="button"
      type="button"
      class="avatar"
      :aria-label="t('nav.account')"
      :title="session.user?.email"
      :aria-expanded="open"
      aria-controls="account-menu"
      @click="open = !open"
    >
      {{ initials(session.user?.email) }}
    </button>
    <div v-if="open" id="account-menu" class="pop" role="group" :aria-label="t('nav.account')">
      <div class="who">{{ session.user?.email }}</div>
      <div class="row">
        <span>{{ t('theme.label') }}</span>
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
      </div>
      <!-- The admin's interface language; content languages are chosen on each document. -->
      <button
        type="button"
        class="pop-item"
        :title="t('account.language')"
        @click="setLocale(locale === 'th' ? 'en' : 'th')"
      >
        <Languages :size="17" aria-hidden="true" />
        {{ t('nav.language') }}
      </button>
      <RouterLink to="/account" class="pop-item" active-class="active">
        <UserRound :size="17" aria-hidden="true" />
        {{ t('nav.account') }}
      </RouterLink>
      <button type="button" class="pop-item" @click="logOutAndLeave(router)">
        <LogOut :size="17" aria-hidden="true" />
        {{ t('nav.logout') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.account-menu {
  position: relative;
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 0;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.avatar:hover,
.avatar[aria-expanded="true"] {
  box-shadow: 0 0 0 2px var(--border-strong);
}
.pop {
  position: absolute;
  left: calc(100% + 0.75rem);
  bottom: 0;
  z-index: 60;
  width: 15rem;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.who {
  padding: 0.45rem 0.6rem 0.6rem;
  margin-bottom: 0.25rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.25rem 0.6rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}
.pop-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.25rem;
  padding: 0 0.6rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.pop-item:hover,
.pop-item.active {
  background: var(--surface-2);
  color: var(--text);
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
</style>
