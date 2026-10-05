<script setup lang="ts">
import type { AdminDeliveries, AdminDelivery, DeliveryKind, DeliveryState } from '@easy-cms/core'
import { ChevronLeft, ChevronRight, RotateCw, Trash2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { ApiError, api } from '../lib/api'
import { formatDate, locale, t } from '../lib/i18n'
import { session } from '../lib/session'
import { notify } from '../lib/toast'

/** Saved webhook deliveries and emails (admins): what failed or waits, retry now, delete. */
const route = useRoute()
const router = useRouter()
const available = session.schema?.deliveries
const kinds = computed(() => (['webhook', 'email'] as const).filter((k) => available?.[k]))
const kind = computed<DeliveryKind>(() => {
  const k = route.query.kind === 'email' ? 'email' : 'webhook'
  return kinds.value.includes(k) ? k : (kinds.value[0] ?? 'webhook')
})
const state = computed<DeliveryState>(() =>
  route.query.state === 'pending' ? 'pending' : 'failed',
)
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

const list = ref<AdminDeliveries | null>(null)
const loading = ref(false)
const busy = ref<string | null>(null)
const confirmingAll = ref(false)

async function load() {
  if (!kinds.value.length) return
  loading.value = true
  try {
    list.value = await api<AdminDeliveries>(
      'GET',
      `/admin/deliveries?kind=${kind.value}&state=${state.value}&page=${page.value}`,
    )
  } catch (e) {
    notify('error', e instanceof ApiError ? e.message : String(e))
  } finally {
    loading.value = false
  }
}
watch([kind, state, page], load, { immediate: true })

function setQuery(next: Record<string, string | undefined>) {
  void router.replace({ query: { ...route.query, page: undefined, ...next } })
}

async function retry(item: AdminDelivery) {
  busy.value = `retry-${item.id}`
  try {
    const result = await api<{ ok: boolean; error?: string }>(
      'POST',
      `/admin/deliveries/${kind.value}/${item.id}/retry`,
    )
    if (result.ok) notify('success', t('deliveries.sent'))
    else notify('error', t('deliveries.stillFailing', { error: result.error ?? '' }))
    await load()
  } finally {
    busy.value = null
  }
}
async function remove(item: AdminDelivery) {
  busy.value = `delete-${item.id}`
  try {
    await api('DELETE', `/admin/deliveries/${kind.value}/${item.id}`)
    notify('success', t('deliveries.deleted', { count: 1 }))
    await load()
  } finally {
    busy.value = null
  }
}
async function retryAll() {
  busy.value = 'retry-all'
  try {
    const { sent, failed } = await api<{ sent: number; failed: number }>(
      'POST',
      `/admin/deliveries/${kind.value}/retry`,
    )
    notify(failed ? 'error' : 'success', t('deliveries.retriedAll', { sent, failed }))
    await load()
  } finally {
    busy.value = null
  }
}
async function removeAll() {
  confirmingAll.value = false
  busy.value = 'delete-all'
  try {
    const { deleted } = await api<{ deleted: number }>('DELETE', `/admin/deliveries/${kind.value}`)
    notify('success', t('deliveries.deleted', { count: deleted }))
    await load()
  } finally {
    busy.value = null
  }
}

const target = (item: AdminDelivery) =>
  item.kind !== 'webhook'
    ? ''
    : item.global
      ? item.global
      : item.collection
        ? `${item.collection}${item.doc !== undefined ? ` #${item.doc}` : ''}`
        : ''
const pretty = (body: string) => {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}
const docs = computed(
  () =>
    `https://maritonx.github.io/easy-cms${locale.value === 'th' ? '/th' : ''}/guide/health-checks#${kind.value === 'webhook' ? 'failed-webhooks' : 'emails-not-sent'}`,
)
</script>

<template>
  <p v-if="!session.schema?.views.deliveries || !kinds.length" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <nav class="crumbs" :aria-label="t('list.breadcrumb')">
      <span>{{ t('nav.globals') }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
      <span class="current">{{ t('deliveries.title') }}</span>
    </nav>
    <header class="page-header">
      <h1>{{ t('deliveries.title') }}</h1>
      <p class="muted">
        {{ t('deliveries.lead') }}
        <a :href="docs" target="_blank" rel="noopener">{{ t('status.howToFix') }}</a>
      </p>
    </header>

    <div class="toolbar">
      <div v-if="kinds.length > 1" class="segmented" role="group" :aria-label="t('deliveries.kind')">
        <button
          v-for="k in kinds"
          :key="k"
          type="button"
          :aria-pressed="kind === k"
          @click="setQuery({ kind: k })"
        >
          {{ t(k === 'webhook' ? 'deliveries.webhooks' : 'deliveries.emails') }}
        </button>
      </div>
      <div class="segmented" role="group" :aria-label="t('deliveries.state')">
        <button type="button" :aria-pressed="state === 'failed'" @click="setQuery({ state: undefined })">
          {{ t('deliveries.failed', { count: list?.counts.failed ?? 0 }) }}
        </button>
        <button type="button" :aria-pressed="state === 'pending'" @click="setQuery({ state: 'pending' })">
          {{ t('deliveries.pending', { count: list?.counts.pending ?? 0 }) }}
        </button>
      </div>
      <div v-if="state === 'failed' && list?.counts.failed" class="toolbar-actions">
        <button type="button" class="btn" :disabled="!!busy" @click="retryAll">
          <RotateCw :size="16" aria-hidden="true" />
          {{ t('deliveries.retryAll') }}
        </button>
        <button type="button" class="btn delete-all" :disabled="!!busy" @click="confirmingAll = true">
          <Trash2 :size="16" aria-hidden="true" />
          {{ t('deliveries.deleteAll') }}
        </button>
      </div>
    </div>

    <p v-if="loading && !list" class="muted">{{ t('common.loading') }}</p>
    <p v-else-if="list && list.docs.length === 0" class="card empty muted">
      {{ t(state === 'failed' ? 'deliveries.noneFailed' : 'deliveries.nonePending') }}
    </p>
    <ul v-else-if="list" class="items">
      <li v-for="item in list.docs" :key="String(item.id)" class="card item">
        <div class="item-head">
          <div class="item-title">
            <template v-if="item.kind === 'webhook'">
              <span class="badge">{{ item.event }}</span>
              <strong>{{ target(item) }}</strong>
            </template>
            <strong v-else>{{ item.subject || '—' }}</strong>
          </div>
          <div class="item-actions">
            <button type="button" class="btn btn-sm" :disabled="!!busy" @click="retry(item)">
              <RotateCw :size="14" aria-hidden="true" />
              {{ t('deliveries.retry') }}
            </button>
            <button
              type="button"
              class="btn btn-sm btn-ghost btn-icon"
              :disabled="!!busy"
              :aria-label="t('deliveries.delete')"
              @click="remove(item)"
            >
              <Trash2 :size="14" aria-hidden="true" />
            </button>
          </div>
        </div>
        <dl class="item-meta">
          <template v-if="item.kind === 'webhook'">
            <dt>{{ t('deliveries.to') }}</dt>
            <dd><code>{{ item.url }}</code></dd>
          </template>
          <template v-else>
            <dt>{{ t('deliveries.to') }}</dt>
            <dd>{{ item.to.join(', ') || '—' }}</dd>
          </template>
          <dt>{{ t('deliveries.last') }}</dt>
          <dd>{{ formatDate(item.updatedAt) }} · {{ t('deliveries.attempts', { count: item.attempts }) }}</dd>
          <template v-if="item.error">
            <dt>{{ t('deliveries.error') }}</dt>
            <dd class="error">{{ item.error }}</dd>
          </template>
          <template v-if="item.state === 'pending'">
            <dt>{{ t('deliveries.next') }}</dt>
            <dd>{{ formatDate(item.nextAttemptAt) }}</dd>
          </template>
        </dl>
        <details v-if="item.kind === 'webhook'" class="body">
          <summary>{{ t('deliveries.body') }}</summary>
          <pre>{{ pretty(item.body) }}</pre>
        </details>
      </li>
    </ul>

    <nav v-if="list && list.totalPages > 1" class="pagination" :aria-label="t('deliveries.pages')">
      <button type="button" class="btn btn-sm btn-icon" :disabled="page <= 1" :aria-label="t('list.previous')" @click="setQuery({ page: String(page - 1) })">
        <ChevronLeft :size="16" aria-hidden="true" />
      </button>
      <span class="muted">{{ page }} / {{ list.totalPages }}</span>
      <button type="button" class="btn btn-sm btn-icon" :disabled="page >= list.totalPages" :aria-label="t('list.next')" @click="setQuery({ page: String(page + 1) })">
        <ChevronRight :size="16" aria-hidden="true" />
      </button>
    </nav>

    <ConfirmDialog
      :open="confirmingAll"
      :message="t('deliveries.confirmDeleteAll', { count: list?.counts.failed ?? 0 })"
      :confirm-label="t('deliveries.deleteAll')"
      @confirm="removeAll"
      @cancel="confirmingAll = false"
    />
  </template>
</template>

<style scoped>
.crumbs {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
  color: var(--faint);
  font-size: 0.875rem;
}
.crumbs .current {
  color: var(--text-muted);
}
.page-header {
  margin-bottom: 1.25rem;
}
.page-header p {
  margin: 0.3rem 0 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.toolbar-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
.segmented {
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.segmented button {
  min-height: 2.1rem;
  padding: 0 0.8rem;
  border: 0;
  background: var(--surface);
  color: var(--text-muted);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.segmented button + button {
  border-left: 1px solid var(--border-strong);
}
.segmented button[aria-pressed='true'] {
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
}
.segmented button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.delete-all {
  color: var(--danger);
}
.empty {
  margin: 0;
  padding: 1.25rem;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  padding: 0.9rem 1.1rem;
  min-width: 0;
}
.item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.item-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.item-actions {
  display: flex;
  gap: 0.35rem;
}
.item-meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.3rem 1rem;
  margin: 0.6rem 0 0;
  font-size: 0.875rem;
}
.item-meta dt {
  color: var(--faint);
}
.item-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.item-meta .error {
  color: var(--danger);
}
.body {
  margin-top: 0.6rem;
  font-size: 0.85rem;
}
.body summary {
  cursor: pointer;
  color: var(--text-muted);
}
.body pre {
  max-height: 20rem;
  overflow: auto;
  margin: 0.5rem 0 0;
  padding: 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 0.8rem;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
}
</style>
