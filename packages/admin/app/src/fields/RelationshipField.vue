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
/** A chip's text: the title, or "Loading…" until it arrives (`#id` when it can't be read). */
const chipTitle = (id: Id) => titles.value[String(id)] ?? t('common.loading')
onMounted(() => loadTitles(selectedIds.value))
watch(selectedIds, loadTitles)

const query = ref('')
const open = ref(false)
const options = ref<Doc[]>([])
/** The page of results shown up to, and whether there are more (#282). */
const page = ref(1)
const hasMore = ref(false)

// What this browser picked last in this collection, offered first while the search is empty.
const RECENT_MAX = 5
const recentKey = `easy-cms-recent:${props.to}`
interface Recent {
  id: Id
  title: string
}
function readRecent(): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey) ?? '[]')
    return Array.isArray(list) ? (list as Recent[]).slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}
const recent = ref<Recent[]>(readRecent())
function remember(id: Id, title: string) {
  recent.value = [{ id, title }, ...recent.value.filter((r) => r.id !== id)].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(recentKey, JSON.stringify(recent.value))
  } catch {
    // private mode: for this page only
  }
}
/**
 * The options shown: recent picks first while nothing is typed (not when the field's
 * `filterOptions` narrow the choices per document), then the search's results.
 */
interface Item {
  id: Id
  title: string
  recent: boolean
}
const recentShown = computed<Item[]>(() =>
  query.value || props.filterPath
    ? []
    : recent.value
        .filter((r) => !selectedIds.value.includes(r.id))
        .map((r) => ({ id: r.id, title: r.title, recent: true })),
)
const items = computed<Item[]>(() => {
  const picked = new Set(recentShown.value.map((r) => String(r.id)))
  return [
    ...recentShown.value,
    ...options.value
      .filter((d) => !picked.has(String(d.id)))
      .map((d) => ({ id: d.id, title: titleOf(target, d), recent: false })),
  ]
})
/** The keyboard's place: an item, or `items.length` for "Show more". */
const lastIndex = computed(() => items.value.length + (hasMore.value ? 1 : 0))
/** A search is under way: say so instead of "No matches". */
const searching = ref(false)
/** Only the latest search may set the options; an older, slower answer is dropped. */
let latest = 0
const active = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined

const form = inject(FORM, null)
/** The server applies the field's `filterOptions` for this document. */
const filterQuery = useFilterQuery(() => props.filterPath)

async function search(more = false) {
  const field = target?.useAsTitle
  // A title with a trigram index needs `searchMin` characters; until then, no filter.
  const long = [...query.value].length >= (target?.searchMin ?? 1)
  const where = query.value && field && long ? { [field]: { like: query.value } } : undefined
  const run = ++latest
  const next = more ? page.value + 1 : 1
  searching.value = true
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${props.to}${toQuery({ where, limit: 10, page: next, depth: 0, draft: true, sort: field ?? '-updatedAt' })}&count=false${filterQuery()}`,
    )
    if (run !== latest) return
    const found = result.docs.filter((d) => !selectedIds.value.includes(d.id))
    options.value = more ? [...options.value, ...found] : found
    page.value = next
    hasMore.value = result.hasNextPage
    for (const doc of result.docs) titles.value[String(doc.id)] = titleOf(target, doc)
  } catch {
    if (run !== latest) return
    if (!more) options.value = []
    hasMore.value = false
  }
  searching.value = false
  if (!more) active.value = 0
}
/** The next 10 results, under the ones shown. */
function showMore() {
  void search(true)
}
function onInput() {
  open.value = true
  searching.value = true
  clearTimeout(timer)
  timer = setTimeout(search, 200)
}
function onFocus() {
  open.value = true
  void search()
}

function choose(item: { id: Id; title: string }) {
  titles.value[String(item.id)] = item.title
  remember(item.id, item.title)
  emit('update:modelValue', props.hasMany ? [...selectedIds.value, item.id] : item.id)
  query.value = ''
  open.value = props.hasMany
  if (props.hasMany) void search()
}
function removeId(id: Id) {
  emit('update:modelValue', props.hasMany ? selectedIds.value.filter((v) => v !== id) : null)
}
function onKeydown(event: KeyboardEvent) {
  if (!open.value || !lastIndex.value) return
  if (event.key === 'ArrowDown') active.value = (active.value + 1) % lastIndex.value
  else if (event.key === 'ArrowUp')
    active.value = (active.value - 1 + lastIndex.value) % lastIndex.value
  else if (event.key === 'Enter') {
    const item = items.value[active.value]
    if (item) choose(item)
    else showMore()
  } else if (event.key === 'Escape') open.value = false
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
  choose({ id: doc.id, title: titleOf(target, doc) })
  open.value = false
}
</script>

<template>
  <div class="relationship">
    <ul v-if="selectedIds.length" class="chips">
      <li v-for="id in selectedIds" :key="String(id)" class="chip">
        <span v-if="noAccess">#{{ id }}</span>
        <RouterLink v-else :to="`/collections/${to}/${id}`">{{ chipTitle(id) }}</RouterLink>
        <button v-if="!readOnly && !noAccess" type="button" class="chip-remove" :aria-label="t('field.remove', { title: chipTitle(id) })" @click="removeId(id)"><X :size="13" aria-hidden="true" /></button>
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
        :aria-activedescendant="open && lastIndex ? (active < items.length ? `${listId}-${active}` : `${listId}-more`) : undefined"
        :placeholder="t('field.searchRelation')"
        @input="onInput"
        @focus="onFocus"
        @blur="open = false"
        @keydown="onKeydown"
      />
      <ul v-if="open" :id="listId" class="options card" role="listbox">
        <template v-for="(item, index) in items" :key="`${item.recent ? 'r' : 'o'}${item.id}`">
          <li v-if="index === 0 && item.recent" class="group" role="presentation">{{ t('field.recentlyPicked') }}</li>
          <li v-else-if="index === recentShown.length && recentShown.length" class="group" role="presentation">{{ t('field.allResults') }}</li>
          <li
            :id="`${listId}-${index}`"
            role="option"
            :aria-selected="index === active"
            :class="{ active: index === active }"
            @mousedown.prevent="choose(item)"
          >
            {{ item.title }}
          </li>
        </template>
        <li
          v-if="hasMore"
          :id="`${listId}-more`"
          role="option"
          :aria-selected="active === items.length"
          :class="['more', { active: active === items.length }]"
          @mousedown.prevent="showMore"
        >
          {{ t('field.showMore') }}
        </li>
        <li v-if="!items.length && searching" class="muted empty loading-line" role="status"><span class="spinner" aria-hidden="true" />{{ t('common.loading') }}</li>
        <li v-else-if="!items.length" class="muted empty">{{ t('field.noMatches') }}</li>
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
.options li.group {
  padding: 0.45rem 0.75rem 0.2rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--faint);
  cursor: default;
}
.options li.group:not(:first-child) {
  margin-top: 0.25rem;
  border-top: 1px solid var(--border);
  padding-top: 0.55rem;
}
.options li.more {
  color: var(--accent-ink);
  font-weight: 600;
}
.options li.empty {
  cursor: default;
}
</style>
