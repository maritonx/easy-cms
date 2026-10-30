<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '../lib/i18n'

const props = defineProps<{
  open: boolean
  message: string
  confirmLabel?: string
  /** A number to type before confirming, e.g. how many documents a delete removes. */
  typeToConfirm?: number | undefined
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
const typed = ref('')
const ready = computed(
  () =>
    props.typeToConfirm === undefined ||
    typed.value.replace(/[,\s]/g, '') === String(props.typeToConfirm),
)

watch(
  () => props.open,
  (open) => {
    typed.value = ''
    if (open) dialog.value?.showModal()
    else dialog.value?.close()
  },
)
</script>

<template>
  <dialog ref="dialog" class="dialog card" @cancel.prevent="emit('cancel')">
    <p>{{ message }}</p>
    <label v-if="typeToConfirm !== undefined" class="type-to-confirm">
      <span>{{ t('common.typeToConfirm', { count: typeToConfirm.toLocaleString() }) }}</span>
      <input v-model="typed" class="input" inputmode="numeric" autocomplete="off" />
    </label>
    <div class="actions">
      <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
      <button type="button" class="btn btn-danger" :disabled="!ready" @click="emit('confirm')">
        {{ confirmLabel ?? t('common.confirm') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  max-width: 26rem;
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.dialog p {
  margin: 0 0 1.25rem;
}
.type-to-confirm {
  display: grid;
  gap: 0.35rem;
  margin: 0 0 1.25rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
