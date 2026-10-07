<script setup lang="ts">
import { ChevronRight, EyeOff, Folder, FolderOpen, Lock } from '@lucide/vue'
import { computed } from 'vue'
import type { Id } from '../lib/api'
import type { FolderNode } from '../lib/folders'
import { t } from '../lib/i18n'

/** One folder in the media library's tree, with its subfolders when open. */
const props = defineProps<{
  node: FolderNode
  depth: number
  current: Id | null
  expanded: ReadonlySet<string>
  /** The folder files are dragged over. */
  over: string | null
}>()
const emit = defineEmits<{
  select: [Id]
  toggle: [Id]
  dragover: [string | null]
  drop: [Id]
}>()

const key = computed(() => String(props.node.id))
const open = computed(() => props.expanded.has(key.value))
const active = computed(() => props.current !== null && String(props.current) === key.value)
</script>

<template>
  <li>
    <div
      :class="['row', { active, over: over === key }]"
      :style="{ '--depth': depth }"
      @dragover.prevent="emit('dragover', key)"
      @dragleave="emit('dragover', null)"
      @drop.prevent="emit('drop', node.id)"
    >
      <button
        v-if="node.children.length"
        type="button"
        class="twist"
        :aria-expanded="open"
        :aria-label="t(open ? 'list.collapse' : 'list.expand', { title: node.name })"
        @click="emit('toggle', node.id)"
      >
        <ChevronRight :size="14" aria-hidden="true" />
      </button>
      <span v-else class="twist" aria-hidden="true" />
      <button type="button" class="name" :aria-current="active ? 'true' : undefined" @click="emit('select', node.id)">
        <component :is="active ? FolderOpen : Folder" :size="15" aria-hidden="true" />
        <span class="text">{{ node.name }}</span>
        <Lock v-if="node.permissions" :size="12" class="lock" :aria-label="t('folders.restricted')" />
        <EyeOff v-if="node.private" :size="12" class="lock" :aria-label="t('folders.private')" />
      </button>
    </div>
    <ul v-if="open && node.children.length" class="children">
      <FolderTreeItem
        v-for="child in node.children"
        :key="String(child.id)"
        :node="child"
        :depth="depth + 1"
        :current="current"
        :expanded="expanded"
        :over="over"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @dragover="emit('dragover', $event)"
        @drop="emit('drop', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.children {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
  padding-left: calc(var(--depth) * 0.9rem);
  border-radius: var(--radius-sm);
}
.row.active {
  background: var(--accent-soft);
}
.row.over {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}
.twist {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.twist[aria-expanded='true'] :deep(svg) {
  transform: rotate(90deg);
}
.name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  flex: 1;
  padding: 0.3rem 0.4rem 0.3rem 0.1rem;
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
.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lock {
  flex: none;
  color: var(--faint);
}
</style>
