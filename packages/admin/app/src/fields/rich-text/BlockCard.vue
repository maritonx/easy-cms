<script setup lang="ts">
import { AlertCircle, GripVertical, Pencil, Trash2 } from '@lucide/vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, ref, watch } from 'vue'
import PluginElement from '../../components/PluginElement.vue'
import { api, type Doc } from '../../lib/api'
import { titleOf } from '../../lib/fields'
import { label, t } from '../../lib/i18n'
import { findCollection } from '../../lib/session'
import type { BlockEditor } from './block-node'

/** A block in the rich text editor (#328): its label, a summary, and Edit / Delete. */
const props = defineProps(nodeViewProps)
const editor = computed(() => props.extension.options.editor as BlockEditor)
const id = computed(() => String(props.node.attrs.id ?? ''))
const blockType = computed(() => String(props.node.attrs.blockType ?? ''))
const fields = computed(() => (props.node.attrs.fields ?? {}) as Record<string, unknown>)
const block = computed(() => editor.value.blocks.find((b) => b.slug === blockType.value))
const name = computed(() =>
  block.value ? label(block.value.labels?.singular, block.value.slug) : blockType.value,
)

/** Errors in the block or its fields, from the last save. */
const errorCount = computed(() => {
  const prefix = `${editor.value.path}.${id.value}`
  return Object.entries(editor.value.errors())
    .filter(([path]) => path === prefix || path.startsWith(`${prefix}.`))
    .reduce((n, [, messages]) => n + messages.length, 0)
})

// The default summary: the first field with a value; a related document by its title.
const related = ref<string | null>(null)
const first = computed(() =>
  (block.value?.fields ?? []).find((f) => {
    const v = fields.value[f.name]
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  }),
)
async function loadRelated() {
  related.value = null
  const field = first.value
  if (!field || (field.type !== 'relationship' && field.type !== 'upload')) return
  const raw = [fields.value[field.name]].flat()[0] as unknown
  const pair =
    raw && typeof raw === 'object' ? (raw as { relationTo?: unknown; value?: unknown }) : null
  const slug =
    typeof pair?.relationTo === 'string'
      ? pair.relationTo
      : typeof field.to === 'string'
        ? field.to
        : ''
  const docId = pair ? pair.value : raw
  if (!slug || docId === null || docId === undefined) return
  const collection = findCollection(slug)
  try {
    const doc = await api<Doc>('GET', `/${slug}/${String(docId)}?depth=0&draft=true`)
    const title = titleOf(collection, doc)
    related.value = pair ? `${label(collection?.labels?.singular, slug)} · ${title}` : title
  } catch {
    related.value = `#${String(docId)}`
  }
}
watch(fields, loadRelated, { immediate: true })
const summary = computed(() => {
  const own = editor.value.summaries[id.value]
  if (own !== undefined) return own
  const field = first.value
  if (!field) return ''
  if (field.type === 'relationship' || field.type === 'upload') return related.value ?? ''
  const value = fields.value[field.name]
  if (field.type === 'select') {
    const option = field.options?.find((o) => o.value === value)
    return option ? label(option.label, String(value)) : String(value)
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 100 ? `${text.slice(0, 100)}…` : text
})
const element = computed(() => {
  const own = block.value?.summary
  return own && own !== 'server' ? { tag: own } : null
})

function edit() {
  const position = props.getPos()
  if (typeof position === 'number') editor.value.edit(position)
}
</script>

<template>
  <NodeViewWrapper class="rte-block" :class="{ selected, invalid: errorCount > 0, unknown: !block }" :data-block-id="id">
    <span v-if="!editor.readOnly()" class="handle" data-drag-handle :title="t('rte.blockMove')" aria-hidden="true">
      <GripVertical :size="16" />
    </span>
    <div class="body">
      <span class="name">{{ block ? name : t('rte.blockUnknown', { type: blockType }) }}</span>
      <PluginElement v-if="element" :component="element" :value="fields" read-only />
      <span v-else-if="summary" class="summary">{{ summary }}</span>
      <span v-if="errorCount" class="errors"><AlertCircle :size="14" aria-hidden="true" />{{ t('rte.blockErrors', { count: errorCount }) }}</span>
    </div>
    <div v-if="!editor.readOnly()" class="actions">
      <button v-if="block" type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('rte.blockEdit', { name })" :title="t('rte.blockEdit', { name })" @click="edit">
        <Pencil :size="15" aria-hidden="true" />
      </button>
      <button type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('rte.blockDelete', { name })" :title="t('rte.blockDelete', { name })" @click="deleteNode()">
        <Trash2 :size="15" aria-hidden="true" />
      </button>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.rte-block {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0;
  padding: 0.6rem 0.6rem 0.6rem 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  user-select: none;
}
.rte-block.selected {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.rte-block.invalid {
  border-color: var(--danger);
}
.rte-block.unknown {
  border-style: dashed;
}
.handle {
  display: inline-flex;
  color: var(--faint);
  cursor: grab;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;
}
.name {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}
.summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.errors {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--danger);
  font-size: 0.85rem;
}
.actions {
  display: flex;
  gap: 0.1rem;
}
</style>
