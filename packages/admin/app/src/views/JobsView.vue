<script setup lang="ts">
import type { AdminJob, AdminJobs, AdminScheduledJob } from '@easy-cms/core'
import {
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleX,
  LoaderCircle,
  Pause,
  Play,
  TriangleAlert,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import JobScheduleDialog from '../components/JobScheduleDialog.vue'
import PanelSkeleton from '../components/PanelSkeleton.vue'
import { ApiError, api, type Doc } from '../lib/api'
import { titleOf } from '../lib/fields'
import { formatDate, label, locale, t } from '../lib/i18n'
import { useDelayedLoading } from '../lib/loading'
import { session } from '../lib/session'
import { notify } from '../lib/toast'

/** Settings → Jobs: the config's jobs with their last run, and the scheduled-publish queue. */
const data = ref<AdminJobs | null>(null)
/** A skeleton while the page loads (only when it is slow). */
const showSkeleton = useDelayedLoading(() => !data.value)
const running = ref(false)
/** Titles of the documents in the queue, by `collection:id`. */
const titles = ref<Record<string, string>>({})

async function load() {
  try {
    data.value = await api<AdminJobs>('GET', '/admin/jobs')
    void loadTitles(data.value.scheduled ?? [])
  } catch (e) {
    notify('error', e instanceof ApiError ? e.message : String(e))
  }
}
onMounted(load)

const key = (job: AdminScheduledJob) => `${job.collection}:${job.doc}`
async function loadTitles(jobs: AdminScheduledJob[]) {
  await Promise.all(
    jobs
      .filter((job) => job.collection && !(key(job) in titles.value))
      .map(async (job) => {
        const collection = session.schema?.collections.find((c) => c.slug === job.collection)
        try {
          const doc = await api<Doc>('GET', `/${job.collection}/${job.doc}?depth=0&draft=true`)
          titles.value[key(job)] = titleOf(collection, doc)
        } catch {
          titles.value[key(job)] = `#${job.doc}`
        }
      }),
  )
}

async function runNow() {
  running.value = true
  try {
    const result = await api<{
      scheduled: { ran: number; failed: number }
      webhooks: { sent: number; failed: number }
      emails: { sent: number; failed: number }
      jobs: { ran: number; failed: number }
    }>('POST', '/admin/jobs/run')
    const failed =
      result.scheduled.failed + result.jobs.failed + result.webhooks.failed + result.emails.failed
    notify(
      failed ? 'error' : 'success',
      t('jobs.ran', {
        jobs: result.jobs.ran,
        scheduled: result.scheduled.ran,
        sent: result.webhooks.sent + result.emails.sent,
        failed,
      }),
    )
    await load()
  } catch (e) {
    notify('error', e instanceof ApiError ? e.message : String(e))
  } finally {
    running.value = false
  }
}

const views = session.schema?.views

// Pausing and schedules (admins of the whole system; `canChange`).
const changing = ref<string | null>(null)
const editing = ref<AdminJob | null>(null)
/** Pausing stops a job until someone resumes it: asked first. */
const confirmingPause = ref<AdminJob | null>(null)
const STATUS_ICON = { ok: CircleCheck, failed: CircleX, running: LoaderCircle }
async function change(job: AdminJob, body: Record<string, unknown>, done: string) {
  changing.value = job.name
  try {
    data.value = await api<AdminJobs>('PATCH', `/admin/jobs/${encodeURIComponent(job.name)}`, body)
    notify('success', done)
    editing.value = null
  } catch (e) {
    notify('error', e instanceof ApiError ? e.message : String(e))
  } finally {
    changing.value = null
  }
}
const togglePause = (job: AdminJob) =>
  change(
    job,
    { paused: !job.paused },
    t(job.paused ? 'jobs.resumed' : 'jobs.pausedDone', { name: job.name }),
  )

// Two tabs, Jobs and Scheduled publishing, kept in the address (`?tab=scheduled`) so links (e.g.
// from the dashboard) open the right one. With only one of them there are no tabs.
type Tab = 'jobs' | 'scheduled'
const route = useRoute()
const router = useRouter()
const tabs = computed<Tab[]>(() => {
  if (!data.value) return []
  const list: Tab[] = []
  if (data.value.jobs.length > 0 || !data.value.scheduled) list.push('jobs')
  if (data.value.scheduled) list.push('scheduled')
  return list
})
const tab = computed<Tab>(() => {
  const wanted: Tab = route.query.tab === 'scheduled' ? 'scheduled' : 'jobs'
  return tabs.value.includes(wanted) ? wanted : (tabs.value[0] ?? 'jobs')
})
const setTab = (next: Tab) =>
  void router.replace({ query: { ...route.query, tab: next === 'jobs' ? undefined : next } })
const failedJobs = computed(
  () => data.value?.jobs.filter((j) => j.lastStatus === 'failed').length ?? 0,
)
const failedScheduled = computed(
  () => data.value?.scheduled?.filter((j) => j.state === 'failed').length ?? 0,
)
const every = (job: AdminJob) => {
  if (job.at) {
    const days = (job.every ?? 86_400) / 86_400
    return days === 1
      ? t('jobs.dailyAt', { at: job.at })
      : days === 7
        ? t('jobs.weeklyAt', { at: job.at })
        : t('jobs.daysAt', { count: days, at: job.at })
  }
  if (job.every === null) return t('jobs.everyRun')
  const s = job.every
  if (s === 86_400) return t('jobs.everyDay')
  if (s === 3_600) return t('jobs.everyHour')
  if (s === 60) return t('jobs.everyMinute')
  if (s % 86_400 === 0) return t('jobs.everyDays', { count: s / 86_400 })
  if (s % 3_600 === 0) return t('jobs.everyHours', { count: s / 3_600 })
  if (s % 60 === 0) return t('jobs.everyMinutes', { count: s / 60 })
  return t('jobs.everySeconds', { count: s })
}
/**
 * Within a day, `3 minutes ago` or `in 5 hours`, easier to read at a glance; further away, the
 * date and time. The full date is on hover either way.
 */
function ago(iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000)
  if (Math.abs(seconds) >= 86_400) return formatDate(iso)
  const format = new Intl.RelativeTimeFormat(locale.value === 'th' ? 'th' : 'en', {
    numeric: 'auto',
  })
  const abs = Math.abs(seconds)
  if (abs < 60) return format.format(seconds, 'second')
  if (abs < 3_600) return format.format(Math.round(seconds / 60), 'minute')
  return format.format(Math.round(seconds / 3_600), 'hour')
}
const codeSchedule = (job: AdminJob) => every({ ...job, every: job.code.every, at: job.code.at })
const duration = (ms: number | null) =>
  ms === null ? '' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
