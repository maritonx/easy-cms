<script setup lang="ts">
import { ListFilter, Plus, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import { titleOf } from '../lib/fields'
import { humanize, label, t } from '../lib/i18n'
import {
  type Condition,
  conditionOf,
  type FilterField,
  type FilterOp,
  kindOf,
  OPS,
  readCondition,
  today,
  valuesOf,
} from '../lib/list-filters'
import { loadRelationTitles, relationTitle } from '../lib/relation-titles'
import { findCollection } from '../lib/session'
import ZoneNote from './ZoneNote.vue'

/**
 * The list's "Filter" button and its panel: conditions on the collection's fields, one per row,
 * all of which documents must meet. Conditions the panel doesn't offer (the status menu, "Mine",
 * a link's `?f_form=3`) are kept as they are.
 */
const props = defineProps<{
  fields: FilterField[]
  conditions: Condition[]
  timeZone?: string | undefined
}>()
const emit = defineEmits<{ apply: [conditions: Condition[]] }>()

interface Row {
  path: string
  op: FilterOp
  values: string[]
  /** A relationship's search, and what it found. */
  query: string
  found: { id: string; title: string }[]
}

const open = ref(false)
/** Opens rightwards when the button sits near the left, e.g. the toolbar wrapped. */
const fromLeft = ref(false)
const root = ref<HTMLElement>()
const button = ref<HTMLButtonElement>()
const rows = ref<Row[]>([])

const fieldOf = (path: string) => props.fields.find((f) => f.path === path)
const kindAt = (path: string) => {
  const field = fieldOf(path)
  return field ? kindOf(field.field) : null
}
/** The conditions this panel edits. */
const own = computed(() => props.conditions.filter((c) => fieldOf(c.field)))

const fieldLabel = (f: FilterField) =>
  f.trail.map((part) => label(part.label, humanize(part.name))).join(' › ')

function rowOf(condition: Condition): Row | null {
  const kind = kindAt(condition.field)
  const read = kind ? readCondition(condition, kind, props.timeZone) : null
  return read ? { path: condition.field, ...read, query: '', found: [] } : null
}

function newRow(): Row {
  const first = props.fields[0] as FilterField
  return {
    path: first.path,
    op: OPS[kindOf(first.field) ?? 'text'][0] as FilterOp,
    values: [],
    query: '',
    found: [],
  }
}

/** Opens the panel with the conditions it edits (or one empty row). */
async function show() {
  rows.value = own.value.map(rowOf).filter((r): r is Row => r !== null)
  if (rows.value.length === 0) rows.value = [newRow()]
  incomplete.value = new Set()
  for (const row of rows.value) {
    const field = fieldOf(row.path)?.field
    if (kindAt(row.path) === 'relation' && field?.to) void loadRelationTitles(field.to, row.values)
  }
  fromLeft.value = false
  open.value = true
  await nextTick()
  const panel = root.value?.querySelector<HTMLElement>('.filter-panel')
  if (panel && panel.getBoundingClientRect().left < 8) fromLeft.value = true
  root.value?.querySelector<HTMLElement>('.filter-panel select')?.focus()
}
defineExpose({ show })

function close(focus = true) {
  open.value = false
  if (focus) button.value?.focus()
}

const rowList = ref<HTMLElement>()
const addButton = ref<HTMLButtonElement>()

async function addRow() {
  rows.value.push(newRow())
  await nextTick()
  rowList.value?.querySelector<HTMLElement>('.row:last-child select')?.focus()
}

function removeRow(i: number) {
  const [row] = rows.value.splice(i, 1)
  if (row) incomplete.value.delete(row)
  addButton.value?.focus()
}

function changeField(row: Row, path: string) {
  row.path = path
  row.op = OPS[kindAt(path) ?? 'text'][0] as FilterOp
  row.values = []
  row.query = ''
  row.found = []
}

function changeOp(row: Row, op: FilterOp) {
  row.op = op
  // A list stays a list; one value or a range starts empty.
  if (valuesOf(op) !== 'list') row.values = row.values.slice(0, valuesOf(op) === 2 ? 2 : 1)
}

function toggleValue(row: Row, value: string) {
  row.values = row.values.includes(value)
    ? row.values.filter((v) => v !== value)
    : [...row.values, value]
}

/** "Today", "Last 7 days": days worked out now, not kept as "7 days ago". */
function preset(row: Row, days: number) {
  if (days === 0) {
    row.op = 'on'
    row.values = [today(props.timeZone)]
  } else {
    row.op = 'between'
    row.values = [today(props.timeZone, -(days - 1)), today(props.timeZone)]
  }
}

let searching = 0
async function search(row: Row) {
  const field = fieldOf(row.path)?.field
  const to = field?.to
  const target = to ? findCollection(to) : undefined
  const titleField = target?.useAsTitle
  const query = row.query.trim()
  const run = ++searching
  const where =
    query && titleField && [...query].length >= (target?.searchMin ?? 1)
      ? { [titleField]: { like: query } }
      : undefined
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${to}${toQuery({ where, limit: 10, depth: 0, draft: true, sort: titleField ?? '-updatedAt' })}`,
    )
    if (run !== searching) return
    row.found = result.docs.map((doc) => ({ id: String(doc.id), title: titleOf(target, doc) }))
  } catch {
    if (run === searching) row.found = []
  }
}

const conditionAt = (row: Row) => {
  const kind = kindAt(row.path)
  return kind ? conditionOf(row.path, kind, row.op, row.values, props.timeZone) : null
}
/** Rows still missing a value, once Apply was pressed: shown, not silently dropped. */
const incomplete = ref(new Set<Row>())

async function apply() {
  incomplete.value = new Set(rows.value.filter((row) => !conditionAt(row)))
  if (incomplete.value.size) {
    await nextTick()
    const row = root.value?.querySelector('.row.incomplete')
    // The value to fill in first; a list of choices, its first box.
    const target = ['input:not([type="checkbox"])', 'input', 'select']
      .map((selector) => row?.querySelector<HTMLElement>(selector))
      .find(Boolean)
    target?.focus()
    return
  }
  const made = rows.value.map(conditionAt).filter((c): c is Condition => c !== null)
  const others = props.conditions.filter((c) => !fieldOf(c.field))
  emit('apply', [...others, ...made])
  close()
}

function onDocumentClick(event: MouseEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) close(false)
}
onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="filter-wrap" @keydown.esc.stop="close()">
    <button
      ref="button"
      type="button"
      :class="['btn', 'btn-sm', { on: own.length }]"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open ? close() : show()"
    >
      <ListFilter :size="15" aria-hidden="true" />
      {{ t('filter.button') }}
      <span v-if="own.length" class="count">{{ own.length }}</span>
    </button>
    <div v-if="open" class="filter-scrim" aria-hidden="true" @click="close(false)" />
    <div v-if="open" :class="['filter-panel', { 'from-left': fromLeft }]" role="dialog" :aria-label="t('filter.title')">
      <p class="menu-title">{{ t('filter.title') }}</p>
      <ol ref="rowList" class="rows">
        <li v-for="(row, i) in rows" :key="i" :class="['row', { incomplete: incomplete.has(row) }]">
          <span v-if="i > 0" class="and">{{ t('filter.and') }}</span>
          <div class="controls">
            <label>
              <span class="visually-hidden">{{ t('filter.field') }}</span>
              <select class="input" :value="row.path" @change="changeField(row, ($event.target as HTMLSelectElement).value)">
                <option v-for="f in fields" :key="f.path" :value="f.path">{{ fieldLabel(f) }}</option>
              </select>
            </label>
            <label>
              <span class="visually-hidden">{{ t('filter.condition') }}</span>
              <select class="input" :value="row.op" @change="changeOp(row, ($event.target as HTMLSelectElement).value as FilterOp)">
                <option v-for="op in OPS[kindAt(row.path) ?? 'text']" :key="op" :value="op">{{ t(`filter.op.${op}`) }}</option>
              </select>
            </label>
            <button type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('filter.remove')" :title="t('filter.remove')" @click="removeRow(i)">
              <X :size="16" aria-hidden="true" />
            </button>
          </div>

          <!-- One value or a range: text, numbers, days. -->
          <div v-if="valuesOf(row.op) === 1 || valuesOf(row.op) === 2" :class="['values', { range: valuesOf(row.op) === 2 }]">
            <template v-for="n in valuesOf(row.op) === 2 ? [0, 1] : [0]" :key="n">
              <span v-if="n === 1" class="dash" aria-hidden="true">–</span>
              <label>
                <span class="visually-hidden">{{ valuesOf(row.op) === 2 ? t(n === 0 ? 'filter.from' : 'filter.to') : t('filter.value') }}</span>
                <input
                  v-model="row.values[n]"
                  class="input"
                  :type="kindAt(row.path) === 'date' ? 'date' : kindAt(row.path) === 'number' ? 'number' : 'text'"
                  :aria-invalid="incomplete.has(row) && !row.values[n] ? 'true' : undefined"
                  :aria-describedby="incomplete.has(row) ? `filter-need-${i}` : undefined"
                  @input="incomplete.delete(row)"
                  @keydown.enter.prevent="apply"
                />
              </label>
            </template>
          </div>
          <ZoneNote v-if="kindAt(row.path) === 'date'" />
          <div v-if="kindAt(row.path) === 'date'" class="presets" role="group" :aria-label="t('filter.presets')">
            <button type="button" class="btn btn-ghost btn-sm" @click="preset(row, 0); incomplete.delete(row)">{{ t('filter.today') }}</button>
            <button type="button" class="btn btn-ghost btn-sm" @click="preset(row, 7); incomplete.delete(row)">{{ t('filter.last7') }}</button>
            <button type="button" class="btn btn-ghost btn-sm" @click="preset(row, 30); incomplete.delete(row)">{{ t('filter.last30') }}</button>
          </div>

          <!-- A list of choices: a select field's options. -->
          <fieldset v-if="valuesOf(row.op) === 'list' && kindAt(row.path) === 'select'" class="choices">
            <legend class="visually-hidden">{{ t('filter.value') }}</legend>
            <label v-for="o in fieldOf(row.path)?.field.options ?? []" :key="o.value" class="menu-item">
              <input type="checkbox" :checked="row.values.includes(o.value)" @change="toggleValue(row, o.value); incomplete.delete(row)" />
              {{ label(o.label, o.value) }}
            </label>
          </fieldset>

          <!-- Related documents, found by their title. -->
          <fieldset v-if="valuesOf(row.op) === 'list' && kindAt(row.path) === 'relation'" class="choices">
            <legend class="visually-hidden">{{ t('filter.value') }}</legend>
            <label v-for="id in row.values" :key="`v-${id}`" class="menu-item">
              <input type="checkbox" checked @change="toggleValue(row, id)" />
              {{ relationTitle(fieldOf(row.path)?.field.to ?? '', id) }}
            </label>
            <label>
              <span class="visually-hidden">{{ t('filter.search') }}</span>
              <input v-model="row.query" class="input" type="search" :placeholder="t('filter.search')" @input="search(row)" @focus="search(row)" />
            </label>
            <p v-if="row.query.trim() && row.found.length === 0" class="none">{{ t('field.noMatches') }}</p>
            <label v-for="doc in row.found.filter((d) => !row.values.includes(d.id))" :key="doc.id" class="menu-item">
              <input type="checkbox" @change="toggleValue(row, doc.id); incomplete.delete(row)" />
              {{ doc.title }}
            </label>
          </fieldset>
          <p v-if="incomplete.has(row)" :id="`filter-need-${i}`" class="need" role="alert">{{ t('filter.needValue') }}</p>
        </li>
      </ol>
      <div class="actions">
        <button ref="addButton" type="button" class="btn btn-ghost btn-sm" @click="addRow">
          <Plus :size="15" aria-hidden="true" />
          {{ t('filter.add') }}
        </button>
        <span class="spacer" />
        <button type="button" class="btn btn-sm" @click="close()">{{ t('filter.cancel') }}</button>
        <button type="button" class="btn btn-primary btn-sm" @click="apply">{{ t('filter.apply') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-wrap {
  position: relative;
}
.count {
  min-width: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.75rem;
  line-height: 1.25rem;
  text-align: center;
}
.filter-panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.375rem);
  /* The button sits towards the right of the toolbar: the panel opens leftwards from it. */
  right: 0;
  width: min(34rem, calc(100vw - 2rem));
  max-height: min(70vh, 40rem);
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}
@media (min-width: 641px) {
  .filter-panel.from-left {
    right: auto;
    left: 0;
  }
}
.rows {
  display: grid;
  gap: 0.75rem;
  margin: 0.5rem 0;
  padding: 0;
  list-style: none;
}
.row {
  display: grid;
  gap: 0.375rem;
}
.and {
  color: var(--text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
}
.controls {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.375rem;
}
.controls select,
.values input {
  width: 100%;
  height: 2.5rem;
}
.values {
  display: grid;
  gap: 0.375rem;
}
.values.range {
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}
.dash {
  color: var(--text-muted);
}
.need {
  margin: 0;
  color: var(--danger);
  font-size: 0.8125rem;
}
.row.incomplete .input[aria-invalid='true'] {
  border-color: var(--danger);
}
.none {
  margin: 0.25rem 0;
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.filter-scrim {
  display: none;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.choices {
  display: grid;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  border: 0;
}
.actions {
  display: flex;
  gap: 0.375rem;
  align-items: center;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
/* As tall as the fields above them. */
.actions .btn,
.controls .btn-icon {
  min-height: 2.5rem;
}
.controls .btn-icon {
  width: 2.5rem;
}
.spacer {
  flex: 1;
}
/* On a phone: a sheet over the bottom of the screen. */
@media (max-width: 640px) {
  .filter-panel {
    position: fixed;
    inset: auto 0 0;
    width: auto;
    max-height: 85vh;
    border-radius: var(--radius) var(--radius) 0 0;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
  }
  /* Behind the sheet: dims the list, and a tap closes it. */
  .filter-scrim {
    display: block;
    position: fixed;
    z-index: 29;
    inset: 0;
    background: color-mix(in srgb, #000 35%, transparent);
  }
  /* Fingers (44px), and no zoom on focus: iOS zooms into text under 16px. In px, as the admin's rem is 14px. */
  .filter-panel .input,
  .filter-panel .btn {
    min-height: 44px;
    font-size: 16px;
  }
  .filter-panel .btn-icon {
    min-width: 44px;
  }
  .filter-panel .menu-item {
    min-height: 44px;
  }
}
</style>
