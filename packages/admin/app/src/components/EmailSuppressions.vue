<script setup lang="ts">
// Settings → Email: addresses that get no email (#404). Bounced for good or reported spam, as the
// provider's webhook said, or added here; taking one off sends to it again.
import { ChevronLeft, ChevronRight, Plus, Search, Trash2 } from '@lucide/vue'
import { onMounted, ref, watch } from 'vue'
import { ApiError, api, toQuery } from '../lib/api'
import { formatDate, t } from '../lib/i18n'
import { notify } from '../lib/toast'

interface Suppressed {
  id: number | string
  address: string
  reason: 'bounced' | 'complained' | 'manual'
  detail: string | null
  source: string | null
  createdAt: string
}
const list = ref<{
  docs: Suppressed[]
  page: number
  totalPages: number
  totalDocs: number
} | null>(null)
const q = ref('')
const page = ref(1)
const error = ref('')
const address = ref('')
const addError = ref('')
const adding = ref(false)

async function load() {
  try {
    list.value = await api(
      'GET',
      `/admin/email/suppressions${toQuery({
        ...(q.value.trim() ? { q: q.value.trim() } : {}),
        ...(page.value > 1 ? { page: String(page.value) } : {}),
      })}`,
    )
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(load)
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
function go(to: number) {
  page.value = to
  void load()
}

async function add() {
  adding.value = true
  addError.value = ''
  try {
    const added = await api<{ address: string }>('POST', '/admin/email/suppressions', {
      address: address.value,
    })
    notify('success', t('suppressions.added', { address: added.address }))
    address.value = ''
    await load()
  } catch (e) {
    addError.value = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
  } finally {
    adding.value = false
  }
}
async function remove(row: Suppressed) {
  if (!window.confirm(t('suppressions.confirmRemove', { address: row.address }))) return
  try {
    await api('DELETE', `/admin/email/suppressions/${row.id}`)
    notify('success', t('suppressions.removed', { address: row.address }))
    await load()
  } catch (e) {
    notify('error', (e as Error).message)
  }
}

const REASONS = {
  bounced: 'suppressions.bounced',
  complained: 'suppressions.complained',
  manual: 'suppressions.manual',
} as const
</script>

<template>
  <section class="card list" aria-labelledby="suppressions-heading">
    <h2 id="suppressions-heading">{{ t('suppressions.title') }}</h2>
    <p class="muted small">{{ t('suppressions.lead') }}</p>
    <p v-if="error" class="field-error">{{ error }}</p>
    <template v-else-if="list">
      <div class="filters">
        <label class="search">
          <Search :size="15" aria-hidden="true" />
          <input v-model="q" type="search" class="input" :placeholder="t('suppressions.search')" :aria-label="t('suppressions.search')" />
        </label>
        <form class="add" novalidate @submit.prevent="add">
          
          <input v-model="address" type="email" class="input" autocomplete="off" :placeholder="t('suppressions.address')" :aria-label="t('suppressions.addLabel')" />
          <button type="submit" class="btn" :disabled="adding || !address.trim()"><Plus :size="14" aria-hidden="true" /> {{ t('suppressions.add') }}</button>
        </form>
      </div>
      <p v-if="addError" class="field-error" role="alert">{{ addError }}</p>
      <p v-if="list.docs.length === 0" class="empty muted">{{ t('suppressions.none') }}</p>
      <ul v-else class="rows">
        <li v-for="row in list.docs" :key="String(row.id)" class="row">
          <div class="what">
            <strong>{{ row.address }}</strong>
            <span class="muted small">
              <span :class="['badge', `reason-${row.reason}`]">{{ t(REASONS[row.reason]) }}</span>
              {{ formatDate(row.createdAt) }}<template v-if="row.source"> · {{ row.source }}</template><template v-if="row.detail"> · {{ row.detail }}</template>
            </span>
          </div>
          <button type="button" class="btn btn-sm btn-ghost" :aria-label="t('suppressions.removeName', { address: row.address })" @click="remove(row)"><Trash2 :size="14" aria-hidden="true" /> {{ t('suppressions.remove') }}</button>
        </li>
      </ul>
      <nav v-if="list.totalPages > 1" class="pager" :aria-label="t('emailLog.pages')">
        <button type="button" class="btn btn-sm btn-icon" :disabled="page <= 1" :aria-label="t('list.previous')" @click="go(page - 1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
        <span class="muted small">{{ t('emailLog.page', { page, pages: list.totalPages }) }}</span>
        <button type="button" class="btn btn-sm btn-icon" :disabled="page >= list.totalPages" :aria-label="t('list.next')" @click="go(page + 1)"><ChevronRight :size="16" aria-hidden="true" /></button>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.list {
  margin-top: 1.25rem;
  padding: 1.25rem;
}
h2 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.search {
  display: flex;
  flex: 1 1 14rem;
  align-items: center;
  gap: 0.4rem;
}
.search .input {
  flex: 1;
}
.add {
  display: flex;
  flex: 1 1 18rem;
  gap: 0.4rem;
}
.add .input {
  flex: 1;
  min-width: 0;
}
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--border);
}
.what {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  overflow-wrap: anywhere;
}
.reason-bounced,
.reason-complained {
  color: var(--danger);
}
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.empty {
  margin: 0.5rem 0 0;
}
</style>
