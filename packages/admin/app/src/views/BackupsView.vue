<script setup lang="ts">
import type { AdminBackup, AdminBackups } from '@easy-cms/core'
import { ChevronRight, DatabaseBackup, Download, Trash2, TriangleAlert } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { ApiError, api } from '../lib/api'
import { formatBytes, formatDate, locale, t } from '../lib/i18n'
import { session } from '../lib/session'
import { settings } from '../lib/settings'
import { notify } from '../lib/toast'

/** Settings → Backups (admins): the schedule, the backups, back up now, download, delete. */
const data = ref<AdminBackups | null>(null)
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
  if (!s?.every) return t('backups.manualOnly')
  return t(s.every === 'day' ? 'backups.everyDay' : 'backups.everyWeek', { at: s.at })
})
const local = computed(() => data.value?.settings.storage === 'local')
const docs = computed(
  () =>
    `https://maritonx.github.io/easy-cms${locale.value === 'th' ? '/th' : ''}/guide/backups#from-the-admin`,
)
const STATES = {
  pending: 'backups.pending',
  running: 'backups.running',
  done: 'backups.done',
  failed: 'backups.failed',
} as const
</script>

<template>
  <p v-if="session.user?.role !== 'admin'" class="notice">{{ t('common.notFound') }}</p>
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
    <p v-else-if="!data" class="muted">{{ t('common.loading') }}</p>
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
          <dl>
            <dt>{{ t('backups.schedule') }}</dt>
            <dd>{{ schedule }}</dd>
            <dt>{{ t('backups.keep') }}</dt>
            <dd>{{ t('backups.keepCount', { count: data.settings.keep }) }}</dd>
            <dt>{{ t('backups.storage') }}</dt>
            <dd>
              {{ data.settings.storage }}
              <code v-if="data.settings.dir">{{ data.settings.dir }}/</code>
            </dd>
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
