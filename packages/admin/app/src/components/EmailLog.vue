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

/** `blocked`: the suppression list is kept, so bounced and skipped rows link to it. */
defineProps<{ blocked?: boolean }>()
const emit = defineEmits<{ blocked: [address: string] }>()

const log = ref<AdminEmailLog | null>(null)
/** One filter for how it went: the send's state, or what the provider said after. */
const status = ref('')
const tag = ref('')
const q = ref('')
const page = ref(1)
const error = ref('')

async function load() {
  try {
    log.value = await api<AdminEmailLog>(
      'GET',
      `/admin/email/log${toQuery({
        ...(status.value in DELIVERIES
          ? { delivery: status.value }
          : status.value
            ? { state: status.value }
            : {}),
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
watch([status, tag], () => {
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

/** The first address of a log entry's `to`, as the blocked list keeps it. */
function firstAddress(to: string): string {
  const first = to.split(',')[0] ?? ''
  const match = /<([^<>]+)>/.exec(first)
  return (match ? (match[1] ?? '') : first).trim().toLowerCase()
}
/** The badge: what the provider said, else how sending went. */
const badgeOf = (entry: AdminEmailLog['docs'][number]) =>
  entry.delivery
    ? { key: DELIVERIES[entry.delivery], tone: `delivery-${entry.delivery}` }
    : { key: STATES[entry.state], tone: `state-${entry.state}` }
const blockable = (entry: AdminEmailLog['docs'][number]) =>
  entry.state === 'skipped' || entry.delivery === 'bounced' || entry.delivery === 'complained'

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
  skipped: 'emailLog.skipped',
} as const
/** What the provider said happened after sending (#404). */
const DELIVERIES = {
  delivered: 'emailLog.delivered',
  bounced: 'emailLog.bounced',
  complained: 'emailLog.complained',
} as const
</script>

<template>
  <div class="card list">
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
          <select v-model="status" class="input" :aria-label="t('emailLog.state')">
            <option value="">{{ t('emailLog.allStates') }}</option>
            <option v-if="log.deliveries" value="delivered">{{ t('emailLog.delivered') }}</option>
            <option value="sent">{{ t('emailLog.sent') }}</option>
            <option value="pending">{{ t('emailLog.pending') }}</option>
            <option value="failed">{{ t('emailLog.failed') }}</option>
            <template v-if="log.deliveries">
              <option value="bounced">{{ t('emailLog.bounced') }}</option>
              <option value="complained">{{ t('emailLog.complained') }}</option>
            </template>
            <option value="skipped">{{ t('emailLog.skipped') }}</option>
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
                <th scope="col">{{ t('emailLog.state') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in log.docs" :key="String(entry.id)">
                <td class="when">{{ formatDate(entry.sentAt ?? entry.createdAt) }}</td>
                <td class="to">
                  {{ entry.to }}
                  <span v-if="entry.cc" class="muted small">cc {{ entry.cc }}</span>
                  <span v-if="entry.bcc" class="muted small">{{ t('emailLog.bcc', { count: entry.bcc }) }}</span>
                </td>
                <td class="subject">
                  {{ entry.subject }}
                  <span v-if="entry.tag" class="kind">{{ tagLabel(entry.tag) }}</span>
                </td>
                <td class="state">
                  <span :class="['badge', badgeOf(entry).tone]" :title="entry.deliveryAt ? formatDate(entry.deliveryAt) : undefined">{{ t(badgeOf(entry).key) }}</span>
                  <span v-if="entry.state === 'pending' && entry.attempts" class="muted small"> {{ t('emailLog.attempt', { count: entry.attempts }) }}</span>
                  <span v-if="entry.error && (entry.state !== 'sent' || entry.delivery === 'bounced')" :class="entry.state === 'skipped' ? 'muted small' : 'error small'">{{ entry.error }}</span>
                  <button v-if="blocked && blockable(entry)" type="button" class="link small" @click="emit('blocked', firstAddress(entry.to))">{{ t('emailLog.showBlocked') }}</button>
                  <RouterLink v-if="(entry.state === 'pending' || entry.state === 'failed') && session.schema?.deliveries?.email" to="/deliveries?kind=email" class="small">{{ t('emailLog.retry') }}</RouterLink>
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
  </div>
</template>

<style scoped>
.list {
  margin-top: 1.25rem;
  padding: 1.25rem;
}
.list > :first-child {
  margin-top: 0;
}
.link {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  color: var(--brand);
  font: inherit;
  cursor: pointer;
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
.filters select.input {
  flex: 0 1 12rem;
  width: auto;
}
.list {
  container-type: inline-size;
}
.table-wrap {
  overflow-x: auto;
}
.when {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.kind {
  display: block;
  color: var(--faint);
  font-size: 0.8rem;
}
.badge {
  display: inline-block;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.8rem;
  line-height: 1.4rem;
  white-space: nowrap;
}
/* From waiting to sent to delivered, and what went wrong in red. */
.state-pending {
  background: var(--warning-soft);
  color: var(--warning-text);
}
.state-sent {
  background: var(--success-soft);
  color: var(--ok);
}
.delivery-delivered {
  background: var(--success-soft);
  color: var(--ok);
  font-weight: 600;
}
.delivery-delivered::before {
  content: '✓ ';
}
.state-failed,
.delivery-bounced,
.delivery-complained {
  background: var(--danger-soft);
  color: var(--danger);
}
.state-skipped {
  background: var(--surface-2);
  color: var(--text-muted);
}
/* Narrow: each email a block, recipient and state first. */
@container (max-width: 34rem) {
  table,
  tbody {
    display: block;
  }
  thead {
    display: none;
  }
  tr {
    display: grid;
    grid-template-areas: 'to state' 'subject subject' 'when when';
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.1rem 0.5rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 0;
    border: 0;
  }
  .to {
    grid-area: to;
    font-weight: 600;
  }
  .state {
    grid-area: state;
    text-align: right;
  }
  .subject {
    grid-area: subject;
  }
  .when {
    grid-area: when;
    font-size: 0.8rem;
  }
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
