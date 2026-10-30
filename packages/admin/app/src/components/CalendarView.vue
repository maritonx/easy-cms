<script setup lang="ts">
import type { AdminCollection } from '@easy-cms/core'
import {
  Calendar,
  type DateSelectArg,
  type DatesSetArg,
  type EventClickArg,
  type EventSourceFuncArg,
} from '@fullcalendar/core'
import enGbLocale from '@fullcalendar/core/locales/en-gb'
import thLocale from '@fullcalendar/core/locales/th'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import timeGridPlugin from '@fullcalendar/timegrid'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import {
  type CalendarEvent,
  eventOf,
  initialFor,
  momentOf,
  RANGE_LIMIT,
  rangeWhere,
} from '../lib/calendar'
import { locale, t } from '../lib/i18n'
import { adminTimeZone, toZoned, zoneName } from '../lib/time-zone'

/**
 * A collection's documents on a calendar (#272): month, week, day and agenda, in the admin's
 * time zone, with the list's filters. Loaded only when the list is in Calendar mode.
 */
const props = defineProps<{
  collection: AdminCollection
  /** The list's own conditions (filters, search), as a `where`. */
  where: Record<string, unknown> | undefined
  /** `month`, `week`, `day` or `agenda`, and the day shown (`YYYY-MM-DD`). */
  view: string
  date: string | undefined
  /** An edit link for a document. */
  hrefOf: (id: string) => string
}>()
const emit = defineEmits<{
  open: [id: string]
  create: [initial: Record<string, string>]
  'update:view': [view: string, date: string]
}>()

/** The REST API's largest page. */
const PAGE = 100

const VIEWS: Record<string, string> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
  agenda: 'listWeek',
}
const NAMES = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [v, k]))

const el = ref<HTMLElement>()
const tooMany = ref(false)
const error = ref('')
const busy = ref(false)
let calendar: Calendar | undefined

const zone = () => adminTimeZone.value
const fullDate = (wall: Date, withTime: boolean) =>
  new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'full',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone: 'UTC',
  }).format(wall)

async function events(info: EventSourceFuncArg): Promise<CalendarEvent[]> {
  const range = rangeWhere(
    props.collection.calendar as NonNullable<AdminCollection['calendar']>,
    momentOf(info.start, zone()),
    momentOf(info.end, zone()),
  )
  const where = props.where ? { and: [props.where, range] } : range
  error.value = ''
  try {
    // The REST API gives at most PAGE per request: the first page, then the rest at once.
    const page = (n: number) =>
      api<Paginated<Doc>>(
        'GET',
        `/${props.collection.slug}${toQuery({
          where,
          limit: PAGE,
          page: n,
          depth: 0,
          draft: true,
          sort: props.collection.calendar?.start,
        })}`,
      )
    const first = await page(1)
    const pages = Math.min(first.totalPages, RANGE_LIMIT / PAGE)
    const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => page(i + 2)))
    tooMany.value = first.totalDocs > RANGE_LIMIT
    return [first, ...rest]
      .flatMap((found) => found.docs)
      .map((doc) => eventOf(props.collection, doc, props.hrefOf(String(doc.id)), zone()))
      .filter((e): e is CalendarEvent => e !== null)
  } catch (e) {
    error.value = (e as Error).message
    return []
  }
}

onMounted(() => {
  if (!el.value) return
  const th = locale.value === 'th'
  calendar = new Calendar(el.value, {
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    locales: [thLocale, enGbLocale],
    locale: th ? 'th' : 'en-gb',
    // The week starts as people there count it: Sunday in Thai, Monday in British English.
    firstDay: th ? 0 : 1,
    // Wall-clock times of the admin's zone, given as UTC (see lib/calendar).
    timeZone: 'UTC',
    now: () => toZoned(new Date().toISOString(), zone()),
    initialView: VIEWS[props.view] ?? 'dayGridMonth',
    ...(props.date ? { initialDate: props.date } : {}),
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
    },
    buttonText: {
      today: t('calendar.today'),
      month: t('calendar.month'),
      week: t('calendar.week'),
      day: t('calendar.day'),
      listWeek: t('calendar.agenda'),
    },
    height: 'auto',
    navLinks: true,
    nowIndicator: true,
    dayMaxEvents: 4,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    selectable: props.collection.permissions.create,
    selectMirror: true,
    events: (info, success) => {
      void events(info).then(success)
    },
    loading: (loading) => {
      busy.value = loading
    },
    datesSet: (info: DatesSetArg) => {
      const day = toZoned(info.view.currentStart.toISOString(), 'UTC').slice(0, 10)
      emit('update:view', NAMES[info.view.type] ?? 'month', day)
    },
    eventClick: (info: EventClickArg) => {
      // A normal click opens it here; a middle or modified click opens the link as usual.
      if (info.jsEvent.metaKey || info.jsEvent.ctrlKey || info.jsEvent.shiftKey) return
      info.jsEvent.preventDefault()
      emit('open', info.event.id)
    },
    select: (info: DateSelectArg) => {
      const calendarConfig = props.collection.calendar
      if (!calendarConfig) return
      calendar?.unselect()
      emit('create', initialFor(calendarConfig, info, zone()))
    },
    // Names for screen readers: the whole date of a day, and an event's date and time.
    dayCellDidMount: (arg) => {
      const link = arg.el.querySelector('.fc-daygrid-day-number')
      if (link) link.setAttribute('aria-label', fullDate(arg.date, false))
    },
    eventDidMount: (arg) => {
      const start = arg.event.start
      if (!start) return
      arg.el.setAttribute('aria-label', `${arg.event.title}, ${fullDate(start, !arg.event.allDay)}`)
    },
  })
  calendar.render()
})

