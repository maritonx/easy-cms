<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import { computed, inject, onMounted, ref, watch } from 'vue'
import DocumentDrawer from '../components/DocumentDrawer.vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import { titleOf } from '../lib/fields'
import { useFilterQuery } from '../lib/filter'
import { label, singularize, t } from '../lib/i18n'
import { FORM } from '../lib/plugins'
import { findCollection } from '../lib/session'

type Id = number | string

const props = defineProps<{
  id: string
  to: string
  hasMany: boolean
  /** The field's path, when its `filterOptions` limit the choices. */
  filterPath?: string | undefined
  /** No "Create" in place (`admin.allowCreate: false`). */
  noCreate?: boolean
  modelValue: unknown
  readOnly: boolean
  invalid: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const target = findCollection(props.to)
/** The user's role can't read the collection (Settings → Roles): the value is kept as it is. */
const noAccess = computed(() => !!target && !target.permissions.read)
const selectedIds = computed<Id[]>(() => {
  if (props.hasMany) return Array.isArray(props.modelValue) ? (props.modelValue as Id[]) : []
  return props.modelValue === null || props.modelValue === undefined ? [] : [props.modelValue as Id]
})

// Titles of selected documents, fetched once and cached.
const titles = ref<Record<string, string>>({})
async function loadTitles(ids: Id[]) {
  const missing = ids.filter((id) => !(String(id) in titles.value))
  if (!missing.length) return
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${props.to}${toQuery({ where: { id: { in: missing } }, limit: 100, depth: 0, draft: true })}`,
    )
    for (const doc of result.docs) titles.value[String(doc.id)] = titleOf(target, doc)
  } catch {
    // no read access: show ids
  }
  for (const id of missing) titles.value[String(id)] ??= `#${id}`
}
onMounted(() => loadTitles(selectedIds.value))
watch(selectedIds, loadTitles)

const query = ref('')
const open = ref(false)
const options = ref<Doc[]>([])
const active = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined

const form = inject(FORM, null)
/** The server applies the field's `filterOptions` for this document. */
const filterQuery = useFilterQuery(() => props.filterPath)

async function search() {
  const field = target?.useAsTitle
  const where = query.value && field ? { [field]: { like: query.value } } : undefined
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${props.to}${toQuery({ where, limit: 10, depth: 0, draft: true, sort: field ?? '-updatedAt' })}${filterQuery()}`,
    )
    options.value = result.docs.filter((d) => !selectedIds.value.includes(d.id))
    for (const doc of result.docs) titles.value[String(doc.id)] = titleOf(target, doc)
  } catch {
    options.value = []
  }
  active.value = 0
}
function onInput() {
  open.value = true
  clearTimeout(timer)
  timer = setTimeout(search, 200)
}
function onFocus() {
  open.value = true
  void search()
}

function choose(doc: Doc) {
  titles.value[String(doc.id)] = titleOf(target, doc)
  emit('update:modelValue', props.hasMany ? [...selectedIds.value, doc.id] : doc.id)
  query.value = ''
  open.value = props.hasMany
  if (props.hasMany) void search()
}
function removeId(id: Id) {
  emit('update:modelValue', props.hasMany ? selectedIds.value.filter((v) => v !== id) : null)
}
function onKeydown(event: KeyboardEvent) {
  if (!open.value || !options.value.length) return
  if (event.key === 'ArrowDown') active.value = (active.value + 1) % options.value.length
  else if (event.key === 'ArrowUp')
    active.value = (active.value - 1 + options.value.length) % options.value.length
  else if (event.key === 'Enter') choose(options.value[active.value] as Doc)
  else if (event.key === 'Escape') open.value = false
  else return
  event.preventDefault()
}
const listId = computed(() => `${props.id}-options`)

// Creating what the field should point to without leaving the page: for small collections.
const canCreate = computed(
  () =>
    !!target?.permissions.create &&
    !target.drafts &&
    !target.versions &&
    !target.preview &&
    // Files are uploaded, and folders made, in the media library.
    target.slug !== 'media' &&
    target.slug !== 'media-folders' &&
    !props.noCreate,
)
const creating = ref(false)
/** The search text becomes the new document's title. */
const createInitial = computed(() =>
  query.value && target?.useAsTitle ? { [target.useAsTitle]: query.value } : undefined,
)
function created(doc: Doc) {
  creating.value = false
  choose(doc)
  open.value = false
}
</script>

<template>
  <div class="relationship">
    <ul v-if="selectedIds.length" class="chips">
      <li v-for="id in selectedIds" :key="String(id)" class="chip">
        <span v-if="noAccess">#{{ id }}</span>
        <RouterLink v-else :to="`/collections/${to}/${id}`">{{ titles[String(id)] ?? `#${id}` }}</RouterLink>
        <button v-if="!readOnly && !noAccess" type="button" class="chip-remove" :aria-label="t('field.remove', { title: titles[String(id)] ?? `#${id}` })" @click="removeId(id)"><X :size="13" aria-hidden="true" /></button>
      </li>
    </ul>
    <p v-if="noAccess" class="field-hint">
      {{ t('field.noAccess', { label: label(target?.labels?.plural, to) }) }}
    </p>
    <div v-else-if="!readOnly && (hasMany || !selectedIds.length)" class="combo">
      <input
        :id="id"
        v-model="query"
        class="input"
        role="combobox"
        autocomplete="off"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-invalid="invalid"
        :aria-activedescendant="open && options.length ? `${listId}-${active}` : undefined"
        :placeholder="t('field.searchRelation')"
        @input="onInput"
        @focus="onFocus"
        @blur="open = false"
        @keydown="onKeydown"
      />
      <ul v-if="open" :id="listId" class="options card" role="listbox">
        <li
          v-for="(doc, index) in options"
          :id="`${listId}-${index}`"
          :key="String(doc.id)"
          role="option"
          :aria-selected="index === active"
          :class="{ active: index === active }"
          @mousedown.prevent="choose(doc)"
        >
          {{ titleOf(target, doc) }}
        </li>
        <li v-if="!options.length" class="muted empty">{{ t('field.noMatches') }}</li>
      </ul>
    </div>
    <button v-if="!readOnly && !noAccess && canCreate && (hasMany || !selectedIds.length)" type="button" class="btn btn-ghost btn-sm create" @click="creating = true">
      <Plus :size="15" aria-hidden="true" />
      {{ t('edit.create', { label: label(target?.labels?.singular, singularize(to)) }) }}
    </button>
    <DocumentDrawer
      v-if="creating"
      :slug="to"
      :id="null"
      :initial="createInitial"
      @saved="(doc) => created(doc)"
      @close="creating = false"
    />
  </div>
</template>

<style scoped>
.create {
  align-self: flex-start;
  color: var(--accent-ink);
}
.relationship {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.35rem 0.2rem 0.65rem;
  border-radius: 999px;
  background: var(--accent-soft);
}
.chip a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 550;
}
.chip-remove {
  border: 0;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
}
.chip-remove:hover {
  background: var(--surface);
}
.combo {
  position: relative;
}
.options {
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 16rem;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  box-shadow: var(--shadow);
}
.options li {
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.options li.active {
  background: var(--accent-soft);
}
.options li.empty {
  cursor: default;
}
</style>
