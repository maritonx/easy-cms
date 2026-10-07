<script setup lang="ts">
import { Folder, Images } from '@lucide/vue'
import { computed, ref, useId, watch } from 'vue'
import type { Id } from '../lib/api'
import { atLeast, type FolderLevel, type FolderNode, type FolderTree } from '../lib/folders'
import { t } from '../lib/i18n'

/**
 * Chooses where files or a folder go. Folders the user may not add to (`need`) can't be chosen,
 * nor `exclude` (a folder moved can't go inside itself).
 */
const props = defineProps<{
  open: boolean
  title: string
  tree: FolderTree
  need: FolderLevel
  /** What the user may do at the top level. */
  rootLevel: FolderLevel
  exclude?: readonly Id[]
  /** Where it is now. */
  from: Id | null
}>()
const emit = defineEmits<{ move: [Id | null]; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
const choice = ref<string>('')
const id = useId()

watch(
  () => props.open,
  (open) => {
    if (!open) return dialog.value?.close()
    choice.value = ''
    dialog.value?.showModal()
  },
)

interface Option {
  key: string
  node: FolderNode | null
  depth: number
  disabled: boolean
}
const options = computed<Option[]>(() => {
  const skip = new Set((props.exclude ?? []).map(String))
  const out: Option[] = [
    {
      key: 'root',
      node: null,
      depth: 0,
      disabled: !atLeast(props.rootLevel, props.need) || props.from === null,
    },
  ]
  const walk = (list: FolderNode[], depth: number) => {
    for (const node of list) {
      if (skip.has(String(node.id))) continue
      out.push({
        key: String(node.id),
        node,
        depth,
        disabled: !atLeast(node.level, props.need) || String(props.from) === String(node.id),
      })
      walk(node.children, depth + 1)
    }
  }
  walk(props.tree.roots, 1)
  return out
})
function move() {
  if (!choice.value) return
  emit('move', choice.value === 'root' ? null : (props.tree.byId.get(choice.value)?.id ?? null))
}
</script>

<template>
  <dialog ref="dialog" class="dialog card" :aria-labelledby="`${id}-title`" @cancel.prevent="emit('cancel')">
    <form @submit.prevent="move">
      <h2 :id="`${id}-title`">{{ title }}</h2>
      <fieldset class="options">
        <legend class="visually-hidden">{{ t('folders.moveTo') }}</legend>
        <label v-for="o in options" :key="o.key" :class="['option', { disabled: o.disabled }]" :style="{ '--depth': o.depth }">
          <input v-model="choice" type="radio" :name="id" :value="o.key" :disabled="o.disabled" />
          <component :is="o.node ? Folder : Images" :size="15" aria-hidden="true" />
          <span class="text">{{ o.node ? o.node.name : t('folders.top') }}</span>
        </label>
      </fieldset>
      <div class="actions">
        <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn btn-primary" :disabled="!choice">{{ t('folders.move') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(26rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
h2 {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}
.options {
  max-height: min(22rem, 55vh);
  overflow-y: auto;
  margin: 0 0 1.25rem;
  padding: 0.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.option {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.5rem 0.35rem calc(0.5rem + var(--depth) * 1rem);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.9rem;
}
.option:hover:not(.disabled) {
  background: var(--surface-2);
}
.option:has(input:checked) {
  background: var(--accent-soft);
}
.option.disabled {
  color: var(--faint);
  cursor: not-allowed;
}
.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
