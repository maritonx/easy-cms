<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { label, t } from '../../lib/i18n'
import type { AdminBlock } from './block-node'

/** The field's blocks to insert, at the cursor (`/`) or below the toolbar's button (#328). */
const props = defineProps<{
  id: string
  blocks: readonly AdminBlock[]
  /** Where it opens, in the viewport. */
  at: { left: number; top: number }
}>()
const emit = defineEmits<{ choose: [AdminBlock]; close: [] }>()

const active = ref(0)
function onKeydown(event: KeyboardEvent) {
  const count = props.blocks.length
  if (event.key === 'ArrowDown') active.value = (active.value + 1) % count
  else if (event.key === 'ArrowUp') active.value = (active.value - 1 + count) % count
  else if (event.key === 'Enter') {
    const block = props.blocks[active.value]
    if (block) emit('choose', block)
  } else if (event.key === 'Escape') emit('close')
  else return
  event.preventDefault()
  event.stopPropagation()
}
const list = ref<HTMLElement>()
/** A click anywhere else closes it. */
function onPointer(event: MouseEvent) {
  if (!list.value?.contains(event.target as Node)) emit('close')
}
// Keys go to the menu while it is open, even with the editor focused.
onMounted(() => {
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('mousedown', onPointer, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  document.removeEventListener('mousedown', onPointer, true)
})
</script>

<template>
  <ul :id="id" ref="list" class="block-menu card" role="listbox" :aria-label="t('rte.blockInsert')" :style="{ left: `${at.left}px`, top: `${at.top}px` }">
    <li
      v-for="(block, index) in blocks"
      :id="`${id}-${index}`"
      :key="block.slug"
      role="option"
      :aria-selected="index === active"
      :class="{ active: index === active }"
      @mousedown.prevent
      @click="emit('choose', block)"
      @mouseenter="active = index"
    >
      {{ label(block.labels?.singular, block.slug) }}
    </li>
  </ul>
</template>

<style scoped>
.block-menu {
  position: fixed;
  z-index: 50;
  min-width: 12rem;
  max-height: 16rem;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  box-shadow: var(--shadow);
}
.block-menu li {
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.block-menu li.active {
  background: var(--accent-soft);
}
</style>
