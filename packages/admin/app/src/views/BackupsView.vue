<script setup lang="ts">
import type { AdminBackup, AdminBackups } from '@easy-cms/core'
import {
  ChevronRight,
  Clock,
  Copy,
  DatabaseBackup,
  Download,
  Ellipsis,
  ExternalLink,
  Lock,
  Plus,
  TriangleAlert,
  X,
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import PanelSkeleton from '../components/PanelSkeleton.vue'
import { ApiError, api } from '../lib/api'
import { formatBytes, formatDate, locale, t } from '../lib/i18n'
import { useDelayedLoading } from '../lib/loading'
import { session } from '../lib/session'
import { settings } from '../lib/settings'
import { notify } from '../lib/toast'

/**
 * Settings → Backups (admins): a one-line summary of when and where (edited in a drawer), the
 * backups with where each one is, and how to restore one, with its file's own commands.
 */
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
const locked = (field: 'frequency' | 'at' | 'keep') =>
  data.value?.settings.locked.includes(field) ?? false
const scheduleLocked = computed(() => locked('frequency') || locked('at'))
/** The code's schedule, said the way the summary says it. */
const codeSchedule = computed(() => {
  const d = data.value?.settings.defaults
  if (!d?.frequency) return t('backups.manualOnly')
  return t(d.frequency === 'daily' ? 'backups.everyDay' : 'backups.everyWeek', { at: d.at })
})
const scheduleInCode = computed(() =>
  ['frequency', 'at'].some((f) => data.value?.settings.inCode.includes(f as 'frequency')),
)
/** The drawer's schedule is the code's: the same frequency, and the same time when it runs. */
const scheduleIsCode = computed(() => {
  const d = data.value?.settings.defaults
  if (!d) return true
  return (form.value.frequency || null) === d.frequency && (!d.frequency || form.value.at === d.at)
})
const keepIsCode = computed(() => Number(form.value.keep) === data.value?.settings.defaults.keep)
function useCodeSchedule() {
  const d = data.value?.settings.defaults
  if (!d) return
  form.value.frequency = d.frequency ?? ''
  form.value.at = d.at
}
function useCodeKeep() {
  const d = data.value?.settings.defaults
  if (d) form.value.keep = d.keep
}
const placeLabel = (id: string) =>
  id === 'server'
    ? t('backups.thisServer')
    : (data.value?.places.find((p) => p.id === id)?.label ?? id)
const copyList = (backup: AdminBackup) =>
  Object.entries(backup.copies ?? {}).filter(([, c]) => c.state !== 'removed')

/** Where backups go now, how many each keeps, and how the latest one went there. */
const places = computed(() => {
  const s = data.value?.settings
  if (!s) return []
  const latest = data.value?.backups.find((b) => b.state === 'done')?.copies ?? {}
  const out: { id: string; keep: number; state?: string }[] = []
  if (s.server || s.destinations.length === 0)
    out.push({
      id: 'server',
      keep: s.keep,
      ...(latest.server ? { state: latest.server.state } : {}),
    })
  for (const d of s.destinations) {
    const copy = latest[d.connection]
    out.push({ id: d.connection, keep: d.keep ?? s.keep, ...(copy ? { state: copy.state } : {}) })
  }
  return out
})

const docs = computed(
  () => `https://easycms.dev${locale.value === 'th' ? '/th' : ''}/docs/backups#from-the-admin`,
)

/** One bar of what needs doing, a line each; gone once nothing does. */
const alerts = computed(() => {
  const s = data.value?.settings
  if (!s) return []
  const out: { text: string; href?: string; fix?: string }[] = []
  if (s.unavailable) out.push({ text: s.unavailable })
  else if (s.storage === 'local' && s.server && s.destinations.length === 0)
    out.push({
      text: t('backups.localWarning', { dir: s.dir ?? 'backups' }),
      href: '/integrations?category=backups',
      fix: t('backups.connectPlace'),
    })
  if (!s.encrypted && s.destinations.length > 0)
    out.push({
      text: t('backups.unencryptedShort'),
      href: docs.value,
      fix: t('backups.howToEncrypt'),
    })
  return out
})

// The settings drawer: what the config sets is the default; what it locks is shown, not changed.
const drawer = ref<HTMLDialogElement>()
const editing = ref(false)
const form = ref({
  frequency: '' as '' | 'daily' | 'weekly',
  at: '03:00',
  keep: 7,
  server: true,
  destinations: {} as Record<string, { on: boolean; keep: string }>,
})
const formErrors = ref<Record<string, string>>({})
const saving = ref(false)
function fill(value: AdminBackups) {
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
}
watch(data, (value) => {
  if (value && !editing.value) fill(value)
})
async function openSettings() {
  if (data.value) fill(data.value)
  formErrors.value = {}
  editing.value = true
  await nextTick()
  drawer.value?.showModal()
}
function closeSettings() {
  editing.value = false
  drawer.value?.close()
}
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
    closeSettings()
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.errors.length)
      for (const item of e.errors) formErrors.value[item.field ?? ''] = item.message
    else notify('error', (e as Error).message)
  } finally {
    saving.value = false
  }
}

