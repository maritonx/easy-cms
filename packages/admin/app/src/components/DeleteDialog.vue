<script setup lang="ts">
import type { AdminCollection } from '@easy-cms/core'
import { computed, ref, watch } from 'vue'
import { api } from '../lib/api'
import { label, t } from '../lib/i18n'

/**
 * "Delete this document?", and for collections with `admin.confirmDelete`: what goes with it
 * (`impact`), and its title typed to confirm (`typeTitle`).
 */
const props = defineProps<{
  open: boolean
  collection: AdminCollection | undefined
  /** The document's id and title. */
  doc: { id: string | number; title: string } | null
  message: string
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const dialog = ref<HTMLDialogElement>()
const typed = ref('')
const impact = ref('')
const guard = computed(() => props.collection?.confirmDelete)
const ready = computed(() => !guard.value?.typeTitle || typed.value.trim() === props.doc?.title)

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      dialog.value?.close()
      return
    }
    typed.value = ''
    impact.value = ''
    dialog.value?.showModal()
    const path = guard.value?.impact
    if (path && props.doc) {
      try {
        const result = await api<{ message?: unknown }>(
          'GET',
          `${path}?id=${encodeURIComponent(String(props.doc.id))}`,
        )
        impact.value = result.message ? label(result.message, '') : ''
      } catch {
        impact.value = ''
      }
    }
  },
)
</script>

<template>
  <dialog ref="dialog" class="dialog card" @cancel.prevent="emit('cancel')">
    <p>{{ message }}</p>
    <p v-if="impact" class="impact">{{ impact }}</p>
    <label v-if="guard?.typeTitle && doc" class="type">
      <span>{{ t('delete.typeTitle', { title: doc.title }) }}</span>
      <input v-model="typed" class="input" type="text" autocomplete="off" :aria-label="t('delete.typeTitle', { title: doc.title })" />
    </label>
    <div class="actions">
      <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
      <button type="button" class="btn btn-danger" :disabled="!ready" @click="emit('confirm')">
        {{ t('edit.delete') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  max-width: 28rem;
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.dialog p {
  margin: 0 0 1rem;
}
.impact {
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-sm, 8px);
  background: var(--danger-soft, rgb(220 38 38 / 8%));
  color: var(--danger, #b42318);
  font-size: 0.9rem;
}
.type {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 1.25rem;
  font-size: 0.875rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
