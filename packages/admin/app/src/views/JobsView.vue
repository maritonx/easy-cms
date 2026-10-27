<script setup lang="ts">
import type { AdminJob, AdminJobs, AdminOutboxEntry, AdminScheduledJob } from '@easy-cms/core'
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

/**
 * Settings → Jobs: the config's jobs with their last run, the scheduled-publish queue, and the
 * outbox's failed entries.
 */
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
      outbox: { ran: number; failed: number }
    }>('POST', '/admin/jobs/run')
    const failed =
      result.scheduled.failed +
      result.jobs.failed +
      result.webhooks.failed +
      result.emails.failed +
      result.outbox.failed
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

/** Nothing ran the jobs for this long (or ever): say so, with how to run them. */
const STALE = 10 * 60_000
const stale = computed(
  () =>
    !!data.value &&
    (!data.value.lastRanAt || Date.now() - Date.parse(data.value.lastRanAt) > STALE),
)
const cronDocs = computed(
  () =>
    `https://easy-cms-website.vercel.app${locale.value === 'th' ? '/th' : ''}/docs/drafts#scheduled-publishing`,
)
/** Where each built-in job's own page is, when this user may open it. */
function builtInLink(id: string): string | null {
  if (id === 'scheduled') return '/jobs?tab=scheduled'
  if (id === 'outbox') return '/jobs?tab=outbox'
  if ((id === 'webhooks' || id === 'emails') && views?.deliveries)
    return `/deliveries?kind=${id === 'webhooks' ? 'webhook' : 'email'}`
  if (id === 'backups' && views?.backups) return '/backups'
  if (id === 'audit' && views?.audit) return '/audit'
  return null
}

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