const target = (job: AdminScheduledJob) => {
  if (job.global) {
    const g = session.schema?.globals.find((x) => x.slug === job.global)
    return label(g?.label, job.global)
  }
  return titles.value[key(job)] ?? `#${job.doc}`
}
const kindOf = (job: AdminScheduledJob) => {
  if (job.global) return t('jobs.global')
  const c = session.schema?.collections.find((x) => x.slug === job.collection)
  return label(c?.labels?.singular, job.collection ?? '')
}
const link = (job: AdminScheduledJob) =>
  job.global ? `/globals/${job.global}` : `/collections/${job.collection}/${job.doc}`
const docs = computed(
  () => `https://easy-cms-website.vercel.app${locale.value === 'th' ? '/th' : ''}/docs/jobs`,
)
</script>

<template>
  <p v-if="!session.schema?.views.jobs" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <nav class="crumbs" :aria-label="t('list.breadcrumb')">
      <span>{{ t('nav.globals') }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
      <span class="current">{{ t('jobs.title') }}</span>
    </nav>
    <header class="page-header">
      <div>
        <h1>{{ t('jobs.title') }}</h1>
        <p class="muted">
          {{ t('jobs.lead') }}
          <a :href="docs" target="_blank" rel="noopener">{{ t('jobs.howItWorks') }}</a>
        </p>
      </div>
      <button type="button" class="btn" :disabled="running || !data" @click="runNow">
        <span v-if="running" class="spinner" aria-hidden="true" />
        <Play v-else :size="16" aria-hidden="true" />
        {{ running ? t('jobs.running') : t('jobs.runNow') }}
      </button>
    </header>

    <PanelSkeleton v-if="showSkeleton" />
    <template v-else-if="data">
      <div v-if="tabs.length > 1" class="segmented tabs" role="group" :aria-label="t('jobs.title')">
        <button type="button" :aria-pressed="tab === 'jobs'" @click="setTab('jobs')">
          {{ t('jobs.configJobs') }}
          <span class="count">{{ data.jobs.length }}</span>
          <span v-if="failedJobs" class="failed-count">{{ t('jobs.failedCount', { count: failedJobs }) }}</span>
        </button>
        <button type="button" :aria-pressed="tab === 'scheduled'" @click="setTab('scheduled')">
          {{ t('jobs.scheduled') }}
          <span class="count">{{ data.scheduled?.length ?? 0 }}</span>
          <span v-if="failedScheduled" class="failed-count">{{ t('jobs.failedCount', { count: failedScheduled }) }}</span>
        </button>
      </div>

      <section v-if="tab === 'jobs'" aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" class="visually-hidden">{{ t('jobs.configJobs') }}</h2>
        <p v-if="data.jobs.length === 0" class="card empty muted">{{ t('jobs.noJobs') }}</p>
        <ul v-else class="jobs">
          <li
            v-for="job in data.jobs"
            :key="job.name"
            :class="['card', 'job', { failed: job.lastStatus === 'failed', paused: job.paused }]"
          >
            <div class="job-head">
              <div class="job-title">
                <code class="job-name">{{ job.name }}</code>
                <span v-if="job.paused" class="pill paused">
                  <Pause :size="12" aria-hidden="true" />
                  {{ t('jobs.pausedTag') }}
                </span>
                <span v-if="job.lastStatus" :class="['pill', job.lastStatus]">
                  <component :is="STATUS_ICON[job.lastStatus]" :size="12" aria-hidden="true" />
                  {{ t(`jobs.status.${job.lastStatus}`) }}
                </span>
              </div>
              <div v-if="data.canChange" class="job-actions">
                <button
                  v-if="job.adminSchedule"
                  type="button"
                  class="btn btn-sm"
                  :disabled="changing !== null"
                  @click="editing = job"
                >
                  <CalendarClock :size="15" aria-hidden="true" />
                  {{ t('jobs.editSchedule') }}
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  :disabled="changing !== null"
                  @click="job.paused ? togglePause(job) : (confirmingPause = job)"
                >
                  <component :is="job.paused ? Play : Pause" :size="15" aria-hidden="true" />
                  {{ t(job.paused ? 'jobs.resume' : 'jobs.pause') }}
                </button>
              </div>
            </div>
            <dl class="job-meta">
              <div>
                <dt>{{ t('jobs.every') }}</dt>
                <dd>
                  {{ every(job) }}
                  <span
                    v-if="job.changed"
                    class="tag"
                    :title="t('jobs.changedBy', { by: job.changed.by ?? '—', at: job.changed.at ? formatDate(job.changed.at) : '' })"
                  >{{ t('jobs.setByAdmin') }}</span>
                  <span v-if="job.changed" class="muted small">
                    {{ t('jobs.inConfig', { schedule: codeSchedule(job) }) }}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{{ t('jobs.lastRun') }}</dt>
                <dd>
                  <time v-if="job.lastRunAt" :datetime="job.lastRunAt" :title="formatDate(job.lastRunAt)">{{ ago(job.lastRunAt) }}</time>
                  <template v-else>{{ t('jobs.never') }}</template>
                  <span v-if="job.lastDurationMs !== null && job.lastStatus !== 'running'" class="muted">
                    · {{ duration(job.lastDurationMs) }}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{{ t('jobs.next') }}</dt>
                <dd>
                  <template v-if="job.paused">
                    {{ t('jobs.pausedBy', { by: job.paused.by ?? '—', at: formatDate(job.paused.at) }) }}
                  </template>
                  <time v-else-if="job.nextAt" :datetime="job.nextAt" :title="formatDate(job.nextAt)">{{ ago(job.nextAt) }}</time>
                  <template v-else>{{ t('jobs.nextRun') }}</template>
                </dd>
              </div>
            </dl>
            <p v-if="job.lastError" class="job-error" role="note">
              <TriangleAlert :size="15" aria-hidden="true" />
              <code>{{ job.lastError }}</code>
            </p>
          </li>
        </ul>
        <p v-if="data.jobs.some((j) => j.at)" class="zone muted">
          {{ data.timeZone ? t('jobs.inZone', { zone: data.timeZone }) : t('jobs.serverZone') }}
        </p>
      </section>

      <ConfirmDialog
        :open="confirmingPause !== null"
        :message="t('jobs.confirmPause', { name: confirmingPause?.name ?? '' })"
        :confirm-label="t('jobs.pauseConfirm')"
        @confirm="confirmingPause && togglePause(confirmingPause); confirmingPause = null"
        @cancel="confirmingPause = null"
      />

      <JobScheduleDialog
        :job="editing"
        :time-zone="data.timeZone"
        :busy="changing !== null"
        @save="(schedule) => editing && change(editing, schedule, t('jobs.scheduleSaved', { name: editing.name }))"
        @reset="editing && change(editing, { every: null, at: null }, t('jobs.scheduleReset', { name: editing.name }))"
        @cancel="editing = null"
      />

      <section v-if="tab === 'scheduled' && data.scheduled" class="card panel" aria-labelledby="scheduled-heading">
        <h2 id="scheduled-heading">{{ t('jobs.scheduled') }}</h2>
        <p v-if="data.scheduled.length === 0" class="empty muted">{{ t('jobs.noScheduled') }}</p>
        <div v-else class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ t('jobs.when') }}</th>
                <th>{{ t('jobs.action') }}</th>
                <th>{{ t('jobs.document') }}</th>
                <th>{{ t('jobs.state') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="job in data.scheduled" :key="String(job.id)">
                <tr>
                  <td>{{ formatDate(job.runAt) }}</td>
                  <td>{{ t(job.action === 'publish' ? 'jobs.publish' : 'jobs.unpublish') }}</td>
                  <td>
                    <RouterLink :to="link(job)">{{ target(job) }}</RouterLink>
                    <span class="muted kind">{{ kindOf(job) }}</span>
                  </td>
                  <td><span :class="['status', job.state]">{{ t(`jobs.state.${job.state}`) }}</span></td>
                </tr>
                <tr v-if="job.error" class="error-row">
                  <td colspan="4"><code>{{ job.error }}</code></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>

      <p v-if="views?.deliveries || views?.backups" class="more">
        <RouterLink v-if="views?.deliveries" to="/deliveries">{{ t('jobs.deliveries') }} →</RouterLink>
        <RouterLink v-if="views?.backups" to="/backups">{{ t('jobs.backups') }} →</RouterLink>
      </p>
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.page-header p {
  margin: 0.3rem 0 0;
}
.segmented {
  display: inline-flex;
  margin-bottom: 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.segmented button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
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
.count {
  color: var(--faint);
  font-weight: 500;
}
.failed-count {
  color: var(--danger);
  font-weight: 500;
}
.count,
.failed-count {
  white-space: nowrap;
}
.segmented button {
  text-align: left;
}
.jobs {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.job {
  padding: 0.9rem 1.1rem;
  min-width: 0;
  border-left: 3px solid transparent;
}
.job.failed {
  border-left-color: var(--danger);
}
.job.paused {
  border-left-color: var(--warning-text);
}
.job-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}
.job-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.job-name {
  font-size: 0.95rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.job-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 500;
}
.pill.ok {
  background: var(--success-soft);
  color: var(--ok);
}
.pill.failed {
  background: var(--danger-soft);
  color: var(--danger);
}
.pill.running {
  background: var(--info-soft);
  color: var(--info);
}
.pill.paused {
  background: var(--warning-soft);
  color: var(--warning-text);
}
.job-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.6rem 1.5rem;
  margin: 0.75rem 0 0;
}
.job-meta dt {
  color: var(--faint);
  font-size: 0.78rem;
}
.job-meta dd {
  margin: 0.15rem 0 0;
  font-size: 0.9rem;
}
.small {
  display: block;
  font-size: 0.8rem;
}
.job-error {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0.75rem 0 0;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
}
.job-error code {
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
.job-error svg {
  flex-shrink: 0;
  margin-top: 0.1rem;
}
.zone {
  margin: 0.6rem 0 0;
  font-size: 0.8rem;
}
.panel {
  margin-bottom: 1rem;
  padding: 1rem 0 0.25rem;
  overflow: hidden;
}
.panel h2 {
  margin: 0 1.1rem 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
}
.empty {
  margin: 0;
  padding: 0 1.1rem 1rem;
  font-size: 0.9rem;
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th,
td {
  padding: 0.6rem 0.9rem;
  text-align: left;
  white-space: nowrap;
}
th {
  border-top: 1px solid var(--border);
  color: var(--faint);
  font-size: 0.8rem;
  font-weight: 500;
}
td {
  border-top: 1px solid var(--border);
  white-space: normal;
}
td code,
td .status,
td .when {
  white-space: nowrap;
}
.error-row td {
  border-top: 0;
  padding-top: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.error-row code {
  color: var(--danger);
  font-size: 0.8rem;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 500;
}
.status::before {
  content: '';
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--faint);
}
.status.ok::before {
  background: var(--ok);
}
.status.failed {
  color: var(--danger);
}
.status.failed::before {
  background: var(--danger);
}
.status.running::before,
.status.pending::before {
  background: var(--info);
}
.tag {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--info-soft);
  color: var(--info);
  font-size: 0.75rem;
  font-weight: 500;
}
.tag.paused {
  margin-left: 0;
  background: var(--warning-soft);
  color: var(--warning-text);
}
td.actions {
  width: 1%;
  text-align: right;
}
td.actions .btn + .btn {
  margin-left: 0.25rem;
}
td.last .when {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.8rem;
}
.duration,
.kind {
  margin-left: 0.5rem;
  font-size: 0.8rem;
}
.more {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
}
</style>
