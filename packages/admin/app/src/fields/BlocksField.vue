<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import { ArrowDown, ArrowUp, Plus, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { contentLocale } from '../lib/content-locale'
import { initialValues } from '../lib/fields'
import { label, t } from '../lib/i18n'
import FieldList from './FieldList.vue'

type Row = Record<string, unknown>
type Block = NonNullable<AdminField['blocks']>[number]

const props = defineProps<{
  field: AdminField
  modelValue: Row[]
  path: string
  errors: Record<string, string[]>
  readOnly: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Row[]] }>()

const rows = computed(() => props.modelValue ?? [])
const blocks = computed(() => props.field.blocks ?? [])
const messages = computed(() => props.errors[props.path] ?? [])
const canAdd = computed(
  () =>
    !props.readOnly &&
    (props.field.maxRows === undefined || rows.value.length < props.field.maxRows),
)
const menuOpen = ref(false)

const blockOf = (row: Row): Block | undefined => blocks.value.find((b) => b.slug === row.blockType)
const blockLabel = (block: Block | undefined, fallback: string) =>
  label(block?.labels?.singular, block?.slug ?? fallback)

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Date.now() + Math.random())
}
function add(block: Block) {
  menuOpen.value = false
  emit('update:modelValue', [
    ...rows.value,
    { id: newId(), blockType: block.slug, ...initialValues(block.fields) },
  ])
}
function remove(index: number) {
  emit(
    'update:modelValue',
    rows.value.filter((_, i) => i !== index),
  )
}
function move(index: number, delta: number) {
  const next = [...rows.value]
  const [row] = next.splice(index, 1)
  next.splice(index + delta, 0, row as Row)
  emit('update:modelValue', next)
}
function update(index: number, row: Row) {
  emit(
    'update:modelValue',
    rows.value.map((r, i) => (i === index ? { ...row, id: r.id, blockType: r.blockType } : r)),
  )
}
</script>

<template>
  <fieldset class="blocks">
    <legend class="field-label">
      {{ label(field.label, field.name) }}<span v-if="field.required" class="field-required" aria-hidden="true">*</span>
      <span v-if="field.localized" class="field-locale" :title="t('locale.localized')" aria-hidden="true">{{ contentLocale()?.toUpperCase() }}</span>
    </legend>
    <ol class="rows">
      <li
        v-for="(row, index) in rows"
        :key="String(row.id ?? index)"
        class="row card"
        :aria-label="t('field.block', { n: index + 1, type: blockLabel(blockOf(row), String(row.blockType)) })"
      >
        <div class="row-header">
          <span class="row-title">
            <span class="block-type">{{ blockLabel(blockOf(row), String(row.blockType)) }}</span>
            <span class="muted">#{{ index + 1 }}</span>
          </span>
          <div v-if="!readOnly" class="row-actions">
            <button type="button" class="btn btn-ghost btn-icon" :disabled="index === 0" :aria-label="t('field.moveUp', { n: index + 1 })" @click="move(index, -1)"><ArrowUp :size="15" aria-hidden="true" /></button>
            <button type="button" class="btn btn-ghost btn-icon" :disabled="index === rows.length - 1" :aria-label="t('field.moveDown', { n: index + 1 })" @click="move(index, 1)"><ArrowDown :size="15" aria-hidden="true" /></button>
            <button type="button" class="btn btn-ghost btn-icon" :aria-label="t('field.removeRow', { n: index + 1 })" @click="remove(index)"><X :size="15" aria-hidden="true" /></button>
          </div>
        </div>
        <FieldList
          v-if="blockOf(row)"
          :fields="blockOf(row)?.fields ?? []"
          :model-value="row"
          :prefix="`${path}.${index}.`"
          :errors="errors"
          :read-only="readOnly"
          @update:model-value="update(index, $event)"
        />
        <p v-else class="field-error">{{ t('field.unknownBlock', { type: String(row.blockType) }) }}</p>
        <p v-for="m in errors[`${path}.${index}.blockType`] ?? []" :key="m" class="field-error">{{ m }}</p>
      </li>
    </ol>
    <div v-if="canAdd" class="add">
      <button
        type="button"
        class="btn add-button"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        @click="menuOpen = !menuOpen"
      >
        <Plus :size="16" aria-hidden="true" />
        {{ t('field.addBlock') }}
      </button>
      <ul v-if="menuOpen" class="menu card" role="menu">
        <li v-for="block in blocks" :key="block.slug" role="none">
          <button type="button" role="menuitem" class="menu-item" @click="add(block)">
            {{ blockLabel(block, block.slug) }}
          </button>
        </li>
      </ul>
    </div>
    <p v-for="m in messages" :key="m" class="field-error">{{ m }}</p>
  </fieldset>
</template>

<style scoped>
.blocks {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.row {
  padding: 0.6rem 1rem 1rem;
  background: var(--surface);
}
.row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.row-title {
  display: flex;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
}
.block-type {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-weight: 500;
}
.row-actions {
  display: flex;
  gap: 0.15rem;
}
.add {
  position: relative;
}
.add-button {
  width: 100%;
  border-style: dashed;
  color: var(--text-muted);
}
.menu {
  position: absolute;
  z-index: 10;
  min-width: 12rem;
  margin: 0.25rem 0 0;
  padding: 0.25rem;
  list-style: none;
  box-shadow: var(--shadow);
}
.menu-item {
  display: block;
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.menu-item:hover,
.menu-item:focus-visible {
  background: var(--accent-soft);
}
</style>
