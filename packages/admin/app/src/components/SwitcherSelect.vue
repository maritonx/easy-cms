<script setup lang="ts">
import type { Label } from '@easy-cms/core'
import { computed, onMounted, ref } from 'vue'
import { api } from '../lib/api'
import { label } from '../lib/i18n'
import { session } from '../lib/session'

/**
 * The choice that applies to the whole admin (`admin.switcher`), e.g. the tenant. Kept in a
 * cookie, so every request of the admin (plugins' included) sends it; changing it reloads.
 */

interface Choices {
  options: { value: string; label: string }[]
  /** Offer "all of them" (value `*`). */
  all?: Label
}

const ALL = '*'
const switcher = computed(() => session.schema?.switcher ?? null)
const choices = ref<Choices | null>(null)

function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

const current = computed(() => {
  const list = choices.value
  if (!list || !switcher.value) return ''
  const saved = readCookie(switcher.value.cookie)
  if (saved && list.options.some((o) => o.value === saved)) return saved
  // As the server does: "all" for those offered it, otherwise the first choice.
  return list.all ? ALL : (list.options[0]?.value ?? '')
})

/** Shown when there is something to choose between. */
const shown = computed(() => {
  const list = choices.value
  return !!list && (list.options.length > 1 || (!!list.all && list.options.length > 0))
})

onMounted(async () => {
  if (!switcher.value) return
  try {
    choices.value = await api<Choices>('GET', switcher.value.options)
  } catch {
    choices.value = null
  }
})

function choose(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!switcher.value || value === current.value) return
  // biome-ignore lint/suspicious/noDocumentCookie: a plain cookie the server reads; no Cookie Store API in all browsers
  document.cookie = `${switcher.value.cookie}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  // Everything shown so far belongs to the old choice.
  window.location.reload()
}
</script>

<template>
  <label v-if="switcher && shown && choices" class="switcher">
    <span class="switcher-label">{{ label(switcher.label, '') }}</span>
    <select class="input" :value="current" @change="choose">
      <option v-if="choices.all" :value="ALL">{{ label(choices.all, ALL) }}</option>
      <option v-for="option in choices.options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.switcher {
  display: grid;
  gap: 0.3rem;
  margin: 0 0 0.75rem;
}
.switcher-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.switcher select {
  width: 100%;
}
</style>
