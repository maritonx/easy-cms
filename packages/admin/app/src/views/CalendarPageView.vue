<script setup lang="ts">
import type { AdminCollection, ScheduledPublish } from '@easy-cms/core'
import { computed, defineAsyncComponent, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type Doc } from '../lib/api'
import {
  type CalendarEvent,
  type CalendarRange,
  COLORS,
  type EventLink,
  jobEvent,
  loadRange,
} from '../lib/calendar'
import { label, t } from '../lib/i18n'
import { loadRelationTitles, relationTitle } from '../lib/relation-titles'
import { session } from '../lib/session'
import { adminTimeZone } from '../lib/time-zone'

/**
 * The Calendar page (#272): the documents of every collection with `admin.calendar`, and what is
 * scheduled to publish or unpublish, each collection in a colour of its own and each source
 * hideable. It opens documents; creating is in a collection's own Calendar mode.
 */
const CalendarView = defineAsyncComponent(() => import('../components/CalendarView.vue'))
const route = useRoute()
const router = useRouter()

type Job = ScheduledPublish & { collection?: string; global?: string; doc: Doc['id'] }

const collections = computed(() =>
  (session.schema?.collections ?? []).filter(
    (c) => c.permissions.read && (c.calendar !== undefined || c.schedule),
  ),
)
/** A colour per collection, the same for its documents and its scheduled publishes. */
const colorOf = (slug: string) => {
  const i = collections.value.findIndex((c) => c.slug === slug)
  return i < 0 ? [] : [`cal-c${i % COLORS}`]
}
const withCalendar = computed(() => collections.value.filter((c) => c.calendar !== undefined))
const anyScheduled = computed(() => collections.value.some((c) => c.schedule))

// --- Sources shown: remembered in this browser ---------------------------------------------

const KEY = 'easy-cms-calendar-hidden'
const SCHEDULED = '#scheduled'
function readHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
const hidden = ref(readHidden())
function toggle(source: string, shown: boolean) {
  const next = new Set(hidden.value)
  if (shown) next.delete(source)
  else next.add(source)
  hidden.value = next
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    // private mode: for this page only
  }
}

// --- What a range shows ----------------------------------------------------------------------

const linkTo = (to: string): EventLink => ({ href: router.resolve(to).href, to })

async function scheduledIn(from: string, to: string): Promise<CalendarEvent[]> {
  const jobs = await api<Job[]>(
    'GET',
    `/admin/ui/scheduled?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  )
  // Titles, a request per collection.
  const ids = new Map<string, string[]>()
  for (const job of jobs)
    if (job.collection)
      ids.set(job.collection, [...(ids.get(job.collection) ?? []), String(job.doc)])
  await Promise.all([...ids].map(([slug, list]) => loadRelationTitles(slug, list)))
  return jobs.map((job) => {
    const global = job.global
      ? session.schema?.globals.find((g) => g.slug === job.global)
      : undefined
    const title = global
      ? label(global.label, global.slug)
      : relationTitle(job.collection ?? '', String(job.doc))
    const to = global
      ? `/globals/${global.slug}`
      : `/collections/${job.collection}/${encodeURIComponent(String(job.doc))}`
    return jobEvent(
      job,
      t(job.action === 'publish' ? 'calendar.publish' : 'calendar.unpublish', { title }),
      linkTo(to),
      adminTimeZone.value,
      job.collection ? colorOf(job.collection) : [],
    )
  })
}

async function load(from: string, to: string): Promise<CalendarRange> {
  const ranges = await Promise.all(
    withCalendar.value
      .filter((c) => !hidden.value.has(c.slug))
      .map((c: AdminCollection) =>
        loadRange(
          c,
          undefined,
          from,
          to,
          (id) => linkTo(`/collections/${c.slug}/${encodeURIComponent(id)}`),
          adminTimeZone.value,
          colorOf(c.slug),
        ),
      ),
  )
  const jobs = anyScheduled.value && !hidden.value.has(SCHEDULED) ? await scheduledIn(from, to) : []
  return {
    events: [...ranges.flatMap((r) => r.events), ...jobs],
    tooMany: ranges.some((r) => r.tooMany),
  }
}

// --- The view and day, in the URL ------------------------------------------------------------

const view = computed(() =>
  typeof route.query.view === 'string' && route.query.view ? route.query.view : 'month',
)
const date = computed(() => (typeof route.query.date === 'string' ? route.query.date : undefined))
function onView(next: string, day: string) {
  if (next === view.value && day === date.value) return
  void router.replace({ query: { ...route.query, view: next, date: day } })
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1>{{ t('calendar.title') }}</h1>
        <p class="muted">{{ t('calendar.lead') }}</p>
      </div>
    </header>
    <fieldset class="sources">
      <legend class="visually-hidden">{{ t('calendar.sources') }}</legend>
      <label v-for="c in withCalendar" :key="c.slug" class="source">
        <input type="checkbox" :checked="!hidden.has(c.slug)" @change="toggle(c.slug, ($event.target as HTMLInputElement).checked)" />
        <span :class="['swatch', ...colorOf(c.slug)]" aria-hidden="true" />
        {{ label(c.labels?.plural, c.slug) }}
      </label>
      <label v-if="anyScheduled" class="source">
        <input type="checkbox" :checked="!hidden.has(SCHEDULED)" @change="toggle(SCHEDULED, ($event.target as HTMLInputElement).checked)" />
        <span class="swatch dashed" aria-hidden="true" />
        {{ t('calendar.scheduled') }}
      </label>
    </fieldset>
    <CalendarView
      class="card calendar-card"
      :load="load"
      :reload-key="[...hidden].sort().join(',')"
      :selectable="false"
      :view="view"
      :date="date"
      @open="(to: string) => router.push(to)"
      @update:view="onView"
    />
  </div>
</template>

<style scoped>
.sources {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 0 0 0.9rem;
  padding: 0;
  border: 0;
}
.source {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 3px;
  background: var(--c, var(--accent));
}
.swatch.dashed {
  border: 1.5px dashed var(--text-muted);
  background: transparent;
}
.calendar-card {
  padding: 1rem;
}
</style>
