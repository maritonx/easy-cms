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
/** A chosen document: its collection and id. */
interface Chosen {
  relationTo: string
  id: Id
}

const props = defineProps<{
  id: string
  /** Several collections (#327): values are `{ relationTo, value }`. */
  to: string | string[]
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

const polymorphic = Array.isArray(props.to)
const targets = polymorphic ? (props.to as string[]) : [props.to as string]
/** The user's role can read the collection (Settings → Roles); otherwise values are kept. */
const readable = (slug: string) => {
  const collection = findCollection(slug)
  return !collection || collection.permissions.read
}
/** The collections the picker searches: one, or the one chosen beside the search. */
const searchable = targets.filter(readable)
const current = ref(searchable[0] ?? targets[0] ?? '')
const target = computed(() => findCollection(current.value))
const noAccess = searchable.length === 0
const collectionLabel = (slug: string) =>
  label(findCollection(slug)?.labels?.singular, singularize(slug))

const selected = computed<Chosen[]>(() => {
  const raw = props.hasMany
    ? Array.isArray(props.modelValue)
      ? (props.modelValue as unknown[])
      : []
    : props.modelValue === null || props.modelValue === undefined
      ? []
      : [props.modelValue]
  return raw.flatMap((item): Chosen[] => {
    if (!polymorphic) return [{ relationTo: targets[0] as string, id: item as Id }]
    const pair = item as { relationTo?: unknown; value?: unknown } | null
    if (!pair || typeof pair.relationTo !== 'string') return []
    const value = pair.value
    const id = value && typeof value === 'object' ? (value as Doc).id : (value as Id)
    return [{ relationTo: pair.relationTo, id }]
  })
})
const keyOf = (pick: Chosen) => `${pick.relationTo}:${pick.id}`
const selectedKeys = computed(() => new Set(selected.value.map(keyOf)))
const storedValue = (pick: Chosen) =>
  polymorphic ? { relationTo: pick.relationTo, value: pick.id } : pick.id

// Titles of selected documents, fetched once and cached.
const titles = ref<Record<string, string>>({})
async function loadTitles(picks: Chosen[]) {
  const missing = picks.filter((pick) => !(keyOf(pick) in titles.value))
  for (const slug of new Set(missing.map((pick) => pick.relationTo))) {
    const ids = missing.filter((pick) => pick.relationTo === slug).map((pick) => pick.id)
    try {
      const result = await api<Paginated<Doc>>(
        'GET',
        `/${slug}${toQuery({ where: { id: { in: ids } }, limit: 100, depth: 0, draft: true })}`,
      )
      for (const doc of result.docs)
        titles.value[`${slug}:${doc.id}`] = titleOf(findCollection(slug), doc)
    } catch {
      // no read access: show ids
    }
  }
  for (const pick of missing) titles.value[keyOf(pick)] ??= `#${pick.id}`
}
/** A chip's text: the title, or "Loading…" until it arrives (`#id` when it can't be read). */
const chipTitle = (pick: Chosen) => titles.value[keyOf(pick)] ?? t('common.loading')
onMounted(() => loadTitles(selected.value))
watch(selected, loadTitles)

const query = ref('')
const open = ref(false)
const options = ref<Doc[]>([])
/** The page of results shown up to, and whether there are more (#282). */
const page = ref(1)
const hasMore = ref(false)

// What this browser picked last in this collection, offered first while the search is empty.
const RECENT_MAX = 5
const recentKey = () => `easy-cms-recent:${current.value}`
interface Recent {
  id: Id
  title: string
}
function readRecent(): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey()) ?? '[]')
    return Array.isArray(list) ? (list as Recent[]).slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}
