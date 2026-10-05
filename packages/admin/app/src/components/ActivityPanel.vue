<script setup lang="ts">
import type { AuditEntry, AuditPage } from '@easy-cms/core'
import { ref, watch } from 'vue'
import { api } from '../lib/api'
import { actionLabel, viaLabel } from '../lib/audit'
import { formatDate, t } from '../lib/i18n'

/** A document's (or global's) latest entries in the audit log, for those who may see it. */
const props = defineProps<{
  /** A collection slug or `global:<slug>`. */
  target: string
  doc?: string | undefined
  /** Changes after every save, so the list reloads. */
  reloadKey: number
}>()
const entries = ref<AuditEntry[] | null>(null)

async function load() {
  const params = new URLSearchParams({ target: props.target })
  if (props.doc) params.set('doc', props.doc)
  entries.value =
    (await api<AuditPage>('GET', `/admin/audit?${params}`).catch(() => null))?.docs.slice(0, 8) ??
    null
}
watch(() => [props.target, props.doc, props.reloadKey], load, { immediate: true })

const all = () => ({
  path: '/audit',
  query: { target: props.target, ...(props.doc ? { doc: props.doc } : {}) },
})
const fields = (entry: AuditEntry) => (entry.changes ?? []).map((c) => c.field).join(', ')
</script>

<template>
  <section v-if="entries" class="card side-card activity" :aria-label="t('audit.activity')">
    <h2>{{ t('audit.activity') }}</h2>
    <p v-if="!entries.length" class="muted small">{{ t('audit.none') }}</p>
    <ol v-else>
      <li v-for="entry in entries" :key="String(entry.id)">
        <span class="line">
          <strong>{{ actionLabel(entry.action) }}</strong>
          <span class="muted">{{ entry.actor.email ?? viaLabel(entry.actor.via) }}</span>
        </span>
        <span class="muted small">
          {{ formatDate(entry.at) }}<template v-if="fields(entry)"> · {{ fields(entry) }}</template>
        </span>
      </li>
    </ol>
    <RouterLink :to="all()" class="small">{{ t('audit.seeAll') }}</RouterLink>
  </section>
</template>

<style scoped>
.activity h2 {
  margin: 0 0 0.6rem;
  font-size: 0.9rem;
  font-weight: 600;
}
.activity ol {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
}
.activity li {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  overflow-wrap: anywhere;
}
.line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.small {
  font-size: 0.78rem;
}
</style>
