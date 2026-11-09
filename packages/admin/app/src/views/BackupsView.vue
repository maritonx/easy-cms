<script setup lang="ts">
import type { AdminBackup, AdminBackups } from '@easy-cms/core'
import {
  ChevronRight,
  DatabaseBackup,
  Download,
  ExternalLink,
  Trash2,
  TriangleAlert,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import PanelSkeleton from '../components/PanelSkeleton.vue'
import { ApiError, api } from '../lib/api'
import { formatBytes, formatDate, locale, t } from '../lib/i18n'
import { useDelayedLoading } from '../lib/loading'
import { session } from '../lib/session'
import { settings } from '../lib/settings'
import { notify } from '../lib/toast'

/** Settings → Backups (admins): the schedule, the backups, back up now, download, delete. */
const data = ref<AdminBackups | null>(null)
/** A skeleton while the page loads (only when it is slow). */
const showSkeleton = useDelayedLoading(() => !data.value)
const failed = ref('')
const starting = ref(false)
const deleting = ref<AdminBackup | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

const busy = computed(
  () => data.value?.backups.some((b) => b.state === 'pending' || b.state === 'running') ?? false,
)

async function load() {
  clearTimeout(timer)
  try {
    data.value = await api<AdminBackups>('GET', '/admin/backups')
    failed.value = ''
  } catch (e) {
    failed.value = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
  }
  // While one is in progress, look again until it is done.
  if (busy.value) timer = setTimeout(load, 2000)
}
onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))

async function backUpNow() {
  starting.value = true
  try {
    await api('POST', '/admin/backups')
    notify('success', t('backups.started'))
  } catch (e) {
    notify('error', e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e))
  } finally {
    starting.value = false
    await load()
  }
}
/** After a download, show who downloaded it. */
function afterDownload() {
  setTimeout(load, 1500)
}
async function remove() {
  const backup = deleting.value
  deleting.value = null
  if (!backup) return
  try {
    await api('DELETE', `/admin/backups/${backup.id}`)
    notify('success', t('backups.deleted'))
  } catch (e) {
    notify('error', e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e))
  }
  await load()
}

const downloadUrl = (backup: AdminBackup) =>
  `${settings.apiPath}/admin/backups/${backup.id}/download`
const schedule = computed(() => {
  const s = data.value?.settings
  if (!s?.frequency) return t('backups.manualOnly')
  return t(s.frequency === 'daily' ? 'backups.everyDay' : 'backups.everyWeek', { at: s.at })
})
const local = computed(
  () =>
    data.value?.settings.storage === 'local' &&
    data.value.settings.server &&
    data.value.settings.destinations.length === 0,
)

// The settings form (#395): what the config sets is shown, not changed.
const form = ref({
  frequency: '' as '' | 'daily' | 'weekly',
  at: '03:00',
  keep: 7,
  server: true,
  destinations: {} as Record<string, { on: boolean; keep: string }>,
})
const formErrors = ref<Record<string, string>>({})
const saving = ref(false)
watch(data, (value) => {
  if (!value) return
  const chosen = new Map(value.settings.destinations.map((d) => [d.connection, d.keep]))
  form.value = {
    frequency: value.settings.frequency ?? '',
    at: value.settings.at,
    keep: value.settings.keep,
    server: value.settings.server,
    destinations: Object.fromEntries(
      value.places.map((p) => [
        p.id,
        { on: chosen.has(p.id), keep: chosen.get(p.id) ? String(chosen.get(p.id)) : '' },
      ]),
    ),
  }
})
const locked = (field: 'frequency' | 'at' | 'keep') =>
  data.value?.settings.locked.includes(field) ?? false
const unencrypted = computed(
  () => !data.value?.settings.encrypted && Object.values(form.value.destinations).some((d) => d.on),
)
async function saveSettings() {
  saving.value = true
  formErrors.value = {}
  try {
    await api('PUT', '/admin/backups/settings', {
      frequency: form.value.frequency || null,
      at: form.value.at,
      keep: Number(form.value.keep),
      server: form.value.server,
      destinations: Object.entries(form.value.destinations)
        .filter(([, d]) => d.on)
        .map(([connection, d]) => ({ connection, keep: d.keep ? Number(d.keep) : null })),
    })
    notify('success', t('backups.settingsSaved'))
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.errors.length)
      for (const item of e.errors) formErrors.value[item.field ?? ''] = item.message
    else notify('error', (e as Error).message)
  } finally {
    saving.value = false
  }
}
const placeLabel = (id: string) =>
  id === 'server'
    ? t('backups.thisServer')
    : (data.value?.places.find((p) => p.id === id)?.label ?? id)
const copyList = (backup: AdminBackup) =>
  Object.entries(backup.copies ?? {}).filter(([, c]) => c.state !== 'removed')
const docs = computed(
  () => `https://easycms.dev${locale.value === 'th' ? '/th' : ''}/docs/backups#from-the-admin`,
)
const STATES = {
  pending: 'backups.pending',
  running: 'backups.running',
  done: 'backups.done',
  failed: 'backups.failed',
} as const
</script>