// A row's menu, and how to restore a backup: its own commands to copy.
const menu = ref<AdminBackup['id'] | null>(null)
function onDocumentClick(event: MouseEvent) {
  if (menu.value !== null && !(event.target as Element).closest?.('.row-menu')) menu.value = null
}
onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
const restoreDialog = ref<HTMLDialogElement>()
const restoring = ref<AdminBackup | null>(null)
async function showRestore(backup: AdminBackup | null) {
  menu.value = null
  restoring.value = backup ?? data.value?.backups.find((b) => b.state === 'done') ?? null
  await nextTick()
  restoreDialog.value?.showModal()
}
const restoreFile = computed(() => restoring.value?.filename ?? '<file>.db.gz')
const unpacked = computed(() => restoreFile.value.replace(/\.gz(\.enc)?$/, ''))
const sqlite = computed(() => data.value?.settings.database === 'sqlite')
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify('success', t('integrations.copied'))
  } catch (e) {
    notify('error', (e as Error).message)
  }
}

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
      <div v-if="alerts.length" class="alerts" role="note" :aria-label="t('backups.attention')">
        <p v-for="alert in alerts" :key="alert.text">
          <TriangleAlert :size="15" aria-hidden="true" />
          <span>{{ alert.text }}</span>
          <template v-if="alert.href && alert.fix">
            <RouterLink v-if="alert.href.startsWith('/')" :to="alert.href">{{ alert.fix }} →</RouterLink>
            <a v-else :href="alert.href" target="_blank" rel="noopener">{{ alert.fix }} →</a>
          </template>
        </p>
      </div>

      <section class="card summary" :aria-label="t('backups.settings')">
        <span class="when">
          <Clock :size="15" aria-hidden="true" />
          {{ schedule }}
          <Lock v-if="scheduleLocked" :size="13" class="lock" :aria-label="t('backups.setInCode')" />
        </span>
        <span class="sep" aria-hidden="true" />
        <ul class="chips" :aria-label="t('backups.where')">
          <li v-for="place in places" :key="place.id" class="chip">
            <span v-if="place.state" :class="['dot', `dot-${place.state}`]" aria-hidden="true" />
            {{ placeLabel(place.id) }}
            <span class="muted">· {{ place.keep }}</span>
          </li>
        </ul>
        <button type="button" class="btn btn-sm" @click="openSettings">{{ t('backups.edit') }}</button>
      </section>

      <section class="card list" aria-labelledby="list-heading">
        <div class="list-head">
          <h2 id="list-heading">{{ t('backups.list') }}</h2>
          <button v-if="data.backups.some((b) => b.state === 'done')" type="button" class="link" @click="showRestore(null)">{{ t('backups.restoreHow') }}</button>
        </div>
        <p v-if="data.backups.length === 0" class="empty muted">{{ t('backups.none') }}</p>
        <ul v-else>
          <li v-for="backup in data.backups" :key="String(backup.id)" class="item">
            <div class="item-main">
              <div class="top">
                <strong>{{ formatDate(backup.startedAt ?? backup.finishedAt) }}</strong>
                <span :class="['badge', `state-${backup.state}`]">{{ t(STATES[backup.state]) }}</span>
                <span class="muted">
                  {{ backup.trigger === 'scheduled' ? t('backups.scheduled') : t('backups.manual', { who: backup.author ?? '—' }) }}
                  <template v-if="backup.size !== null"> · {{ formatBytes(backup.size) }}</template>
                </span>
                <code v-if="backup.filename" class="filename">{{ backup.filename }}</code>
              </div>
              <div v-if="backup.state === 'done'" class="copies">
                <span v-for="[place, copy] in copyList(backup)" :key="place" :class="['copy', `copy-${copy.state}`]">
                  <span :class="['dot', `dot-${copy.state}`]" aria-hidden="true" />
                  {{ placeLabel(place) }}:
                  <template v-if="copy.state === 'done'">{{ t('backups.copyDone') }}</template>
                  <template v-else-if="copy.state === 'retrying'">{{ t('backups.copyRetrying', { time: formatDate(copy.nextAt ?? null) }) }}</template>
                  <template v-else>{{ t('backups.copyFailed', { error: copy.error ?? '' }) }}</template>
                  <a v-if="copy.link" :href="copy.link" target="_blank" rel="noopener" :aria-label="t('backups.openAt', { place: placeLabel(place) })">
                    <ExternalLink :size="12" aria-hidden="true" />
                  </a>
                </span>
              </div>
              <p v-if="backup.error" class="error">{{ backup.error }}</p>
              <p v-if="backup.downloadedBy" class="muted small">
                {{ t('backups.downloadedBy', { who: backup.downloadedBy, date: formatDate(backup.downloadedAt) }) }}
              </p>
            </div>
            <div class="item-actions">
              <a v-if="backup.state === 'done'" class="btn btn-sm" :href="downloadUrl(backup)" download @click="afterDownload">
                <Download :size="14" aria-hidden="true" />
                {{ t('backups.download') }}
              </a>
              <div v-if="backup.state === 'done' || backup.state === 'failed'" class="row-menu">
                <button
                  type="button"
                  class="btn btn-sm btn-ghost btn-icon"
                  :aria-label="t('backups.more')"
                  :aria-expanded="menu === backup.id"
                  aria-haspopup="menu"
                  @click="menu = menu === backup.id ? null : backup.id"
                >
                  <Ellipsis :size="15" aria-hidden="true" />
                </button>
                <div v-if="menu === backup.id" class="menu" role="menu">
                  <button v-if="backup.state === 'done'" type="button" role="menuitem" @click="showRestore(backup)">{{ t('backups.restoreHow') }}</button>
                  <button
                    type="button"
                    role="menuitem"
                    class="danger"
                    @click="
                      menu = null;
                      deleting = backup
                    "
                  >
                    {{ t('backups.delete') }}
                  </button>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <footer class="foot muted">
        {{ t('status.database') }} {{ data.settings.database }} · {{ t('backups.configNote') }} {{ t('backups.uploadsNote') }}
      </footer>

      <dialog ref="drawer" class="drawer" aria-labelledby="drawer-title" @cancel.prevent="closeSettings" @close="editing && closeSettings()">
        <form v-if="editing" class="drawer-body" novalidate @submit.prevent="saveSettings">
          <header>
            <h2 id="drawer-title">{{ t('backups.settingsTitle') }}</h2>
            <button type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('integrations.close')" @click="closeSettings"><X :size="18" aria-hidden="true" /></button>
          </header>
          <div class="fields">
            <fieldset>
              <legend>{{ t('backups.whenTitle') }}</legend>
              <p v-if="scheduleLocked" class="locked"><Lock :size="13" aria-hidden="true" /> {{ schedule }} <span class="muted small">{{ t('backups.setInCode') }}</span></p>
              <div v-else class="inline">
                <select v-model="form.frequency" class="input" :aria-label="t('backups.schedule')">
                  <option value="">{{ t('backups.manualOnly') }}</option>
                  <option value="daily">{{ t('backups.daily') }}</option>
                  <option value="weekly">{{ t('backups.weekly') }}</option>
                </select>
                <label v-if="form.frequency" class="inline">
                  <span>{{ t('backups.time') }}</span>
                  <input v-model="form.at" type="time" class="input time" />
                </label>
              </div>
              <small v-if="!scheduleLocked && scheduleInCode" class="muted small code-default">
                <template v-if="scheduleIsCode">{{ t('backups.codeDefault') }}</template>
                <template v-else>{{ t('backups.inCodeValue', { value: codeSchedule }) }} · <button type="button" class="link" @click="useCodeSchedule">{{ t('backups.useCode') }}</button></template>
              </small>
              <small v-if="formErrors.at" class="field-error">{{ formErrors.at }}</small>
            </fieldset>
            <fieldset>
              <legend>{{ t('backups.whereTitle') }}</legend>
              <label class="place">
                <input v-model="form.server" type="checkbox" />
                <span class="grow">{{ t('backups.thisServer') }}<small>{{ data.settings.storage }}<template v-if="data.settings.dir"> · {{ data.settings.dir }}/</template></small></span>
                <span v-if="locked('keep')" class="locked small"><Lock :size="12" aria-hidden="true" /> {{ data.settings.keep }}</span>
                <span v-else class="keep">
                  <input v-model.number="form.keep" type="number" min="1" max="1000" class="input" :aria-label="t('backups.keep')" />
                  {{ t('backups.files') }}
                </span>
              </label>
              <label v-for="place in data.places" :key="place.id" class="place">
                <input v-model="form.destinations[place.id]!.on" type="checkbox" />
                <span class="grow">{{ place.label }}</span>
                <span class="keep">
                  <input
                    v-model="form.destinations[place.id]!.keep"
                    type="number"
                    min="1"
                    max="1000"
                    class="input"
                    :disabled="!form.destinations[place.id]?.on"
                    :placeholder="String(form.keep)"
                    :aria-label="t('backups.keepAt', { place: place.label })"
                  />
                  {{ t('backups.files') }}
                </span>
              </label>
              <small v-if="!locked('keep') && data.settings.inCode.includes('keep')" class="muted small code-default">
                <template v-if="keepIsCode">{{ t('backups.keepCodeDefault') }}</template>
                <template v-else>{{ t('backups.keepInCode', { n: data.settings.defaults.keep }) }} · <button type="button" class="link" @click="useCodeKeep">{{ t('backups.useCode') }}</button></template>
              </small>
              <RouterLink to="/integrations?category=backups" class="connect"><Plus :size="14" aria-hidden="true" /> {{ t('backups.connectPlace') }}</RouterLink>
              <small v-if="formErrors.keep" class="field-error">{{ formErrors.keep }}</small>
              <small v-if="formErrors.server" class="field-error">{{ formErrors.server }}</small>
            </fieldset>
            <p v-if="unencrypted" class="warning" role="note">
              <TriangleAlert :size="15" aria-hidden="true" />
              <span>{{ t('backups.unencrypted') }}</span>
            </p>
          </div>
          <footer>
            <button type="button" class="btn" @click="closeSettings">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ t('backups.saveSettings') }}</button>
          </footer>
        </form>
      </dialog>

      <dialog ref="restoreDialog" class="dialog card" aria-labelledby="restore-title" @cancel.prevent="restoreDialog?.close()">
        <h2 id="restore-title">{{ t('backups.restoreTitle', { date: formatDate(restoring?.startedAt ?? restoring?.finishedAt ?? null) }) }}</h2>
        <p class="muted small">{{ t('backups.restoreLead') }}</p>
        <ol>
          <li>
            {{ t('backups.restoreStep1') }}
            <template v-if="restoreFile.endsWith('.enc')">
              <span class="muted small">{{ t('backups.restoreDecrypt') }}</span>
              <span class="code"><code>npx easy-cms backup:decrypt {{ restoreFile }}</code><button type="button" class="btn btn-sm btn-icon" :aria-label="t('integrations.copy')" @click="copy(`npx easy-cms backup:decrypt ${restoreFile}`)"><Copy :size="14" aria-hidden="true" /></button></span>
            </template>
          </li>
          <li>
            {{ t('backups.restoreStep2') }}
            <span class="code"><code>gunzip {{ unpacked }}.gz</code><button type="button" class="btn btn-sm btn-icon" :aria-label="t('integrations.copy')" @click="copy(`gunzip ${unpacked}.gz`)"><Copy :size="14" aria-hidden="true" /></button></span>
          </li>
          <li v-if="sqlite">{{ t('backups.restoreSqlite', { file: unpacked }) }}</li>
          <li v-else>
            {{ t('backups.restoreCopy', { database: data.settings.database }) }}
            <span class="code"><code>db: sqlite({ url: 'file:./{{ unpacked }}' })</code><button type="button" class="btn btn-sm btn-icon" :aria-label="t('integrations.copy')" @click="copy(`db: sqlite({ url: 'file:./${unpacked}' })`)"><Copy :size="14" aria-hidden="true" /></button></span>
          </li>
        </ol>
        <div class="dialog-foot">
          <a :href="docs" target="_blank" rel="noopener">{{ t('backups.restoreGuide') }} <ExternalLink :size="12" aria-hidden="true" /></a>
          <button type="button" class="btn" @click="restoreDialog?.close()">{{ t('integrations.close') }}</button>
        </div>
      </dialog>

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
/* What needs doing: one bar, a line each. */
.alerts {
  display: grid;
  gap: 0.35rem;
  margin: 0 0 1rem;
  padding: 0.65rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.875rem;
}
.alerts p {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.15rem 0.5rem;
  margin: 0;
}
.alerts svg {
  margin-top: 0.15rem;
}
.alerts a {
  grid-column: 2;
  justify-self: start;
  color: inherit;
  font-weight: 600;
}
/* When and where, in a line. */
.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
  margin-bottom: 1rem;
  padding: 0.8rem 1rem;
}
.when {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}
.lock {
  color: var(--faint);
}
.sep {
  align-self: stretch;
  width: 1px;
  background: var(--border);
}
.chips {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.8125rem;
}
.dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--faint);
}
.dot-done {
  background: var(--ok, #15803d);
}
.dot-retrying {
  background: var(--warning-text, #c2410c);
}
.dot-failed {
  background: var(--danger);
}
/* The backups. */
.list {
  padding: 0.25rem 0;
}
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.1rem 0.4rem;
}
.list h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}
.link {
  border: 0;
  background: none;
  color: var(--brand);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.empty {
  margin: 0;
  padding: 0.5rem 1.1rem 1rem;
}
.code-default {
  display: block;
  margin-top: 0.35rem;
}
.code-default .link {
  padding: 0;
  font-size: inherit;
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
  display: grid;
  gap: 0.3rem;
  min-width: 0;
  font-size: 0.875rem;
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.75rem;
}
.filename {
  font-size: 0.78rem;
  color: var(--faint);
  overflow-wrap: anywhere;
}
.copies {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.copy {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.copy-failed {
  color: var(--danger);
}
.item-main p {
  margin: 0;
}
.error {
  color: var(--danger);
}
.small {
  font-size: 0.8rem;
}
.item-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.row-menu {
  position: relative;
}
.menu {
  position: absolute;
  top: calc(100% + 0.3rem);
  right: 0;
  z-index: 10;
  min-width: 10rem;
  padding: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.menu button {
  display: block;
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}
.menu button:hover {
  background: var(--surface-2);
}
.menu .danger {
  color: var(--danger);
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
.foot {
  margin: 0.9rem 0 0;
  font-size: 0.8rem;
}
/* The settings drawer. */
.drawer {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(28rem, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.drawer::backdrop {
  background: rgb(0 0 0 / 30%);
}
.drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.drawer-body header,
.drawer-body footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.9rem 1.1rem;
}
.drawer-body header {
  border-bottom: 1px solid var(--border);
}
.drawer-body header h2 {
  margin: 0;
  font-size: 1.05rem;
}
.drawer-body footer {
  justify-content: flex-end;
  margin-top: auto;
  border-top: 1px solid var(--border);
}
.fields {
  display: grid;
  gap: 1.25rem;
  padding: 1.1rem;
  overflow: auto;
}
fieldset {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: 0.45rem;
  font-weight: 600;
}
.inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.time {
  width: 7rem;
}
.locked {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  color: var(--text-muted);
}
.place {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.place .grow {
  flex: 1;
  min-width: 0;
}
.place small {
  display: block;
  color: var(--text-muted);
  font-size: 0.75rem;
}
.keep {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.keep .input {
  width: 4.75rem;
}
.connect {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--brand);
  font-size: 0.85rem;
}
.warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  padding: 0.65rem 0.8rem;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.85rem;
}
/* How to restore. */
.dialog {
  width: min(36rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.dialog h2 {
  margin: 0 0 0.3rem;
  font-size: 1.05rem;
}
.dialog ol {
  display: grid;
  gap: 0.8rem;
  margin: 0.9rem 0 1.1rem;
  padding-left: 1.2rem;
  font-size: 0.9rem;
}
.dialog ol .small {
  display: block;
}
.code {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.35rem;
  padding: 0.4rem 0.4rem 0.4rem 0.65rem;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.code code {
  flex: 1;
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
.dialog-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.dialog-foot a {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--brand);
  font-size: 0.875rem;
}
@media (max-width: 640px) {
  .sep {
    display: none;
  }
}
</style>
