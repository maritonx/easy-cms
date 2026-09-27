<script setup lang="ts">
import { Globe } from '@lucide/vue'
import { contentLocale, localeName } from '../lib/content-locale'
import { t } from '../lib/i18n'
import { session } from '../lib/session'

/** Locales the document still needs translating into: marked with a dot. */
defineProps<{ missing?: readonly string[] | undefined }>()
const emit = defineEmits<{ change: [locale: string] }>()
</script>

<template>
  <div v-if="session.schema?.localization" class="switcher">
  <span class="switcher-label" aria-hidden="true">{{ t('locale.label') }}</span>
  <div class="locales" role="group" :aria-label="t('locale.label')">
    <button
      v-for="code in session.schema.localization.locales"
      :key="code"
      type="button"
      :class="['locale', { active: code === contentLocale() }]"
      :aria-pressed="code === contentLocale()"
      :lang="code"
      @click="code !== contentLocale() && emit('change', code)"
    >
      <Globe v-if="code === contentLocale()" :size="14" aria-hidden="true" />
      {{ localeName(code) }}
      <template v-if="missing?.includes(code)">
        <span class="missing" aria-hidden="true" />
        <span class="visually-hidden">({{ t('locale.missing') }})</span>
      </template>
    </button>
  </div>
  </div>
</template>

<style scoped>
.switcher {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.switcher-label {
  color: var(--faint);
  font-size: 0.85rem;
  white-space: nowrap;
}
@media (max-width: 640px) {
  .switcher-label {
    display: none;
  }
}
.missing {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--warning-text);
}
.locales {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: var(--surface-2);
}
.locale {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.95rem;
  padding: 0 0.7rem;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.locale:hover {
  color: var(--text);
}
.locale.active {
  background: var(--surface);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}
</style>
