<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import { t } from '../lib/i18n'

/** Names a new folder, or renames one. */
const props = defineProps<{ open: boolean; title: string; initial?: string; error?: string }>()
const emit = defineEmits<{ save: [string]; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const name = ref('')
const id = useId()

watch(
  () => props.open,
  async (open) => {
    if (!open) return dialog.value?.close()
    name.value = props.initial ?? ''
    dialog.value?.showModal()
    await nextTick()
    input.value?.select()
  },
)
function save() {
  const value = name.value.trim()
  if (value) emit('save', value)
}
</script>

<template>
  <dialog ref="dialog" class="dialog card" :aria-labelledby="`${id}-title`" @cancel.prevent="emit('cancel')">
    <form @submit.prevent="save">
      <h2 :id="`${id}-title`">{{ title }}</h2>
      <div class="field">
        <label class="field-label" :for="id">{{ t('folders.name') }}</label>
        <input :id="id" ref="input" v-model="name" class="input" maxlength="120" required :aria-invalid="!!error" :aria-describedby="error ? `${id}-error` : undefined" />
        <p v-if="error" :id="`${id}-error`" class="error" role="alert">{{ error }}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn btn-primary" :disabled="!name.trim()">{{ t('edit.save') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(24rem, calc(100vw - 2rem));
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
.field {
  margin-bottom: 1.25rem;
}
.error {
  margin: 0.35rem 0 0;
  color: var(--danger);
  font-size: 0.85rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