// Tabs: Jobs, Scheduled publishing and Outbox, kept in the address (`?tab=scheduled`) so links
// (e.g. from the dashboard) open the right one. With only one of them there are no tabs.
type Tab = 'jobs' | 'scheduled' | 'outbox'
const route = useRoute()
const router = useRouter()
const tabs = computed<Tab[]>(() => {
  if (!data.value) return []
  const list: Tab[] = ['jobs']
  if (data.value.scheduled) list.push('scheduled')
  if (data.value.outbox) list.push('outbox')
  return list
})
const tab = computed<Tab>(() => {
  const wanted: Tab =
    route.query.tab === 'scheduled' || route.query.tab === 'outbox' ? route.query.tab : 'jobs'
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

// The outbox: a failed entry can be put back in line (admins of the whole system).
const retrying = ref<string | null>(null)
async function retryEntry(entry: AdminOutboxEntry) {
  retrying.value = String(entry.id)
  try {
    data.value = await api<AdminJobs>('POST', `/admin/jobs/outbox/${entry.id}`)
    notify('success', t('jobs.outbox.retried'))
  } catch (e) {
    notify('error', e instanceof ApiError ? e.message : String(e))
  } finally {
    retrying.value = null
  }
}
const outboxTarget = (entry: AdminOutboxEntry) => {
  if (entry.global) {
    const g = session.schema?.globals.find((x) => x.slug === entry.global)
    return label(g?.label, entry.global)
  }
  const c = session.schema?.collections.find((x) => x.slug === entry.collection)
  return `${label(c?.labels?.singular, entry.collection ?? '')} #${entry.doc}`
}
const outboxLink = (entry: AdminOutboxEntry) =>
  entry.event === 'delete'
    ? null
    : entry.global
      ? `/globals/${entry.global}`
      : `/collections/${entry.collection}/${entry.doc}`
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
      <p v-if="stale" class="notice notice-warning heartbeat" role="note">
        <TriangleAlert :size="16" aria-hidden="true" />
        <span>
          {{ data.lastRanAt ? t('jobs.staleSince', { ago: ago(data.lastRanAt) }) : t('jobs.neverRan') }}
          {{ t('jobs.staleHelp') }}
          <a :href="cronDocs" target="_blank" rel="noopener">{{ t('jobs.howToRun') }}</a>
        </span>
      </p>
      <p v-else-if="data.lastRanAt" class="heartbeat muted">
        <CircleCheck :size="15" aria-hidden="true" class="ok-icon" />
        <span>
          {{ t('jobs.lastRan') }}
          <time :datetime="data.lastRanAt" :title="formatDate(data.lastRanAt)">{{ ago(data.lastRanAt) }}</time>
        </span>
      </p>
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
        <button v-if="data.outbox" type="button" :aria-pressed="tab === 'outbox'" @click="setTab('outbox')">
          {{ t('jobs.outbox') }}
          <span class="count">{{ data.outbox.waiting }}</span>
          <span v-if="data.outbox.failed" class="failed-count">{{ t('jobs.failedCount', { count: data.outbox.failed }) }}</span>
        </button>
      </div>

      <section v-if="tab === 'jobs'" aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" class="visually-hidden">{{ t('jobs.configJobs') }}</h2>
        <div v-if="data.jobs.length === 0" class="card empty-jobs">
          <p>{{ t('jobs.noJobsLead') }}</p>
          <pre><code>jobs: [
  { name: 'sitemap:refresh', at: '02:00', run: ({ cms }) => refresh(cms) },
]</code></pre>
          <a :href="docs" target="_blank" rel="noopener">{{ t('jobs.howToAdd') }} →</a>
        </div>
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

        <section v-if="data.builtIn.length" class="card built-in" aria-labelledby="built-in-heading">
          <h3 id="built-in-heading">{{ t('jobs.builtIn') }}</h3>
          <p class="muted small-lead">{{ t('jobs.builtInLead') }}</p>
          <ul>
            <li v-for="id in data.builtIn" :key="id">
              <span class="built-in-name">{{ t(`jobs.builtIn.${id}`) }}</span>
              <span class="muted">{{ t(`jobs.builtIn.${id}.detail`) }}</span>
              <RouterLink v-if="builtInLink(id)" :to="builtInLink(id) as string" class="built-in-link">
                {{ t('jobs.open') }} →
              </RouterLink>
            </li>
          </ul>
        </section>
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

      <section v-if="tab === 'outbox' && data.outbox" class="card panel" aria-labelledby="outbox-heading">
        <h2 id="outbox-heading">{{ t('jobs.outbox') }}</h2>
        <p class="muted small-lead panel-lead">
          {{ t('jobs.outbox.lead', { waiting: data.outbox.waiting, failed: data.outbox.failed }) }}
        </p>
        <p v-if="data.outbox.entries.length === 0" class="empty muted">{{ t('jobs.outbox.none') }}</p>
        <div v-else class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ t('jobs.outbox.event') }}</th>
                <th>{{ t('jobs.document') }}</th>
                <th>{{ t('jobs.outbox.attempts') }}</th>
                <th>{{ t('jobs.state') }}</th>
                <th><span class="visually-hidden">{{ t('jobs.outbox.retry') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="entry in data.outbox.entries" :key="String(entry.id)">
                <tr>
                  <td>{{ t(`jobs.outbox.event.${entry.event}`) }}</td>
                  <td>
                    <RouterLink v-if="outboxLink(entry)" :to="outboxLink(entry) as string">{{ outboxTarget(entry) }}</RouterLink>
                    <span v-else>{{ outboxTarget(entry) }}</span>
                  </td>
                  <td>{{ entry.attempts }}</td>
                  <td>
                    <span :class="['status', entry.state]">{{ t(`jobs.state.${entry.state}`) }}</span>
                    <span v-if="entry.state === 'pending'" class="muted kind">
                      {{ t('jobs.outbox.next', { at: ago(entry.nextAttemptAt) }) }}
                    </span>
                  </td>
                  <td>
                    <button
                      v-if="entry.state === 'failed' && data.canChange"
                      type="button"
                      class="btn btn-sm"
                      :disabled="retrying !== null"
                      @click="retryEntry(entry)"
                    >
                      {{ t('jobs.outbox.retry') }}
                    </button>
                  </td>
                </tr>
                <tr v-if="entry.error" class="error-row">
                  <td colspan="5"><code>{{ entry.error }}</code></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>

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
.heartbeat {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0 0 1rem;
  font-size: 0.875rem;
}
.heartbeat svg {
  flex-shrink: 0;
  margin-top: 0.15rem;
}
.ok-icon {
  color: var(--ok);
}
.empty-jobs {
  padding: 1rem 1.1rem;
  font-size: 0.9rem;
}
.empty-jobs p {
  margin: 0 0 0.6rem;
  color: var(--text-muted);
}
.empty-jobs pre {
  margin: 0 0 0.6rem;
  padding: 0.6rem 0.75rem;
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 0.8rem;
}
.built-in {
  margin-top: 1rem;
  padding: 0.9rem 1.1rem 0.4rem;
}
.built-in h3 {
  margin: 0;
  font-size: 0.95rem;
}
.small-lead {
  margin: 0.2rem 0 0.5rem;
  font-size: 0.85rem;
}
.built-in ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.built-in li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  padding: 0.55rem 0;
  border-top: 1px solid var(--border);
  font-size: 0.875rem;
}
.built-in-name {
  font-weight: 500;
}
.built-in-link {
  margin-left: auto;
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
.panel-lead {
  margin: -0.4rem 1.1rem 0.85rem;
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
