<script setup lang="ts">
import type { AuditEntry, AuditPage, AuditVerification } from '@easy-cms/core'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ShieldCheck,
  TriangleAlert,
  X,
} from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '../lib/api'
import {
  AUDIT_ACTIONS,
  actionLabel,
  actionTone,
  changeRows,
  entryLink,
  showValue,
  targetLabel,
  viaLabel,
} from '../lib/audit'
import { formatDate, label, t } from '../lib/i18n'
import { isSystemAdmin, session } from '../lib/session'
import { settings } from '../lib/settings'
import { notify } from '../lib/toast'

/** Settings → Audit log (`audit`): who did what and when, filtered, with each change's fields. */
const route = useRoute()
const router = useRouter()
const data = ref<AuditPage | null>(null)
const failed = ref('')
const open = ref<string | null>(null)
const verifying = ref(false)
const verification = ref<AuditVerification | null>(null)
/** The check covers the whole site: for admins of all of it, not of one part (a tenant). */
const canVerify = computed(() => isSystemAdmin(session.user))

const KEYS = ['action', 'target', 'doc', 'actor', 'from', 'to'] as const
type Key = (typeof KEYS)[number]
const value = (key: Key) =>
  typeof route.query[key] === 'string' ? (route.query[key] as string) : ''
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const filtered = computed(() => KEYS.some((k) => value(k)))

