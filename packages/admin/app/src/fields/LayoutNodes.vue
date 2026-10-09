<script setup lang="ts">
import type { AdminField, AdminLayoutNode } from '@easy-cms/core'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import { label } from '../lib/i18n'
import FieldList from './FieldList.vue'

/**
 * Fields placed by `admin.layout`: one by one, side by side in rows, or in sections that fold.
 * Tabs are drawn by FieldLayout; this draws what is inside them.
 */
const props = defineProps<{
  nodes: readonly AdminLayoutNode[]
  fields: readonly AdminField[]
  modelValue: Record<string, unknown>
  errors: Record<string, string[]>
  readOnly?: boolean
  /** Sections folded, by key; FieldLayout keeps it so errors can open them. */
  folded: Record<string, boolean>
  /** This list's place in the layout, for the sections' keys. */
  at?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [Record<string, unknown>]
  toggle: [key: string]
}>()

const byName = (name: string) => props.fields.filter((f) => f.name === name)
const key = (i: number) => `${props.at ?? ''}${i}`
</script>

<template>
  <div class="layout-nodes">
    <template v-for="(node, i) in nodes" :key="key(i)">
      <FieldList
        v-if="node.type === 'field' && byName(node.name).length"
        :fields="byName(node.name)"
        :model-value="modelValue"
        :errors="errors"
        :read-only="readOnly"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <div v-else-if="node.type === 'row'" class="layout-row">
        <FieldList
          :fields="node.fields.flatMap(byName)"
          :model-value="modelValue"
          :errors="errors"
          :read-only="readOnly"
          class="row-list"
          @update:model-value="emit('update:modelValue', $event)"
        />
      </div>
      <section v-else-if="node.type === 'collapsible'" class="layout-section">
        <h3 class="section-heading">
          <button
            type="button"
            class="section-toggle"
            :aria-expanded="!folded[key(i)]"
            :aria-controls="`section-${key(i)}`"
            @click="emit('toggle', key(i))"
          >
            <component :is="folded[key(i)] ? ChevronRight : ChevronDown" :size="18" aria-hidden="true" />
            {{ label(node.label, '') }}
          </button>
        </h3>
        <div v-show="!folded[key(i)]" :id="`section-${key(i)}`" class="section-body">
          <p v-if="node.description" class="field-hint">{{ label(node.description, '') }}</p>
          <LayoutNodes
            :nodes="node.nodes"
            :fields="fields"
            :model-value="modelValue"
            :errors="errors"
            :read-only="readOnly"
            :folded="folded"
            :at="`${key(i)}.`"
            @update:model-value="emit('update:modelValue', $event)"
            @toggle="emit('toggle', $event)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.layout-nodes {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
/* Fields side by side: an equal share each, or their `admin.width`. */
.layout-row :deep(.row-list) {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 1rem;
}
.layout-row :deep(.row-list > .field-slot) {
  flex: 1 1 0;
  min-width: 12rem;
}
.layout-row :deep(.row-list > .width-1-4) {
  flex-grow: 3;
}
.layout-row :deep(.row-list > .width-1-3) {
  flex-grow: 4;
}
.layout-row :deep(.row-list > .width-1-2) {
  flex-grow: 6;
}
.layout-row :deep(.row-list > .width-2-3) {
  flex-grow: 8;
}
.layout-row :deep(.row-list > .width-3-4) {
  flex-grow: 9;
}
.layout-row :deep(.row-list > .width-full) {
  flex-basis: 100%;
}
.layout-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.section-heading {
  margin: 0;
  font-size: 1rem;
}
.section-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 3rem;
  padding: 0 1rem;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.section-toggle:hover {
  background: var(--surface-2);
  border-radius: var(--radius);
}
.section-body {
  padding: 0 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
