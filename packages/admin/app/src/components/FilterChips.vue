<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import { X } from '@lucide/vue'
import { watchEffect } from 'vue'
import { humanize, label, locale, t } from '../lib/i18n'
import {
  type Condition,
  type FilterField,
  type FilterKind,
  kindOf,
  readCondition,
} from '../lib/list-filters'
import { loadRelationTitles, relationTitle } from '../lib/relation-titles'

/** The list's conditions as chips: what the list shows at a glance; click one to edit, × to remove it. */
const props = defineProps<{
  conditions: Condition[]
  fields: FilterField[]
  /** All the collection's fields: links may filter by one the panel doesn't offer. */
  allFields: readonly AdminField[]
  /** The field naming a document's owner ("Mine"). */
  owner?: string | undefined
  userId?: string | undefined
  timeZone?: string | undefined
}>()
const emit = defineEmits<{ remove: [index: number]; edit: [] }>()

const fieldAt = (path: string): AdminField | undefined =>
  props.fields.find((f) => f.path === path)?.field ?? props.allFields.find((f) => f.name === path)

/** A day as the admin writes dates (Buddhist years in Thai). */
const formatDay = (day: string) =>
  new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`))

function valueText(field: AdminField, kind: FilterKind, value: string): string {
  if (kind === 'select') {
    const option = field.options?.find((o) => o.value === value)
    return option ? label(option.label, value) : value
  }
  if (kind === 'relation') return relationTitle(field.to ?? '', value)
  if (kind === 'date') return formatDay(value)
  return kind === 'text' ? `“${value}”` : value
}

function text(condition: Condition): string {
  if (condition.field === 'status' && 'equals' in condition.ops)
    return `${t('list.status')}: ${t(`status.${String(condition.ops.equals)}` as never)}`
  if (
    props.owner &&
    condition.field === props.owner &&
    String(condition.ops.equals) === props.userId
  )
    return t('list.mine')
  const field = fieldAt(condition.field)
  const name = field
    ? (props.fields.find((f) => f.path === condition.field)?.trail ?? [field])
        .map((part) => label(part.label, humanize(part.name)))
        .join(' › ')
    : humanize(condition.field)
  const kind = field ? kindOf(field) : null
  const read = kind ? readCondition(condition, kind, props.timeZone) : null
  if (!field || !kind || !read)
    return `${name}: ${Object.values(condition.ops).map(String).join(', ')}`
  const values = read.values.map((v) => valueText(field, kind, v))
  const shown =
    read.op === 'between'
      ? `${values[0]} – ${values[1]}`
      : values.join(read.op === 'noneOf' ? ', ' : ` ${t('filter.or')} `)
  return `${name} ${t(`filter.op.${read.op}`)}${shown ? ` ${shown}` : ''}`
}

// Titles of related documents named in conditions, e.g. from a shared link.
watchEffect(() => {
  for (const condition of props.conditions) {
    const field = fieldAt(condition.field)
    if (field?.to && (field.type === 'relationship' || field.type === 'upload')) {
      const ids = ['in', 'not_in', 'equals'].flatMap((op) => condition.ops[op] ?? []).map(String)
      void loadRelationTitles(field.to, ids)
    }
  }
})
</script>

<template>
  <ul v-if="conditions.length" class="chips" :aria-label="t('filter.active')">
    <li v-for="(condition, i) in conditions" :key="`${i}-${condition.field}`" class="chip">
      <button type="button" class="chip-text" :title="text(condition)" @click.stop="emit('edit')">{{ text(condition) }}</button>
      <button type="button" class="chip-remove" :aria-label="t('filter.removeOne', { filter: text(condition) })" @click="emit('remove', i)">
        <X :size="13" aria-hidden="true" />
      </button>
    </li>
  </ul>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
}
.chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 0.8125rem;
}
.chip-text {
  overflow: hidden;
  padding: 0.25rem 0.25rem 0.25rem 0.625rem;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.chip-remove {
  display: inline-grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  border-radius: 999px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.chip-remove:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}
</style>