/** The filters as a query string; dates cover whole days. */
function query(extra: Record<string, string> = {}) {
  const params = new URLSearchParams()
  for (const key of KEYS) {
    const v = value(key)
    if (!v) continue
    if (key === 'from') params.set(key, new Date(`${v}T00:00:00`).toISOString())
    else if (key === 'to') params.set(key, new Date(`${v}T23:59:59.999`).toISOString())
    else params.set(key, v)
  }
  for (const [k, v] of Object.entries(extra)) params.set(k, v)
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function load() {
  try {
    data.value = await api<AuditPage>('GET', `/admin/audit${query({ page: String(page.value) })}`)
    failed.value = ''
  } catch (e) {
    failed.value = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
  }
}
watch(() => route.query, load, { immediate: true })

function set(key: Key | 'page', v: string) {
  const next: Record<string, string | undefined> = { ...(route.query as Record<string, string>) }
  next[key] = v || undefined
  if (key !== 'page') next.page = undefined
  void router.replace({ query: next })
}
let typing: ReturnType<typeof setTimeout> | undefined
function setLater(key: Key, v: string) {
  clearTimeout(typing)
  typing = setTimeout(() => set(key, v), 300)
}
const clear = () => void router.replace({ query: {} })

const ACTION_GROUPS = [
  'create',
  'update',
  'publish',
  'unpublish',
  'delete',
  'login',
  'sso',
  'password',
  'role',
  'backup',
]
const targets = computed(() => [
  ...(session.schema?.collections ?? []).map((c) => ({
    value: c.slug,
    name: label(c.labels?.plural, c.slug),
  })),
  ...(session.schema?.globals ?? []).map((g) => ({
    value: `global:${g.slug}`,
    name: label(g.label, g.slug),
  })),
  ...['auth', 'roles', 'backups'].map((a) => ({ value: a, name: targetLabel(a) })),
])
const groupLabel = (group: string) =>
  (AUDIT_ACTIONS as readonly string[]).includes(group)
    ? actionLabel(group)
    : t(`audit.group.${group}` as 'audit.group.sso')

const csv = computed(() => `${settings.apiPath}/admin/audit.csv${query()}`)
const key = (e: AuditEntry) => String(e.id)

async function verify() {
  verifying.value = true
  try {
    verification.value = await api<AuditVerification>('POST', '/admin/audit/verify')
    if (!verification.value.invalid.length)
      notify('success', t('audit.verified', { count: verification.value.checked }))
  } catch (e) {
    notify('error', e instanceof ApiError ? e.message : String(e))
  } finally {
    verifying.value = false
  }
}
</script>

<template>
  <p v-if="!session.schema?.views.audit" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <nav class="crumbs" :aria-label="t('list.breadcrumb')">
      <span>{{ t('nav.globals') }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
      <span class="current">{{ t('audit.title') }}</span>
    </nav>
    <header class="page-header">
      <div>
        <h1>{{ t('audit.title') }}</h1>
        <p class="muted">{{ t('audit.lead') }}</p>
      </div>
      <div class="header-actions">
        <a class="btn" :href="csv" download>
          <Download :size="16" aria-hidden="true" />
          {{ t('audit.csv') }}
        </a>
        <button v-if="canVerify" type="button" class="btn" :disabled="verifying" @click="verify">
          <ShieldCheck :size="16" aria-hidden="true" />
          {{ t('audit.verify') }}
        </button>
      </div>
    </header>

    <p v-if="verification && (verification.invalid.length || verification.gaps)" class="warning" role="alert">
      <TriangleAlert :size="16" aria-hidden="true" />
      <span>
        {{ t('audit.tampered', { invalid: verification.invalid.length, gaps: verification.gaps, checked: verification.checked }) }}
      </span>
    </p>

    <div class="filters" role="search">
      <label class="filter">
        <span class="visually-hidden">{{ t('audit.filterAction') }}</span>
        <select class="input" :value="value('action')" @change="set('action', ($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('audit.allActions') }}</option>
          <option v-for="g in ACTION_GROUPS" :key="g" :value="g">{{ groupLabel(g) }}</option>
        </select>
      </label>
      <label class="filter">
        <span class="visually-hidden">{{ t('audit.filterTarget') }}</span>
        <select class="input" :value="value('target')" @change="set('target', ($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('audit.allTargets') }}</option>
          <option v-for="o in targets" :key="o.value" :value="o.value">{{ o.name }}</option>
        </select>
      </label>
      <label class="filter grow">
        <span class="visually-hidden">{{ t('audit.filterActor') }}</span>
        <input class="input" type="search" :value="value('actor')" :placeholder="t('audit.filterActor')" @input="setLater('actor', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="filter">
        <span class="small muted">{{ t('audit.from') }}</span>
        <input class="input" type="date" :value="value('from')" @change="set('from', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="filter">
        <span class="small muted">{{ t('audit.to') }}</span>
        <input class="input" type="date" :value="value('to')" @change="set('to', ($event.target as HTMLInputElement).value)" />
      </label>
      <button v-if="filtered" type="button" class="btn btn-ghost btn-sm" @click="clear">
        <X :size="14" aria-hidden="true" />
        {{ t('list.clearFilters') }}
      </button>
    </div>
    <p v-if="value('doc')" class="muted small">{{ t('audit.oneDocument', { doc: value('doc') }) }}</p>

    <p v-if="failed" class="field-error">{{ failed }}</p>
    <p v-else-if="!data" class="muted">{{ t('common.loading') }}</p>
    <section v-else class="card list" :aria-label="t('audit.title')">
      <p v-if="!data.docs.length" class="empty muted">{{ t('audit.none') }}</p>
      <ol v-else>
        <li v-for="entry in data.docs" :key="key(entry)" class="entry">
          <button
            type="button"
            class="row"
            :aria-expanded="open === key(entry)"
            @click="open = open === key(entry) ? null : key(entry)"
          >
            <time :datetime="entry.at" class="when">{{ formatDate(entry.at) }}</time>
            <span :class="['badge', `tone-${actionTone(entry.action)}`]">{{ actionLabel(entry.action) }}</span>
            <span class="what">
              <span class="target">{{ targetLabel(entry.target) }}</span>
              <strong v-if="entry.title">{{ entry.title }}</strong>
              <span v-else-if="entry.doc" class="muted">#{{ entry.doc }}</span>
            </span>
            <span class="who">
              {{ entry.actor.email ?? '—' }}
              <span v-if="entry.actor.via !== 'user'" class="via">{{ viaLabel(entry.actor.via) }}</span>
            </span>
            <ChevronDown :size="15" aria-hidden="true" :class="['chev', { up: open === key(entry) }]" />
          </button>
          <div v-if="open === key(entry)" class="details">
            <table v-if="entry.changes?.length" class="changes">
              <thead>
                <tr>
                  <th scope="col">{{ t('audit.field') }}</th>
                  <th scope="col">{{ t('audit.before') }}</th>
                  <th scope="col">{{ t('audit.after') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="change in entry.changes.flatMap(changeRows)" :key="change.field">
                  <th scope="row"><code>{{ change.field }}</code></th>
                  <template v-if="'before' in change || 'after' in change">
                    <td class="before">{{ showValue(change.before) }}</td>
                    <td class="after">{{ showValue(change.after) }}</td>
                  </template>
                  <td v-else colspan="2" class="muted">{{ t('audit.changed') }}</td>
                </tr>
              </tbody>
            </table>
            <dl>
              <template v-if="entry.detail">
                <template v-for="(v, k) in entry.detail" :key="k">
                  <dt>{{ k }}</dt>
                  <dd>{{ showValue(v) }}</dd>
                </template>
              </template>
              <dt>{{ t('audit.via') }}</dt>
              <dd>{{ viaLabel(entry.actor.via) }}</dd>
              <template v-if="entry.actor.ip">
                <dt>IP</dt>
                <dd><code>{{ entry.actor.ip }}</code></dd>
              </template>
              <template v-if="entry.actor.userAgent">
                <dt>{{ t('audit.userAgent') }}</dt>
                <dd class="ua">{{ entry.actor.userAgent }}</dd>
              </template>
            </dl>
            <RouterLink v-if="entryLink(entry)" :to="entryLink(entry) as string" class="open">{{ t('audit.open') }}</RouterLink>
          </div>
        </li>
      </ol>
      <nav v-if="data.totalPages > 1" class="pager" :aria-label="t('audit.pages')">
        <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="set('page', String(page - 1))">
          <ChevronLeft :size="15" aria-hidden="true" />
        </button>
        <span class="muted small">{{ t('audit.page', { page: data.page, pages: data.totalPages, total: data.totalDocs }) }}</span>
        <button type="button" class="btn btn-sm" :disabled="page >= data.totalPages" @click="set('page', String(page + 1))">
          <ChevronRight :size="15" aria-hidden="true" />
        </button>
      </nav>
    </section>
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
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.page-header p {
  margin: 0.3rem 0 0;
}
.header-actions {
  display: flex;
  gap: 0.5rem;
}
.header-actions .btn {
  gap: 0.4rem;
  text-decoration: none;
}
.warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 0.875rem;
}
.warning svg {
  flex: none;
  margin-top: 0.1rem;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.filter {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.filter.grow {
  flex: 1 1 12rem;
}
.small {
  font-size: 0.8rem;
}
.list {
  padding: 0;
  overflow: hidden;
}
.list ol {
  margin: 0;
  padding: 0;
  list-style: none;
}
.empty {
  margin: 0;
  padding: 1rem 1.1rem;
}
.entry + .entry {
  border-top: 1px solid var(--border);
}
.row {
  display: grid;
  grid-template-columns: 10.5rem 8.5rem minmax(0, 1fr) minmax(0, 14rem) 1rem;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 1rem;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}
.row:hover {
  background: var(--surface-2);
}
.when {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.badge {
  justify-self: start;
  font-size: 0.72rem;
}
.tone-danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.tone-warning {
  background: var(--warning-soft);
  color: var(--warning-text);
}
.tone-ok {
  background: var(--success-soft);
  color: var(--ok);
}
.what {
  display: flex;
  gap: 0.5rem;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.target {
  color: var(--text-muted);
}
.what strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.who {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.via {
  margin-left: 0.35rem;
  color: var(--faint);
  font-size: 0.75rem;
}
.chev {
  color: var(--faint);
  transition: transform 0.15s;
}
.chev.up {
  transform: rotate(180deg);
}
.details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem 1rem 1rem;
  font-size: 0.85rem;
}
.changes {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.changes th,
.changes td {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.changes thead th {
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.75rem;
}
.before {
  color: var(--danger);
}
.after {
  color: var(--ok);
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.3rem 1rem;
  margin: 0;
}
dt {
  color: var(--faint);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.ua {
  font-size: 0.78rem;
}
.open {
  align-self: flex-start;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.6rem;
  border-top: 1px solid var(--border);
}
@media (max-width: 900px) {
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'what badge' 'who when';
  }
  .row .what {
    grid-area: what;
  }
  .row .badge {
    grid-area: badge;
    justify-self: end;
  }
  .row .who {
    grid-area: who;
  }
  .row .when {
    grid-area: when;
  }
  .chev {
    display: none;
  }
}
</style>
