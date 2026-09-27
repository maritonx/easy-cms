<script setup lang="ts">
import { contentLocale, localeName } from '../lib/content-locale'
import { t } from '../lib/i18n'
import { session } from '../lib/session'

const emit = defineEmits<{ change: [locale: string] }>()
</script>

<template>
  <div v-if="session.schema?.localization" class="locales" role="group" :aria-label="t('locale.label')">
    <button
      v-for="code in session.schema.localization.locales"
      :key="code"
      type="button"
      :class="['locale', { active: code === contentLocale() }]"
      :aria-pressed="code === contentLocale()"
      :lang="code"
      @click="code !== contentLocale() && emit('change', code)"
    >
      {{ localeName(code) }}
    </button>
  </div>
</template>

<style scoped>
.locales {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
}
.locale {
  padding: 0.25rem 0.75rem;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--muted, inherit);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.locale.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}
</style>
