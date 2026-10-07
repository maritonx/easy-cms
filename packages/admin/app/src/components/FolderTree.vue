<script setup lang="ts">
import { Images } from '@lucide/vue'
import { ref, watch } from 'vue'
import type { Id } from '../lib/api'
import { type FolderTree, pathTo } from '../lib/folders'
import { t } from '../lib/i18n'
import FolderTreeItem from './FolderTreeItem.vue'

/** The media library's folders as a tree: the top level, then each folder. */
const props = defineProps<{ tree: FolderTree; current: Id | null; label: string }>()
const emit = defineEmits<{ select: [Id | null]; drop: [Id | null] }>()

const expanded = ref<Set<string>>(new Set())
const over = ref<string | null>(null)

// The way down to the open folder stays open.
watch(
  () => [props.current, props.tree] as const,
  ([current, tree]) => {
    const path = pathTo(tree, current).slice(0, -1)
    if (path.length === 0) return
    expanded.value = new Set([...expanded.value, ...path.map((n) => String(n.id))])
  },
  { immediate: true },
)
function toggle(id: Id) {
  const next = new Set(expanded.value)
  const key = String(id)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}
function drop(id: Id | null) {
  over.value = null
  emit('drop', id)
}
</script>

<template>
  <nav class="folder-tree" :aria-label="label">
    <div
      :class="['row', 'root', { active: current === null, over: over === 'root' }]"
      @dragover.prevent="over = 'root'"
      @dragleave="over = null"
      @drop.prevent="drop(null)"
    >
      <button type="button" class="name" :aria-current="current === null ? 'true' : undefined" @click="emit('select', null)">
        <Images :size="15" aria-hidden="true" />
        <span>{{ t('folders.top') }}</span>
      </button>
    </div>
    <ul class="list">
      <FolderTreeItem
        v-for="node in tree.roots"
        :key="String(node.id)"
        :node="node"
        :depth="0"
        :current="current"
        :expanded="expanded"
        :over="over"
        @select="emit('select', $event)"
        @toggle="toggle"
        @dragover="over = $event"
        @drop="drop"
      />
    </ul>
  </nav>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  display: flex;
  border-radius: var(--radius-sm);
}
.row.active {
  background: var(--accent-soft);
}
.row.over {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}
.name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  padding: 0.35rem 0.5rem;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}
.row.active .name {
  color: var(--accent-ink);
  font-weight: 600;
}
</style>
