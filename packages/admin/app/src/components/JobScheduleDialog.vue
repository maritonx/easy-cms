<script setup lang="ts">
import type { AdminJob } from '@easy-cms/core'
import { computed, ref, watch } from 'vue'
import { t } from '../lib/i18n'

/** Settings → Jobs: how often a job with `adminSchedule` runs, and at what time of day. */
const props = defineProps<{ job: AdminJob | null; timeZone: string | null; busy: boolean }>()
const emit = defineEmits<{
  save: [schedule: { every: number | null; at: string | null }]
  reset: []
  cancel: []
}>()

type Unit = 'minutes' | 'hours' | 'days' | 'weeks'
const SECONDS: Record<Unit, number> = { minutes: 60, hours: 3_600, days: 86_400, weeks: 604_800 }
const dialog = ref<HTMLDialogElement>()
const amount = ref(1)
const unit = ref<Unit>('hours')
const atOn = ref(false)
const at = ref('02:00')

/** The largest unit that divides the seconds exactly. */
function split(seconds: number | null): { amount: number; unit: Unit } {
  if (!seconds) return { amount: 1, unit: 'days' }
  for (const u of ['weeks', 'days', 'hours', 'minutes'] as const)
    if (seconds % SECONDS[u] === 0) return { amount: seconds / SECONDS[u], unit: u }
  return { amount: Math.max(1, Math.round(seconds / 60)), unit: 'minutes' }
}

watch(
  () => props.job,
  (job) => {
    if (!job) return dialog.value?.close()
    const parts = split(job.every ?? (job.at ? 86_400 : null))
    amount.value = parts.amount
    unit.value = parts.unit
    atOn.value = job.at !== null
    at.value = job.at ?? '02:00'
    dialog.value?.showModal()
  },
)

/** A time of day only goes with whole days. */
const daily = computed(() => unit.value === 'days' || unit.value === 'weeks')
const valid = computed(
  () =>
    Number.isInteger(amount.value) &&
    amount.value >= 1 &&
    (!atOn.value || /^\d\d:\d\d$/.test(at.value)),
)
function save() {
  if (!valid.value) return
  emit('save', {
    every: amount.value * SECONDS[unit.value],
    at: daily.value && atOn.value ? at.value : null,
  })
}
const code = computed(() => props.job?.code)
</script>

<template>
  <dialog ref="dialog" class="dialog card" aria-labelledby="schedule-title" @cancel.prevent="emit('cancel')">
    <form v-if="job" @submit.prevent="save">
      <h2 id="schedule-title">{{ t('jobs.scheduleTitle', { name: job.name }) }}</h2>
      <div class="field">
        <span class="field-label">{{ t('jobs.every') }}</span>
        <div class="row">
          <input v-model.number="amount" class="input amount" type="number" min="1" step="1" :aria-label="t('jobs.amount')" required />
          <select v-model="unit" class="select" :aria-label="t('jobs.unit')">
            <option value="minutes">{{ t('jobs.unit.minutes') }}</option>
            <option value="hours">{{ t('jobs.unit.hours') }}</option>
            <option value="days">{{ t('jobs.unit.days') }}</option>
            <option value="weeks">{{ t('jobs.unit.weeks') }}</option>
          </select>
        </div>
      </div>
      <div v-if="daily" class="field">
        <label class="checkbox">
          <input v-model="atOn" type="checkbox" />
          {{ t('jobs.atTime') }}
        </label>
        <input v-if="atOn" v-model="at" class="input time" type="time" :aria-label="t('jobs.atTime')" required />
        <span class="field-hint">{{ timeZone ? t('jobs.inZone', { zone: timeZone }) : t('jobs.serverZone') }}</span>
      </div>
      <p v-if="code" class="muted code">
        {{ t('jobs.codeSchedule') }}:
        <code>{{ code.every ? `every: ${code.every}` : 'every: —' }}{{ code.at ? `, at: '${code.at}'` : '' }}</code>
      </p>
      <div class="actions">
        <button v-if="job.changed" type="button" class="btn btn-ghost reset" :disabled="busy" @click="emit('reset')">
          {{ t('jobs.useCode') }}
        </button>
        <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn btn-primary" :disabled="busy || !valid">{{ t('jobs.save') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(28rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
h2 {
  margin: 0 0 1rem;
  font-size: 1.05rem;
}
.row {
  display: flex;
  gap: 0.5rem;
}
.amount {
  width: 6rem;
}
.time {
  width: 9rem;
  margin-top: 0.4rem;
}
.code {
  margin: 0 0 1rem;
  font-size: 0.85rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
.reset {
  margin-right: auto;
}
</style>
