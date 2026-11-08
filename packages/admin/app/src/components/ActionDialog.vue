<script setup lang="ts">
// An action's form, or its confirmation (#386): what it is, on how many documents, and its fields.
import { computed, nextTick, ref, watch } from 'vue'
import FieldRenderer from '../fields/FieldRenderer.vue'
import { actionLabel, type PendingAction } from '../lib/actions'
import { label, t } from '../lib/i18n'

const props = defineProps<{
  pending: PendingAction | null
  errors: Record<string, string[]>
  busy: boolean
}>()
const emit = defineEmits<{ submit: [input: Record<string, unknown>]; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
const values = ref<Record<string, unknown>>({})

/** Fields changed since the server's errors came: their message goes until it says again. */
const edited = ref(new Set<string>())
watch(
  () => props.errors,
  () => {
    edited.value = new Set()
  },
)
const shownErrors = computed(() =>
  Object.fromEntries(Object.entries(props.errors).filter(([path]) => !edited.value.has(path))),
)
function set(name: string, value: unknown) {
  values.value[name] = value
  edited.value = new Set([...edited.value, name])
}

const action = computed(() => props.pending?.action)
const danger = computed(() => !!action.value?.confirm?.danger)
const text = computed(() => {
  const confirm = action.value?.confirm
  return confirm?.text ? label(confirm.text, '') : ''
})

watch(
  () => props.pending,
  async (pending) => {
    if (pending) {
      values.value = {}
      if (!dialog.value?.open) dialog.value?.showModal()
      await nextTick()
      dialog.value
        ?.querySelector<HTMLElement>(
          'input, textarea, select, button.btn-primary, button.btn-danger',
        )
        ?.focus()
    } else dialog.value?.close()
  },
)
</script>

<template>
  <dialog ref="dialog" class="dialog card" :aria-labelledby="action ? 'action-title' : undefined" @cancel.prevent="emit('cancel')">
    <form v-if="action && pending" novalidate @submit.prevent="emit('submit', values)">
      <h2 id="action-title">{{ actionLabel(action) }}</h2>
      <p v-if="pending.count !== undefined" class="count">{{ t('actions.onCount', { count: pending.count.toLocaleString() }) }}</p>
      <p v-if="text">{{ text }}</p>
      <div v-if="action.fields?.length" class="fields">
        <FieldRenderer
          v-for="field in action.fields"
          :key="field.name"
          :model-value="values[field.name]"
          :field="field"
          :path="field.name"
          :errors="shownErrors"
          :read-only="false"
          @update:model-value="set(field.name, $event)"
        />
      </div>
      <p v-if="errors['']?.length" class="field-error" role="alert">{{ errors[''].join(' ') }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="submit" :class="['btn', danger ? 'btn-danger' : 'btn-primary']" :disabled="busy">
          {{ actionLabel(action) }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(30rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
h2 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
}
p {
  margin: 0 0 1rem;
}
.count {
  color: var(--text-muted);
}
.fields {
  display: grid;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
