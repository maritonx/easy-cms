<script setup lang="ts">
import type { Label } from '@easy-cms/core'
import { ref, watch } from 'vue'
import { ApiError, api } from '../lib/api'
import { label, t } from '../lib/i18n'
import { notify } from '../lib/toast'

/**
 * Settings → Integrations, AI (#357): the main connection, each feature's switch and connection,
 * the daily limit, and this month's usage.
 */

interface AdminAi {
  main: string | null
  perUserPerDay: number
  defaultPerUserPerDay: number
  connections: { id: string; integration: string; name: string; label: Label }[]
  features: {
    id: string
    label: Label
    description?: Label
    enabled: boolean
    connection: string | null
  }[]
  usage: {
    byUser: { user: string; requests: number; input: number; output: number }[]
    byFeature: { feature: string; requests: number; input: number; output: number }[]
  }
}

/** Changes when the page reloads its connections. */
const props = defineProps<{ version: number }>()
/** After a change, for the page's summary row. */
const emit = defineEmits<{ changed: [] }>()

const data = ref<AdminAi | null>(null)
const limit = ref('')
const limitError = ref('')

async function load() {
  try {
    data.value = await api<AdminAi>('GET', '/admin/ai')
    limit.value = String(data.value.perUserPerDay)
  } catch {
    // Without an AI plugin there is nothing to show.
    data.value = null
  }
}
watch(() => props.version, load, { immediate: true })

async function save(change: Record<string, unknown>, message: string) {
  try {
    data.value = await api<AdminAi>('PUT', '/admin/ai', change)
    limit.value = String(data.value.perUserPerDay)
    notify('success', message)
    emit('changed')
    return true
  } catch (e) {
    notify('error', (e as Error).message)
    return false
  }
}
async function saveLimit() {
  limitError.value = ''
  const value = Number(limit.value)
  if (!Number.isInteger(value) || value < 0) {
    limitError.value = t('ai.limitInvalid')
    return
  }
  try {
    data.value = await api<AdminAi>('PUT', '/admin/ai', { perUserPerDay: value })
    notify('success', t('ai.saved'))
    emit('changed')
  } catch (e) {
    limitError.value =
      e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : (e as Error).message
  }
}

const connectionLabel = (c: AdminAi['connections'][number]) => {
  const provider = label(c.label, c.integration)
  return c.name === provider ? provider : `${provider} · ${c.name}`
}
const featureLabel = (id: string) => {
  if (id === 'test') return t('ai.testFeature')
  const feature = data.value?.features.find((f) => f.id === id)
  return feature ? label(feature.label, id) : id
}
const number = (n: number) => n.toLocaleString()
</script>

