<script setup lang="ts">
// Settings → Email: the emails sent, newest first, by state, kind or recipient. Who,
// what and how it went; never the content, whose links sign people in.
import type { AdminEmailLog } from '@easy-cms/core'
import { ChevronLeft, ChevronRight, Search } from '@lucide/vue'
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { api, toQuery } from '../lib/api'
import { formatDate, t } from '../lib/i18n'
import { session } from '../lib/session'

const log = ref<AdminEmailLog | null>(null)
const state = ref('')
const tag = ref('')
const q = ref('')
const page = ref(1)
const error = ref('')

async function load() {
  try {
    log.value = await api<AdminEmailLog>(
      'GET',
      `/admin/email/log${toQuery({
        ...(state.value ? { state: state.value } : {}),
        ...(tag.value ? { tag: tag.value } : {}),
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
watch([state, tag], () => {
  page.value = 1
  void load()
})
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

/** Known kinds by name; others (a plugin's) as they are. */
const TAGS: Record<string, Parameters<typeof t>[0]> = {
  'password-reset': 'emailLog.tag.passwordReset',
  invite: 'emailLog.tag.invite',
  'password-changed': 'emailLog.tag.passwordChanged',
  'verify-email': 'emailLog.tag.verifyEmail',
  'member-added': 'emailLog.tag.memberAdded',
  'order:confirmation': 'emailLog.tag.orderConfirmation',
  'order:new': 'emailLog.tag.orderNew',
  'order:paid': 'emailLog.tag.orderPaid',
}
function tagLabel(value: string | null): string {
  if (!value) return '—'
  const known = TAGS[value]
  if (known) return t(known)
  if (value.startsWith('form:')) return t('emailLog.tag.form', { name: value.slice(5) })
  return value
}
const STATES = {
  sent: 'emailLog.sent',
  pending: 'emailLog.pending',
  failed: 'emailLog.failed',
} as const
</script>

<template>
  <section class="card list" aria-labelledby="email-log-heading">
    <h2 id="email-log-heading">{{ t('emailLog.title') }}</h2>
    <p v-if="error" class="field-error">{{ error }}</p>
    <template v-else-if="log">
      <p v-if="!log.enabled" class="muted">{{ t('emailLog.off') }}</p>
      <template v-else>
        <p class="muted small">{{ t('emailLog.lead', { days: log.keepDays }) }}</p>
        <div class="filters">
          <label class="search">
            <Search :size="15" aria-hidden="true" />
            <input v-model="q" type="search" class="input" :placeholder="t('emailLog.search')" :aria-label="t('emailLog.search')" />
          </label>
          <select v-model="state" class="input" :aria-label="t('emailLog.state')">
            <option value="">{{ t('emailLog.allStates') }}</option>
            <option value="sent">{{ t('emailLog.sent') }}</option>
            <option value="pending">{{ t('emailLog.pending') }}</option>
            <option value="failed">{{ t('emailLog.failed') }}</option>
          </select>
          <select v-model="tag" class="input" :aria-label="t('emailLog.kind')">
            <option value="">{{ t('emailLog.allKinds') }}</option>
            <option v-for="value in log.tags" :key="value" :value="value">{{ tagLabel(value) }}</option>
          </select>
        </div>
        <p v-if="log.docs.length === 0" class="empty muted">{{ t('emailLog.none') }}</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('emailLog.when') }}</th>
                <th scope="col">{{ t('emailLog.to') }}</th>
                <th scope="col">{{ t('emailLog.subject') }}</th>
                <th scope="col">{{ t('emailLog.kind') }}</th>
                <th scope="col">{{ t('emailLog.state') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in log.docs" :key="String(entry.id)">
                <td class="nowrap">{{ formatDate(entry.sentAt ?? entry.createdAt) }}</td>
                <td class="to">
                  {{ entry.to }}
                  <span v-if="entry.cc" class="muted small">cc {{ entry.cc }}</span>
                  <span v-if="entry.bcc" class="muted small">{{ t('emailLog.bcc', { count: entry.bcc }) }}</span>
                </td>
                <td>{{ entry.subject }}</td>
                <td class="nowrap">{{ tagLabel(entry.tag) }}</td>
                <td>
                  <span :class="['badge', `state-${entry.state}`]">{{ t(STATES[entry.state]) }}</span>
                  <span v-if="entry.state === 'pending' && entry.attempts" class="muted small"> {{ t('emailLog.attempt', { count: entry.attempts }) }}</span>
                  <span v-if="entry.error && entry.state !== 'sent'" class="error small">{{ entry.error }}</span>
                  <RouterLink v-if="entry.state !== 'sent' && session.schema?.deliveries?.email" to="/deliveries?kind=email" class="small">{{ t('emailLog.retry') }}</RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <nav v-if="log.totalPages > 1" class="pager" :aria-label="t('emailLog.pages')">
          <button type="button" class="btn btn-sm btn-icon" :disabled="page <= 1" :aria-label="t('list.previous')" @click="go(page - 1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
          <span class="muted small">{{ t('emailLog.page', { page, pages: log.totalPages }) }}</span>
          <button type="button" class="btn btn-sm btn-icon" :disabled="page >= log.totalPages" :aria-label="t('list.next')" @click="go(page + 1)"><ChevronRight :size="16" aria-hidden="true" /></button>
        </nav>
      </template>
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
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
th,
td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
th {
  color: var(--text-muted);
  font-weight: 600;
}
.to {
  overflow-wrap: anywhere;
}
.to span,
td .error,
td a {
  display: block;
}
.nowrap {
  white-space: nowrap;
}
.error {
  color: var(--danger);
}
.state-sent {
  color: var(--success, var(--text-muted));
}
.state-failed {
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
  margin: 1rem 0 0;
}
</style>