onBeforeUnmount(() => calendar?.destroy())

/** Filters or search changed: the same range, again. */
watch(
  () => JSON.stringify(props.where),
  () => calendar?.refetchEvents(),
)

defineExpose({ refetch: () => calendar?.refetchEvents() })
</script>

<template>
  <div class="calendar-mode" :aria-busy="busy">
    <p class="zone">{{ t('time.zone', { zone: zoneName(locale === 'th' ? 'th-TH' : 'en-GB') }) }}</p>
    <p v-if="tooMany" class="notice" role="status">{{ t('calendar.tooMany', { count: RANGE_LIMIT }) }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div ref="el" class="calendar" />
  </div>
</template>

<style scoped>
.zone {
  margin: 0 0 0.5rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.notice,
.error {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
}
.notice {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.error {
  color: var(--danger);
}
.calendar {
  --fc-border-color: var(--border);
  --fc-page-bg-color: var(--surface);
  --fc-neutral-bg-color: var(--surface-2);
  --fc-today-bg-color: var(--accent-soft);
  --fc-button-bg-color: var(--surface);
  --fc-button-border-color: var(--border-strong);
  --fc-button-text-color: var(--text);
  --fc-button-hover-bg-color: var(--surface-2);
  --fc-button-hover-border-color: var(--border-strong);
  --fc-button-active-bg-color: var(--accent-soft);
  --fc-button-active-border-color: var(--accent);
  --fc-event-bg-color: var(--accent);
  --fc-event-border-color: var(--accent);
  --fc-event-text-color: var(--accent-text);
  --fc-now-indicator-color: var(--danger);
  --fc-list-event-hover-bg-color: var(--surface-2);
  color: var(--text);
  font-size: 0.875rem;
}
.calendar :deep(.fc-button) {
  font-size: 0.875rem;
  text-transform: none;
}
.calendar :deep(.fc-button-active) {
  color: var(--accent-ink);
}
.calendar :deep(.fc-toolbar-title) {
  font-size: 1.125rem;
}
.calendar :deep(a) {
  color: inherit;
}
/* On a phone: the title on a row of its own, the buttons below it. */
@media (max-width: 640px) {
  .calendar :deep(.fc-header-toolbar) {
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .calendar :deep(.fc-toolbar-chunk:nth-child(2)) {
    order: -1;
    width: 100%;
  }
  .calendar :deep(.fc-toolbar-title) {
    font-size: 1rem;
  }
}
/* One colour per value of `admin.calendar.color`, readable in light and dark. */
.calendar :deep(.cal-c0) { --c: #2563eb; }
.calendar :deep(.cal-c1) { --c: #059669; }
.calendar :deep(.cal-c2) { --c: #d97706; }
.calendar :deep(.cal-c3) { --c: #db2777; }
.calendar :deep(.cal-c4) { --c: #7c3aed; }
.calendar :deep(.cal-c5) { --c: #0891b2; }
.calendar :deep(.cal-c6) { --c: #65a30d; }
.calendar :deep(.cal-c7) { --c: #dc2626; }
.calendar :deep([class*='cal-c'].fc-event) {
  border-color: var(--c);
  background: var(--c);
  color: #fff;
}
.calendar :deep([class*='cal-c'] .fc-daygrid-event-dot),
.calendar :deep([class*='cal-c'] .fc-list-event-dot) {
  border-color: var(--c);
}
.calendar :deep(.fc-daygrid-dot-event[class*='cal-c']) {
  background: transparent;
  color: inherit;
}
</style>
