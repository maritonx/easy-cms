<script setup lang="ts">
import { CalendarClock, Plus } from '@lucide/vue'
import { ref, watch } from 'vue'
import {
  type CalendarEvent,
  type CalendarMove,
  type CalendarRange,
  dayAgenda,
} from '../lib/calendar'
import { locale, t } from '../lib/i18n'
import { adminTimeZone, dayStart, nextDay } from '../lib/time-zone'

/**
 * The selected day's events beside a calendar (#272): whole days first, then by time. Its own
 * request, so it is right whatever range the calendar shows.
 */
const props = defineProps<{
  /** `YYYY-MM-DD` in the admin's time zone. */
  day: string
  load: (from: string, to: string) => Promise<CalendarRange>
  /** When it changes, the day loads again (filters, sources, a save). */
  reloadKey: string
  /** The collection each event comes from, by slug: shown when there are several. */
  sourceOf?: ((slug: string) => string) | undefined
  /** A button to create a document on this day. */
  canCreate: boolean
}>()
const emit = defineEmits<{ open: [to: string]; create: []; move: [change: CalendarMove] }>()

const events = ref<CalendarEvent[]>([])
const loading = ref(true)
const error = ref('')

async function fetchDay() {
  loading.value = true
  error.value = ''
  try {
    const zone = adminTimeZone.value
    const range = await props.load(dayStart(props.day, zone), dayStart(nextDay(props.day), zone))
    // A document that started before the day and goes on through it counts too.
    events.value = dayAgenda(range.events)
  } catch (e) {
    error.value = (e as Error).message
    events.value = []
  } finally {
    loading.value = false
  }
}
watch(() => [props.day, props.reloadKey], fetchDay, { immediate: true })

const heading = () =>
  new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${props.day}T12:00:00Z`))

/** "09:00–10:30", "09:00" or "All day"; wall-clock times, as the calendar has them. */
function when(event: CalendarEvent): string {
  if (event.allDay) return t('calendar.allDay')
  const time = (wall: string) => wall.slice(11, 16)
  const end = event.end && event.end.slice(0, 10) === event.start.slice(0, 10) ? event.end : ''
  return end ? `${time(event.start)}–${time(end)}` : time(event.start)
}

// --- "Move to…": the keyboard's way to move an event (instead of dragging) -------------------

const dialog = ref<HTMLDialogElement>()
const moving = ref<CalendarEvent | null>(null)
const at = ref('')
/** A wall-clock time of the calendar (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`) as its "UTC" date. */
const wallDate = (wall: string) => new Date(`${wall.length === 10 ? `${wall}T00:00` : wall}:00Z`)

function startMove(event: CalendarEvent) {
  moving.value = event
  at.value = event.start.length === 10 ? `${event.start}T00:00` : event.start
  dialog.value?.showModal()
}

function confirmMove() {
  const event = moving.value
  if (!event || !at.value) return
  const oldStart = wallDate(event.start)
  const oldEnd = event.end ? wallDate(event.end) : null
  const start = wallDate(at.value)
  // The same length as before.
  const end = oldEnd ? new Date(start.getTime() + (oldEnd.getTime() - oldStart.getTime())) : null
  dialog.value?.close()
  emit('move', { extendedProps: event.extendedProps, start, end, oldStart, oldEnd })
}

function open(event: CalendarEvent, e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  emit('open', event.extendedProps.to)
}
</script>

<template>
  <section class="card day-card" :aria-busy="loading" aria-labelledby="calendar-day-heading">
    <h2 id="calendar-day-heading" class="day-heading">{{ heading() }}</h2>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ul v-else-if="events.length" class="day-list">
      <li v-for="event in events" :key="event.id" class="day-row">
        <a :href="event.url" :class="['day-item', ...event.classNames]" @click="open(event, $event)">
          <span class="dot" aria-hidden="true" />
          <span class="time">{{ when(event) }}</span>
          <span class="text">
            <span class="title">{{ event.title }}</span>
            <span class="meta">
              <template v-if="sourceOf && event.extendedProps.collection">{{ sourceOf(event.extendedProps.collection) }}</template>
              <span v-if="event.extendedProps.status" :class="['badge', `badge-${event.extendedProps.status}`]">
                {{ t(event.extendedProps.status === 'published' ? 'status.published' : 'status.draft') }}
              </span>
            </span>
          </span>
        </a>
        <button
          v-if="event.startEditable"
          type="button"
          class="btn btn-ghost btn-sm btn-icon move"
          :aria-label="`${t('calendar.moveTo')} ${event.title}`"
          :title="t('calendar.moveTo')"
          @click="startMove(event)"
        >
          <CalendarClock :size="15" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else-if="!loading" class="empty">{{ t('calendar.nothing') }}</p>
    <button v-if="canCreate" type="button" class="btn btn-sm create" @click="emit('create')">
      <Plus :size="15" aria-hidden="true" />
      {{ t('calendar.newOnDay') }}
    </button>
    <dialog ref="dialog" class="move-dialog" aria-labelledby="calendar-move-heading" @close="moving = null">
      <form method="dialog" @submit.prevent="confirmMove">
        <h2 id="calendar-move-heading">{{ t('calendar.moveTitle', { title: moving?.title ?? '' }) }}</h2>
        <label class="field">
          <span class="field-label">{{ t('calendar.moveAt') }}</span>
          <input v-model="at" class="input" type="datetime-local" required />
        </label>
        <div class="actions">
          <button type="button" class="btn" @click="dialog?.close()">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary">{{ t('calendar.move') }}</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.day-card {
  padding: 1rem;
}
.day-heading {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}
.day-list {
  display: grid;
  gap: 0.25rem;
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
}
.day-row {
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
}
.day-row .day-item {
  flex: 1;
  min-width: 0;
}
.move {
  flex: none;
}
.move-dialog form {
  display: grid;
  gap: 0.75rem;
}
.move-dialog h2 {
  margin: 0;
  font-size: 1rem;
}
.move-dialog .actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.day-item {
  display: grid;
  grid-template-columns: auto 4.75rem 1fr;
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.4rem 0.5rem;
  border-radius: var(--radius-sm);
  color: inherit;
  text-decoration: none;
}
.day-item:hover {
  background: var(--surface-2);
}
.dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  background: var(--c, var(--accent));
}
.cal-scheduled .dot {
  border: 1.5px dashed var(--c, var(--accent));
  background: transparent;
}
.time {
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}
.text {
  display: grid;
  min-width: 0;
}
.title {
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.meta:empty {
  display: none;
}
.empty {
  margin: 0 0 0.75rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}
.error {
  color: var(--danger);
  font-size: 0.875rem;
}
.create {
  width: 100%;
  justify-content: center;
}
</style>
