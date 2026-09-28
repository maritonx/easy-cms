<script setup lang="ts">
import { computed } from 'vue'
import { label, t } from '../lib/i18n'
import { session } from '../lib/session'

/**
 * The permissions of an API key: a table of collections and globals against what the key may
 * do with each. Stored as `{ collections: { slug: ops[] }, globals: { slug: ops[] } }`.
 */
type Ops = Record<string, string[]>
interface Permissions {
  collections?: Ops
  globals?: Ops
}

const props = defineProps<{ modelValue: unknown; readOnly: boolean; labelledby?: string }>()
const emit = defineEmits<{ 'update:modelValue': [Permissions] }>()

const value = computed<Permissions>(() =>
  typeof props.modelValue === 'object' && props.modelValue !== null
    ? (props.modelValue as Permissions)
    : {},
)

// Keys never reach users or other keys, so those rows are not offered.
const EXCLUDED = new Set(['users', 'api-keys'])
const collections = computed(
  () => session.schema?.collections.filter((c) => !EXCLUDED.has(c.slug)) ?? [],
)
const globals = computed(() => session.schema?.globals ?? [])

interface Row {
  group: 'collections' | 'globals'
  slug: string
  name: string
  /** Operations that make sense for this row. */
  ops: string[]
}
const COLUMNS = ['read', 'create', 'update', 'delete', 'publish'] as const
const rows = computed<Row[]>(() => [
  ...collections.value.map((c) => ({
    group: 'collections' as const,
    slug: c.slug,
    name: label(c.labels?.plural, c.slug),
    ops: ['read', 'create', 'update', 'delete', ...(c.drafts ? ['publish'] : [])],
  })),
  ...globals.value.map((g) => ({
    group: 'globals' as const,
    slug: g.slug,
    name: label(g.label, g.slug),
    ops: ['read', 'update', ...(g.drafts ? ['publish'] : [])],
  })),
])

const has = (row: Row, op: string) => value.value[row.group]?.[row.slug]?.includes(op) ?? false

function toggle(row: Row, op: string, on: boolean) {
  const group = { ...(value.value[row.group] ?? {}) }
  const current = new Set(group[row.slug] ?? [])
  if (on) {
    current.add(op)
    // Changing or publishing needs reading.
    if (op !== 'read') current.add('read')
  } else {
    current.delete(op)
    if (op === 'read') current.clear()
  }
  const ordered = COLUMNS.filter((c) => current.has(c))
  if (ordered.length) group[row.slug] = ordered
  else delete group[row.slug]
  emit('update:modelValue', { ...value.value, [row.group]: group })
}

const opLabel = (row: Row, op: string) =>
  op === 'create' && row.slug === 'media' ? t('apiKey.upload') : t(`apiKey.${op}` as 'apiKey.read')
</script>

<template>
  <div class="permissions" role="group" :aria-labelledby="labelledby">
    <p class="field-hint">{{ t('apiKey.permissionsHint') }}</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col" />
            <th v-for="op in COLUMNS" :key="op" scope="col">{{ t(`apiKey.${op}`) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.group}:${row.slug}`">
            <th scope="row">
              {{ row.name }}
              <span v-if="row.group === 'globals'" class="kind">{{ t('apiKey.global') }}</span>
            </th>
            <td v-for="op in COLUMNS" :key="op">
              <input
                v-if="row.ops.includes(op)"
                type="checkbox"
                :checked="has(row, op)"
                :disabled="readOnly"
                :aria-label="`${row.name}: ${opLabel(row, op)}`"
                :title="opLabel(row, op)"
                @change="toggle(row, op, ($event.target as HTMLInputElement).checked)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.permissions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
th,
td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--border);
  text-align: center;
}
tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
}
thead th {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-2);
}
tbody th {
  text-align: left;
  font-weight: 500;
  white-space: nowrap;
}
.kind {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  color: var(--text-muted);
}
input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
}
</style>