<template>
  <p v-if="!session.schema?.views.backups" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <nav class="crumbs" :aria-label="t('list.breadcrumb')">
      <span>{{ t('nav.globals') }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
      <span class="current">{{ t('backups.title') }}</span>
    </nav>
    <header class="page-header">
      <div>
        <h1>{{ t('backups.title') }}</h1>
        <p class="muted">{{ t('backups.lead') }}</p>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!data || !!data.settings.unavailable || busy || starting"
        @click="backUpNow"
      >
        <DatabaseBackup :size="16" aria-hidden="true" />
        {{ busy ? t('backups.inProgress') : t('backups.now') }}
      </button>
    </header>

    <p v-if="failed" class="field-error">{{ failed }}</p>
    <PanelSkeleton v-else-if="showSkeleton" />
    <template v-else-if="!data" />
    <template v-else>
      <p v-if="data.settings.unavailable" class="warning" role="alert">
        <TriangleAlert :size="16" aria-hidden="true" />
        <span>{{ data.settings.unavailable }}</span>
      </p>
      <p v-else-if="local" class="warning">
        <TriangleAlert :size="16" aria-hidden="true" />
        <span>{{ t('backups.localWarning', { dir: data.settings.dir ?? 'backups' }) }}</span>
      </p>

      <div class="grid">
        <section class="card panel" aria-labelledby="settings-heading">
          <h2 id="settings-heading">{{ t('backups.settings') }}</h2>
          <form class="settings-form" novalidate @submit.prevent="saveSettings">
            <div class="row">
              <label>
                <span>{{ t('backups.schedule') }}</span>
                <select v-model="form.frequency" class="input" :disabled="locked('frequency')">
                  <option value="">{{ t('backups.manualOnly') }}</option>
                  <option value="daily">{{ t('backups.daily') }}</option>
                  <option value="weekly">{{ t('backups.weekly') }}</option>
                </select>
                <small v-if="locked('frequency')" class="muted">{{ t('backups.setInCode') }}</small>
              </label>
              <label>
                <span>{{ t('backups.time') }}</span>
                <input v-model="form.at" type="time" class="input" :disabled="locked('at') || !form.frequency" />
                <small v-if="formErrors.at" class="field-error">{{ formErrors.at }}</small>
                <small v-else-if="locked('at')" class="muted">{{ t('backups.setInCode') }}</small>
              </label>
              <label>
                <span>{{ t('backups.keep') }}</span>
                <input v-model.number="form.keep" type="number" min="1" max="1000" class="input" :disabled="locked('keep')" />
                <small v-if="formErrors.keep" class="field-error">{{ formErrors.keep }}</small>
                <small v-else-if="locked('keep')" class="muted">{{ t('backups.setInCode') }}</small>
              </label>
            </div>
            <fieldset>
              <legend>{{ t('backups.where') }}</legend>
              <label class="place">
                <input v-model="form.server" type="checkbox" />
                <span>{{ t('backups.thisServer') }} <span class="muted">({{ data.settings.storage }}<template v-if="data.settings.dir">, <code>{{ data.settings.dir }}/</code></template>)</span></span>
              </label>
              <label v-for="place in data.places" :key="place.id" class="place">
                <input v-model="form.destinations[place.id]!.on" type="checkbox" />
                <span>{{ place.label }}</span>
                <input
                  v-if="form.destinations[place.id]?.on"
                  v-model="form.destinations[place.id]!.keep"
                  type="number"
                  min="1"
                  max="1000"
                  class="input keep-input"
                  :placeholder="String(form.keep)"
                  :aria-label="t('backups.keepAt', { place: place.label })"
                />
              </label>
              <p v-if="data.places.length === 0" class="muted small">
                {{ t('backups.noPlaces') }}
                <RouterLink to="/integrations?category=backups">{{ t('backups.connectPlace') }}</RouterLink>
              </p>
              <small v-if="formErrors.server" class="field-error">{{ formErrors.server }}</small>
            </fieldset>
            <p v-if="unencrypted" class="warning" role="note">
              <TriangleAlert :size="16" aria-hidden="true" />
              <span>{{ t('backups.unencrypted') }}</span>
            </p>
            <button type="submit" class="btn btn-primary btn-sm" :disabled="saving">{{ t('backups.saveSettings') }}</button>
          </form>
          <dl>
            <dt>{{ t('status.database') }}</dt>
            <dd>{{ data.settings.database }}</dd>
          </dl>
          <p class="note muted">{{ t('backups.configNote') }} {{ t('backups.uploadsNote') }}</p>
        </section>

        <section class="card panel" aria-labelledby="restore-heading">
          <h2 id="restore-heading">{{ t('backups.restore') }}</h2>
          <p class="note">{{ t('backups.restoreText') }}</p>
          <pre><code>gunzip &lt;file&gt;.db.gz</code></pre>
          <a :href="docs" target="_blank" rel="noopener">{{ t('backups.restoreHow') }}</a>
        </section>
      </div>

      <section class="card list" aria-labelledby="list-heading">
        <h2 id="list-heading">{{ t('backups.list') }}</h2>
        <p v-if="data.backups.length === 0" class="empty muted">{{ t('backups.none') }}</p>
        <ul v-else>
          <li v-for="backup in data.backups" :key="String(backup.id)" class="item">
            <div class="item-main">
              <strong>{{ formatDate(backup.startedAt ?? backup.finishedAt) }}</strong>
              <span :class="['badge', `state-${backup.state}`]">{{ t(STATES[backup.state]) }}</span>
              <span class="muted">
                {{ backup.trigger === 'scheduled' ? t('backups.scheduled') : t('backups.manual', { who: backup.author ?? '—' }) }}
                <template v-if="backup.size !== null"> · {{ formatBytes(backup.size) }}</template>
              </span>
              <span v-if="backup.filename" class="filename"><code>{{ backup.filename }}</code></span>
              <span v-if="backup.state === 'done'" class="copies">
                <span v-for="[place, copy] in copyList(backup)" :key="place" :class="['copy', `copy-${copy.state}`]">
                  {{ placeLabel(place) }}:
                  <template v-if="copy.state === 'done'">{{ t('backups.copyDone') }}</template>
                  <template v-else-if="copy.state === 'retrying'">{{ t('backups.copyRetrying', { time: formatDate(copy.nextAt ?? null) }) }}</template>
                  <template v-else>{{ t('backups.copyFailed', { error: copy.error ?? '' }) }}</template>
                  <a v-if="copy.link" :href="copy.link" target="_blank" rel="noopener" :aria-label="t('backups.openAt', { place: placeLabel(place) })">
                    <ExternalLink :size="12" aria-hidden="true" />
                  </a>
                </span>
              </span>
              <span v-if="backup.error" class="error">{{ backup.error }}</span>
              <span v-if="backup.downloadedBy" class="muted small">
                {{ t('backups.downloadedBy', { who: backup.downloadedBy, date: formatDate(backup.downloadedAt) }) }}
              </span>
            </div>
            <div class="item-actions">
              <a v-if="backup.state === 'done'" class="btn btn-sm" :href="downloadUrl(backup)" download @click="afterDownload">
                <Download :size="14" aria-hidden="true" />
                {{ t('backups.download') }}
              </a>
              <button
                v-if="backup.state === 'done' || backup.state === 'failed'"
                type="button"
                class="btn btn-sm btn-ghost btn-icon"
                :aria-label="t('backups.delete')"
                @click="deleting = backup"
              >
                <Trash2 :size="14" aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>
      </section>

      <ConfirmDialog
        :open="deleting !== null"
        :message="t('backups.confirmDelete', { file: deleting?.filename ?? '' })"
        :confirm-label="t('backups.delete')"
        @confirm="remove"
        @cancel="deleting = null"
      />
    </template>
  </template>
</template>

<style scoped>
.settings-form {
  display: grid;
  gap: 0.9rem;
  margin-bottom: 1rem;
}
.settings-form .row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.75rem;
}
.settings-form label {
  display: grid;
  gap: 0.3rem;
}
.settings-form fieldset {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  border: 0;
}
.settings-form legend {
  margin-bottom: 0.4rem;
  font-weight: 600;
}
.settings-form .place {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.keep-input {
  width: 5.5rem;
  margin-left: auto;
}
.settings-form button {
  justify-self: start;
}
.copies {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  font-size: 0.8125rem;
}
.copy-done {
  color: var(--success, var(--text-muted));
}
.copy-retrying {
  color: var(--warning, var(--text-muted));
}
.copy-failed {
  color: var(--danger);
}
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
  margin-bottom: 1.25rem;
}
.page-header p {
  margin: 0.3rem 0 0;
}
.warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.875rem;
}
.warning svg {
  flex: none;
  margin-top: 0.1rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
  margin-bottom: 1rem;
}
.panel {
  padding: 1rem 1.1rem 1.1rem;
  min-width: 0;
}
.panel h2,
.list h2 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.45rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}
dt {
  color: var(--faint);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.note {
  margin: 0.9rem 0 0;
  font-size: 0.85rem;
}
pre {
  margin: 0.6rem 0;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 0.8rem;
  overflow-x: auto;
}
.list {
  padding: 1rem 0 0.25rem;
}
.list h2 {
  margin: 0 1.1rem 0.5rem;
}
.empty {
  margin: 0;
  padding: 0.5rem 1.1rem 1rem;
}
.list ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
  padding: 0.75rem 1.1rem;
  border-top: 1px solid var(--border);
}
.item-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.75rem;
  min-width: 0;
  font-size: 0.875rem;
}
.item-actions {
  display: flex;
  gap: 0.35rem;
}
.filename code {
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
.error {
  flex-basis: 100%;
  color: var(--danger);
}
.small {
  flex-basis: 100%;
  font-size: 0.8rem;
}
.state-done {
  background: var(--success-soft);
  color: var(--ok);
}
.state-failed {
  background: var(--danger-soft);
  color: var(--danger);
}
.state-pending,
.state-running {
  background: var(--info-soft);
  color: var(--info);
}
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
