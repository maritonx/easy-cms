<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Id } from '../lib/api'
import { buildTree, type FolderNode, foldersOn, loadFolders } from '../lib/folders'
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
  /** Media folders the key is limited to (`upload.folders`); none: every folder. */
  folders?: Id[]
}

const props = defineProps<{ modelValue: unknown; readOnly: boolean; labelledby?: string }>()
const emit = defineEmits<{ 'update:modelValue': [Permissions] }>()

const value = computed<Permissions>(() =>
  typeof props.modelValue === 'object' && props.modelValue !== null
    ? (props.modelValue as Permissions)
    : {},
)

// Keys never reach users or other keys, so those rows are not offered; media folders follow
// the key's media row.
const EXCLUDED = new Set(['users', 'api-keys', 'media-folders'])
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
/** A key can do no more than you: what you may not do yourself can't be ticked (only unticked). */
function yours(row: Row, op: string): boolean {
  const target =
    row.group === 'collections'
      ? session.schema?.collections.find((c) => c.slug === row.slug)
      : session.schema?.globals.find((g) => g.slug === row.slug)
  const permissions = target?.permissions as Record<string, boolean> | undefined
  return permissions?.[op] === true
}

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

// --- Media folders (`upload.folders`): every folder, or only some (with their subfolders) ---

const usesMedia = computed(() => (value.value.collections?.media?.length ?? 0) > 0)
const folderRows = ref<{ node: FolderNode; depth: number }[]>([])
/** "Only these folders" is chosen, even before any is ticked. */
const some = ref((value.value.folders?.length ?? 0) > 0)
onMounted(async () => {
  if (!foldersOn()) return
  const tree = buildTree(await loadFolders().catch(() => []))
  const out: { node: FolderNode; depth: number }[] = []
  const walk = (list: FolderNode[], depth: number) => {
    for (const node of list) {
      out.push({ node, depth })
      walk(node.children, depth + 1)
    }
  }
  walk(tree.roots, 0)
  folderRows.value = out
})
const chosen = (id: Id) => value.value.folders?.some((f) => String(f) === String(id)) ?? false
function setFolders(folders: Id[]) {
  const { folders: _old, ...rest } = value.value
  emit('update:modelValue', folders.length ? { ...rest, folders } : rest)
}
function toggleFolder(id: Id, on: boolean) {
  const current = (value.value.folders ?? []).filter((f) => String(f) !== String(id))
  setFolders(on ? [...current, id] : current)
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
                :disabled="readOnly || (!has(row, op) && !yours(row, op))"
                :aria-label="`${row.name}: ${opLabel(row, op)}`"
                :title="opLabel(row, op)"
                @change="toggle(row, op, ($event.target as HTMLInputElement).checked)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <fieldset v-if="foldersOn() && usesMedia" class="folders" :disabled="readOnly">
      <legend>{{ t('apiKey.folders') }}</legend>
      <label class="choice">
        <input type="radio" :checked="!some" @change="some = false; setFolders([])" />
        {{ t('apiKey.foldersAll') }}
      </label>
      <label class="choice">
        <input type="radio" :checked="some" @change="some = true" />
        {{ t('apiKey.foldersSome') }}
      </label>
      <ul v-if="some" class="folder-list">
        <li v-for="{ node, depth } in folderRows" :key="String(node.id)" :style="{ '--depth': depth }">
          <label class="choice">
            <input type="checkbox" :checked="chosen(node.id)" @change="toggleFolder(node.id, ($event.target as HTMLInputElement).checked)" />
            {{ node.name }}
          </label>
        </li>
      </ul>
    </fieldset>
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
.folders {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.25rem 0 0;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.folders legend {
  padding: 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.choice {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.875rem;
}
.folder-list {
  max-height: 14rem;
  margin: 0;
  padding: 0.25rem 0 0;
  overflow-y: auto;
  list-style: none;
}
.folder-list li {
  padding: 0.15rem 0 0.15rem calc(1.4rem + var(--depth) * 1rem);
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
