<script setup lang="ts">
import { X } from '@lucide/vue'
import { onMounted, ref, useId } from 'vue'
import { label, t } from '../../lib/i18n'
import FieldList from '../FieldList.vue'
import type { AdminBlock } from './block-node'

/** Edits one rich text block's fields in a panel over the page (#328). */
const props = defineProps<{
  block: AdminBlock
  modelValue: Record<string, unknown>
  /** `body.<id>.`: where its fields' errors are. */
  prefix: string
  errors: Record<string, string[]>
  readOnly: boolean
}>()
const emit = defineEmits<{ done: [Record<string, unknown>]; close: [] }>()

const headingId = useId()
const dialog = ref<HTMLDialogElement>()
// A copy: the fields are a reactive proxy, which structuredClone refuses.
const form = ref<Record<string, unknown>>(JSON.parse(JSON.stringify(props.modelValue)))

function onClick(event: MouseEvent) {
  // The dialog element itself is the backdrop; the panel is inside it.
  if (event.target === dialog.value) emit('done', form.value)
}
onMounted(() => dialog.value?.showModal())
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="drawer block-drawer" :aria-labelledby="headingId" @cancel.prevent="emit('done', form)" @click="onClick">
      <form class="panel" novalidate @submit.prevent.stop="emit('done', form)">
        <header class="panel-header">
          <h2 :id="headingId">{{ label(block.labels?.singular, block.slug) }}</h2>
          <button type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('drawer.close')" @click="emit('done', form)">
            <X :size="18" aria-hidden="true" />
          </button>
        </header>
        <div class="panel-body">
          <FieldList v-model="form" :fields="block.fields" :prefix="prefix" :errors="errors" :read-only="readOnly" />
        </div>
        <footer class="panel-footer">
          <span class="spacer" />
          <button type="submit" class="btn btn-primary">{{ t('rte.blockDone') }}</button>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.drawer {
  position: fixed;
  inset: 0;
  width: 100vw;
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
}
.drawer::backdrop {
  background: rgb(0 0 0 / 35%);
}
.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(30rem, 100vw);
  background: var(--bg);
  box-shadow: var(--shadow);
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem 0.85rem 1.4rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.panel-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  flex-grow: 1;
  overflow-y: auto;
  padding: 1.4rem;
}
.panel-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.4rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.spacer {
  flex-grow: 1;
}
</style>