<template>
  <div v-if="data" class="ai">
    <p class="muted small">{{ t('ai.privacy') }}</p>

    <p v-if="data.connections.length === 0" class="notice">{{ t('ai.noConnection') }}</p>
    <div v-else class="row">
      <label class="field">
        <span class="field-label">{{ t('ai.main') }}</span>
        <select
          class="input"
          :value="data.main ?? ''"
          @change="save({ main: ($event.target as HTMLSelectElement).value || null }, t('ai.saved'))"
        >
          <option value="">{{ t('ai.first') }}</option>
          <option v-for="c in data.connections" :key="c.id" :value="c.id">{{ connectionLabel(c) }}</option>
        </select>
      </label>
      <form class="field limit" novalidate @submit.prevent="saveLimit">
        <label class="field-label" for="ai-limit">{{ t('ai.limit') }}</label>
        <span class="inline">
          <input id="ai-limit" v-model="limit" class="input" type="number" min="0" step="1" inputmode="numeric" />
          <button type="submit" class="btn btn-sm">{{ t('integrations.save') }}</button>
        </span>
        <span class="field-hint">{{ t('ai.limitHint', { count: data.defaultPerUserPerDay }) }}</span>
        <span v-if="limitError" class="field-error" role="alert">{{ limitError }}</span>
      </form>
    </div>

    <h3>{{ t('ai.features') }}</h3>
    <p v-if="data.features.length === 0" class="muted small">{{ t('ai.noFeatures') }}</p>
    <ul v-else class="features">
      <li v-for="feature in data.features" :key="feature.id" class="feature">
        <div class="what">
          <strong>{{ label(feature.label, feature.id) }}</strong>
          <span v-if="feature.description" class="muted small">{{ label(feature.description, '') }}</span>
        </div>
        <select
          class="input"
          :aria-label="t('ai.connectionFor', { name: label(feature.label, feature.id) })"
          :value="feature.connection ?? ''"
          :disabled="!feature.enabled"
          @change="save({ features: { [feature.id]: { connection: ($event.target as HTMLSelectElement).value || null } } }, t('ai.saved'))"
        >
          <option value="">{{ t('ai.useMain') }}</option>
          <option v-for="c in data.connections" :key="c.id" :value="c.id">{{ connectionLabel(c) }}</option>
        </select>
        <label class="switch">
          <input
            type="checkbox"
            role="switch"
            :checked="feature.enabled"
            :aria-label="t('ai.turnOn', { name: label(feature.label, feature.id) })"
            @change="save({ features: { [feature.id]: { enabled: !feature.enabled } } }, t(feature.enabled ? 'ai.featureOff' : 'ai.featureOn', { name: label(feature.label, feature.id) }))"
          />
          <span>{{ t(feature.enabled ? 'integrations.on' : 'integrations.off') }}</span>
        </label>
      </li>
    </ul>

    <h3>{{ t('ai.thisMonth') }}</h3>
    <p v-if="data.usage.byUser.length === 0 && data.usage.byFeature.length === 0" class="muted small">{{ t('ai.noUsage') }}</p>
    <div v-else class="usage">
      <table v-if="data.usage.byUser.length">
        <caption>{{ t('ai.byUser') }}</caption>
        <thead><tr><th scope="col">{{ t('ai.user') }}</th><th scope="col">{{ t('ai.requests') }}</th><th scope="col">{{ t('ai.tokens') }}</th></tr></thead>
        <tbody>
          <tr v-for="row in data.usage.byUser" :key="row.user"><td>{{ row.user }}</td><td>{{ number(row.requests) }}</td><td>{{ number(row.input + row.output) }}</td></tr>
        </tbody>
      </table>
      <table v-if="data.usage.byFeature.length">
        <caption>{{ t('ai.byFeature') }}</caption>
        <thead><tr><th scope="col">{{ t('ai.feature') }}</th><th scope="col">{{ t('ai.requests') }}</th><th scope="col">{{ t('ai.tokens') }}</th></tr></thead>
        <tbody>
          <tr v-for="row in data.usage.byFeature" :key="row.feature"><td>{{ featureLabel(row.feature) }}</td><td>{{ number(row.requests) }}</td><td>{{ number(row.input + row.output) }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ai {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.ai h3 {
  margin: 0.5rem 0 0;
  font-size: 0.95rem;
}
.ai p {
  margin: 0;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.row .field {
  flex: 1 1 16rem;
}
.inline {
  display: flex;
  gap: 0.4rem;
}
.inline .input {
  max-width: 8rem;
}
.features {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* In the drawer: name and switch, then the connection. */
.feature {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0;
  border-top: 1px solid var(--border);
}
.what {
  display: flex;
  flex-direction: column;
}
.usage {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}
.usage table {
  border-collapse: collapse;
  font-size: 0.875rem;
}
.usage caption {
  text-align: left;
  font-weight: 600;
  padding-bottom: 0.25rem;
}
.usage th,
.usage td {
  padding: 0.25rem 0.75rem 0.25rem 0;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.feature select {
  grid-column: 1 / -1;
  grid-row: 2;
}
</style>
