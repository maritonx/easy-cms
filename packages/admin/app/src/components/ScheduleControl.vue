<script setup lang="ts">
import type { ScheduledPublish } from '@easy-cms/core'
import { ref, watch } from 'vue'
import { api } from '../lib/api'
import { fromLocalInput, toLocalInput } from '../lib/fields'
import { formatDate, t } from '../lib/i18n'

const props = defineProps<{
  /** The document's API path, e.g. `/posts/3` or `/globals/site`. */
  path: string
  /** Changes after every save, so the list reloads. */
  reloadKey: number
}>()

const jobs = ref<ScheduledPublish[]>([])
const action = ref<'publish' | 'unpublish'>('publish')
const at = ref('')
const error = ref('')
const saving = ref(false)
const dialog = ref<HTMLDialogElement>()

async function load() {
  try {
    jobs.value = await api<ScheduledPublish[]>('GET', `${props.path}/schedule`)
  } catch (e) {
    error.value = (e as Error).message
  }
}

function open() {
  error.value = ''
  // Default: tomorrow at 9:00 local time.
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  at.value = toLocalInput(next.toISOString())
  dialog.value?.showModal()
}

async function submit() {
  saving.value = true
  error.value = ''
  try {
    await api('POST', `${props.path}/schedule`, {
      action: action.value,
      at: fromLocalInput(at.value),
    })
    dialog.value?.close()
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function cancel(job: ScheduledPublish) {
  await api('DELETE', `${props.path}/schedule/${job.id}`)
  await load()
}

watch(() => [props.path, props.reloadKey], load, { immediate: true })
defineExpose({ open })
</script>

<template>
  <ul v-if="jobs.length" class="jobs">
    <li v-for="job in jobs" :key="String(job.id)" class="job">
      <span>{{ t(job.action === 'publish' ? 'schedule.publishOn' : 'schedule.unpublishOn', { date: formatDate(job.runAt) }) }}</span>
      <button type="button" class="link" @click="cancel(job)">{{ t('schedule.cancel') }}</button>
    </li>
  </ul>

  <dialog ref="dialog" class="dialog card" :aria-label="t('schedule.title')" @cancel.prevent="dialog?.close()">
    <form method="dialog" @submit.prevent="submit">
      <h2>{{ t('schedule.title') }}</h2>
      <label class="field">
        <span class="field-label">{{ t('schedule.action') }}</span>
        <select v-model="action" class="input">
          <option value="publish">{{ t('edit.publish') }}</option>
          <option value="unpublish">{{ t('edit.unpublish') }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">{{ t('schedule.at') }}</span>
        <input v-model="at" class="input" type="datetime-local" required />
      </label>
      <p v-if="error" class="field-error">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="dialog?.close()">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn btn-primary" :disabled="saving || !at">{{ t('schedule.save') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.jobs {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}
.job {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--accent);
}
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--danger);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.dialog {
  width: min(24rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.dialog form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
h2 {
  margin: 0;
  font-size: 1rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
