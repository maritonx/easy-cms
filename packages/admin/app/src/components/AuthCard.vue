<script setup lang="ts">
import { Languages } from '@lucide/vue'
import { locale, setLocale, t } from '../lib/i18n'
import { settings } from '../lib/settings'
import { brandName } from '../lib/theme'

defineProps<{ title: string }>()
</script>

<template>
  <main class="auth">
    <div class="card auth-card">
      <div class="auth-brand">
        <img v-if="settings.brand.logo" :src="settings.brand.logo" :alt="brandName()" class="logo-img" />
        <template v-else>
          <span class="logo" aria-hidden="true">{{ brandName().slice(0, 1) }}</span>{{ brandName() }}
        </template>
      </div>
      <h1>{{ title }}</h1>
      <slot />
    </div>
    <button type="button" class="btn btn-ghost btn-sm" @click="setLocale(locale === 'th' ? 'en' : 'th')">
      <Languages :size="15" aria-hidden="true" />
      {{ t('nav.language') }}
    </button>
  </main>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
}
.auth-card {
  width: 100%;
  max-width: 25rem;
  padding: 2.25rem;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.auth-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 600;
  color: var(--text);
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
}
.logo-img {
  max-width: 10rem;
  height: 2.5rem;
  object-fit: contain;
}
</style>