const recent = ref<Recent[]>(readRecent())
function remember(id: Id, title: string) {
  recent.value = [{ id, title }, ...recent.value.filter((r) => r.id !== id)].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(recentKey(), JSON.stringify(recent.value))
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
const isSelected = (id: Id) => selectedKeys.value.has(`${current.value}:${id}`)
const recentShown = computed<Item[]>(() =>
  query.value || props.filterPath
    ? []
    : recent.value
        .filter((r) => !isSelected(r.id))
        .map((r) => ({ id: r.id, title: r.title, recent: true })),
)
const items = computed<Item[]>(() => {
  const picked = new Set(recentShown.value.map((r) => String(r.id)))
  return [
    ...recentShown.value,
    ...options.value
      .filter((d) => !picked.has(String(d.id)))
      .map((d) => ({ id: d.id, title: titleOf(target.value, d), recent: false })),
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
  const slug = current.value
  const field = target.value?.useAsTitle
  // A title with a trigram index needs `searchMin` characters; until then, no filter.
  const long = [...query.value].length >= (target.value?.searchMin ?? 1)
  const where = query.value && field && long ? { [field]: { like: query.value } } : undefined
  const run = ++latest
  const next = more ? page.value + 1 : 1
  searching.value = true
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${slug}${toQuery({ where, limit: 10, page: next, depth: 0, draft: true, sort: field ?? '-updatedAt' })}&count=false${filterQuery()}`,
    )
    if (run !== latest) return
    const found = result.docs.filter((d) => !isSelected(d.id))
    options.value = more ? [...options.value, ...found] : found
    page.value = next
    hasMore.value = result.hasNextPage
    for (const doc of result.docs)
      titles.value[`${slug}:${doc.id}`] = titleOf(findCollection(slug), doc)
  } catch {
    if (run !== latest) return
    if (!more) options.value = []
    hasMore.value = false
  }
  searching.value = false
  if (!more) active.value = 0
}
/** Another collection beside the search: its recent picks and results. */
function switchCollection() {
  recent.value = readRecent()
  options.value = []
  void search()
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
  const pick = { relationTo: current.value, id: item.id }
  titles.value[keyOf(pick)] = item.title
  remember(item.id, item.title)
  emit(
    'update:modelValue',
    props.hasMany ? [...selected.value.map(storedValue), storedValue(pick)] : storedValue(pick),
  )
  query.value = ''
  open.value = props.hasMany
  if (props.hasMany) void search()
}
function remove(pick: Chosen) {
  emit(
    'update:modelValue',
    props.hasMany ? selected.value.filter((p) => keyOf(p) !== keyOf(pick)).map(storedValue) : null,
  )
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
// With several collections, in the one chosen beside the search.
const canCreate = computed(() => {
  const collection = target.value
  return (
    !!collection?.permissions.create &&
    !collection.drafts &&
    !collection.versions &&
    !collection.preview &&
    // Files are uploaded, and folders made, in the media library.
    collection.slug !== 'media' &&
    collection.slug !== 'media-folders' &&
    !props.noCreate
  )
})
const creating = ref(false)
/** The search text becomes the new document's title. */
const createInitial = computed(() =>
  query.value && target.value?.useAsTitle ? { [target.value.useAsTitle]: query.value } : undefined,
)
function created(doc: Doc) {
  creating.value = false
  choose({ id: doc.id, title: titleOf(target.value, doc) })
  open.value = false
}
</script>

<template>
  <div class="relationship">
    <ul v-if="selected.length" class="chips">
      <li v-for="pick in selected" :key="keyOf(pick)" class="chip">
        <span v-if="polymorphic" class="chip-collection">{{ `${collectionLabel(pick.relationTo)} · ` }}</span>
        <span v-if="!readable(pick.relationTo)">#{{ pick.id }}</span>
        <RouterLink v-else :to="`/collections/${pick.relationTo}/${pick.id}`">{{ chipTitle(pick) }}</RouterLink>
        <button v-if="!readOnly && readable(pick.relationTo)" type="button" class="chip-remove" :aria-label="t('field.remove', { title: chipTitle(pick) })" @click="remove(pick)"><X :size="13" aria-hidden="true" /></button>
      </li>
    </ul>
    <p v-if="noAccess" class="field-hint">
      {{ t('field.noAccess', { label: label(target?.labels?.plural, current) }) }}
    </p>
    <div v-else-if="!readOnly && (hasMany || !selected.length)" class="combo" :class="{ several: searchable.length > 1 }">
      <select
        v-if="searchable.length > 1"
        v-model="current"
        class="input collection"
        :aria-label="t('field.collection')"
        @change="switchCollection"
      >
        <option v-for="slug in searchable" :key="slug" :value="slug">{{ collectionLabel(slug) }}</option>
      </select>
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
    <button v-if="!readOnly && !noAccess && canCreate && (hasMany || !selected.length)" type="button" class="btn btn-ghost btn-sm create" @click="creating = true">
      <Plus :size="15" aria-hidden="true" />
      {{ t('edit.create', { label: collectionLabel(current) }) }}
    </button>
    <DocumentDrawer
      v-if="creating"
      :slug="current"
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
.combo.several {
  display: flex;
  gap: 0.4rem;
}
.combo.several .collection {
  flex: 0 0 auto;
  width: auto;
  max-width: 40%;
}
.combo.several input {
  flex: 1;
  min-width: 0;
}
.chip-collection {
  color: var(--text-muted);
  font-size: 0.85em;
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
