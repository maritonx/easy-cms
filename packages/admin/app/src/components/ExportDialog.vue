<script setup lang="ts">
import { Download } from '@lucide/vue'
import { computed, onMounted, ref, useId } from 'vue'
import { t } from '../lib/i18n'

/** Export CSV (#89): which rows and which columns, then the file downloads. */
const props = defineProps<{
  /** Documents matching the list, `more` past what was counted. */
  total: number | null
  more: boolean
  selected: number
  busy?: boolean
}>()
const emit = defineEmits<{
  export: [rows: 'all' | 'selected', columns: 'shown' | 'all']
  close: []
}>()

/** More rows than the server writes: filter further. */
const MAX = 100_000
const headingId = useId()
const dialog = ref<HTMLDialogElement>()
const rows = ref<'all' | 'selected'>(props.selected > 0 ? 'selected' : 'all')
const columns = ref<'shown' | 'all'>('shown')
/** Past what the list counts, the server says whether it is too many. */
const unsure = computed(() => rows.value === 'all' && props.more)
const count = computed(() =>
  rows.value === 'selected' ? props.selected : props.more ? null : (props.total ?? null),
)
onMounted(() => dialog.value?.showModal())
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="dialog card" :aria-labelledby="headingId" @cancel.prevent="emit('close')">
      <form method="dialog" @submit.prevent="emit('export', rows, columns)">
        <h2 :id="headingId">{{ t('export.title') }}</h2>
        <fieldset>
          <legend>{{ t('export.rows') }}</legend>
          <label>
            <input v-model="rows" type="radio" value="all" />
            {{ more ? t('export.allMore', { count: (total ?? 0).toLocaleString() }) : t('export.all', { count: (total ?? 0).toLocaleString() }) }}
          </label>
          <label v-if="selected > 0">
            <input v-model="rows" type="radio" value="selected" />
            {{ t('export.selected', { count: selected.toLocaleString() }) }}
          </label>
        </fieldset>
        <fieldset>
          <legend>{{ t('export.columns') }}</legend>
          <label><input v-model="columns" type="radio" value="shown" /> {{ t('export.shown') }}</label>
          <label><input v-model="columns" type="radio" value="all" /> {{ t('export.allFields') }}</label>
        </fieldset>
        <p v-if="unsure" class="field-hint">{{ t('export.tooMany', { max: MAX.toLocaleString() }) }}</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="emit('close')">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="busy">
            <Download :size="15" aria-hidden="true" />
            {{ count === null ? t('export.download') : t('export.downloadCount', { count: count.toLocaleString() }) }}
          </button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.dialog {
  width: min(28rem, calc(100vw - 2rem));
  padding: 1.25rem 1.4rem;
  border: 0;
  color: var(--text);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
h2 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}
fieldset {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0 0 1rem;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: 0.4rem;
  font-weight: 600;
}
label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
