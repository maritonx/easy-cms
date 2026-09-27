<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  Inbox,
  Plus,
  Search,
  SearchX,
  Send,
  Trash2,
  X,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LocaleSwitcher from '../components/LocaleSwitcher.vue'
import MediaThumb from '../components/MediaThumb.vue'
import UploadDropzone from '../components/UploadDropzone.vue'
import { ApiError, api, type Doc, type Paginated, toQuery } from '../lib/api'
import { contentLocale, localeQuery, setContentLocale } from '../lib/content-locale'
import { titleOf } from '../lib/fields'
import { formatDate, humanize, label, t } from '../lib/i18n'
import { findCollection } from '../lib/session'
import { notify } from '../lib/toast'

const route = useRoute()
const router = useRouter()
const slug = String(route.params.slug)
const collection = findCollection(slug)
const PAGE_SIZE = 20
const isMedia = slug === 'media'

const titleField = collection?.useAsTitle
const titleLabel = computed(() => {
  const field = collection?.fields.find((f) => f.name === titleField)
  return field ? label(field.label, field.name) : 'ID'
})

// State lives in the URL so back/forward and reloads keep it.
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const sort = computed(() =>
  typeof route.query.sort === 'string' ? route.query.sort : '-updatedAt',
)
const statusFilter = computed(() =>
  route.query.status === 'published' || route.query.status === 'draft' ? route.query.status : '',
)

// --- Columns ----------------------------------------------------------------------------------

const COLUMN_TYPES = new Set([
  'text',
  'textarea',
  'email',
  'slug',
  'number',
  'date',
  'select',
  'boolean',
])
const SORTABLE_TYPES = new Set(['text', 'email', 'slug', 'number', 'date', 'select'])
/** Fields that can be shown as extra columns: plain values at the top level. */
const columnFields = computed<AdminField[]>(
  () => collection?.fields.filter((f) => COLUMN_TYPES.has(f.type) && f.name !== titleField) ?? [],
)
const columnsKey = `easy-cms-columns:${slug}`
function storedColumns(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(columnsKey) ?? '[]')
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}
const shownColumns = ref<string[]>(storedColumns())
const extraColumns = computed(() =>
  columnFields.value.filter((f) => shownColumns.value.includes(f.name)),
)
function toggleColumn(name: string) {
  shownColumns.value = shownColumns.value.includes(name)
    ? shownColumns.value.filter((c) => c !== name)
    : [...shownColumns.value, name]
  try {
    localStorage.setItem(columnsKey, JSON.stringify(shownColumns.value))
  } catch {
    // private mode: the choice lasts for this page only
  }
}
const columnsOpen = ref(false)
const columnsMenu = ref<HTMLElement>()
function onDocumentClick(event: MouseEvent) {
  if (columnsOpen.value && !columnsMenu.value?.contains(event.target as Node))
    columnsOpen.value = false
}

function cell(field: AdminField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value) && value.length === 0) return '—'
  if (field.type === 'date') return formatDate(value)
  if (field.type === 'boolean') return value ? t('common.yes') : t('common.no')
  if (field.type === 'select') {
    const values = Array.isArray(value) ? value : [value]
    return values
      .map((v) => {
        const option = field.options?.find((o) => o.value === v)
        return option ? label(option.label, String(v)) : String(v)
      })
      .join(', ')
  }
  return String(value)
}

// --- Filters ----------------------------------------------------------------------------------

/** Select fields become filter menus (up to three). */
const filterFields = computed(
  () =>
    collection?.fields.filter((f) => f.type === 'select' && f.options?.length).slice(0, 3) ?? [],
)
const filterValue = (name: string) => {
  const value = route.query[`f_${name}`]
  return typeof value === 'string' ? value : ''
}
const activeFilters = computed(
  () => filterFields.value.filter((f) => filterValue(f.name)).length + (statusFilter.value ? 1 : 0),
)

function whereOf() {
  const parts: Record<string, unknown>[] = []
  if (search.value && titleField) parts.push({ [titleField]: { like: search.value } })
  if (statusFilter.value) parts.push({ status: { equals: statusFilter.value } })
  for (const f of filterFields.value) {
    const value = filterValue(f.name)
    if (value) parts.push({ [f.name]: { equals: value } })
  }
  return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { and: parts }
}

// --- Loading ----------------------------------------------------------------------------------

const result = ref<Paginated<Doc> | null>(null)
const loading = ref(false)
const error = ref('')
const selected = ref<Set<Doc['id']>>(new Set())
// With versions and drafts, a live document can have a newer draft; the list shows the draft,
// so it needs to know separately which documents are live.
const separateDrafts = !!collection?.drafts && !!collection?.versions
const localized = computed(
  () => !!contentLocale() && (collection?.fields.some((f) => f.localized) ?? false),
)
function switchLocale(next: string) {
  setContentLocale(next)
  void load()
}
const liveIds = ref<Set<string>>(new Set())
const confirming = ref(false)
const busy = ref(false)

async function load() {
  if (!collection) return
  loading.value = true
  error.value = ''
  try {
    result.value = await api<Paginated<Doc>>(
      'GET',
      `/${slug}${toQuery({ where: whereOf(), sort: sort.value, limit: PAGE_SIZE, page: page.value, depth: 0, draft: true })}${localeQuery()}`,
    )
    selected.value = new Set()
    liveIds.value = separateDrafts ? await loadLive(result.value.docs) : new Set()
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 403
        ? t('common.forbidden')
        : String((e as Error).message)
  } finally {
    loading.value = false
  }
}

async function loadLive(docs: Doc[]): Promise<Set<string>> {
  const drafts = docs.filter((d) => d.status === 'draft').map((d) => d.id)
  if (drafts.length === 0) return new Set()
  const live = await api<Paginated<Doc>>(
    'GET',
    `/${slug}${toQuery({ where: { id: { in: drafts.join(',') } }, limit: drafts.length, depth: 0 })}`,
  )
  return new Set(live.docs.map((d) => String(d.id)))
}

function statusOf(doc: Doc): 'published' | 'draft' {
  return doc.status === 'published' || liveIds.value.has(String(doc.id)) ? 'published' : 'draft'
}

function setQuery(patch: Record<string, string | undefined>) {
  const query = { ...route.query, ...patch }
  for (const key of Object.keys(query))
    if (query[key] === undefined || query[key] === '') delete query[key]
  void router.replace({ query })
}
function clearFilters() {
  const patch: Record<string, undefined> = { status: undefined, page: undefined }
  for (const f of filterFields.value) patch[`f_${f.name}`] = undefined
  setQuery(patch)
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => setQuery({ q: value, page: undefined }), 250)
})
watch(() => route.query, load)
onMounted(() => {
  void load()
  document.addEventListener('click', onDocumentClick)
})
// A pending search must not apply its query to the next page.
onBeforeUnmount(() => {
  clearTimeout(debounce)
  document.removeEventListener('click', onDocumentClick)
})

function toggleSort(field: string) {
  setQuery({ sort: sort.value === field ? `-${field}` : field, page: undefined })
}
function sortState(field: string): 'ascending' | 'descending' | 'none' {
  if (sort.value === field) return 'ascending'
  if (sort.value === `-${field}`) return 'descending'
  return 'none'
}

const range = computed(() => {
  const r = result.value
  if (!r || r.totalDocs === 0) return null
  const from = (r.page - 1) * PAGE_SIZE + 1
  return { from, to: from + r.docs.length - 1, total: r.totalDocs }
})

// --- Selection and bulk actions ---------------------------------------------------------------

const allSelected = computed(
  () => !!result.value?.docs.length && result.value.docs.every((d) => selected.value.has(d.id)),
)
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(result.value?.docs.map((d) => d.id))
}
function toggle(id: Doc['id']) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
const canPublish = computed(() => !!collection?.drafts && !!collection?.permissions.update)

async function bulk(run: (id: Doc['id']) => Promise<unknown>, done: (count: number) => string) {
  const ids = [...selected.value]
  busy.value = true
  let count = 0
  try {
    for (const id of ids) {
      await run(id)
      count++
    }
    notify('success', done(count))
  } catch (e) {
    notify(
      'error',
      e instanceof ApiError && e.status === 403 ? t('common.forbidden') : (e as Error).message,
    )
  } finally {
    busy.value = false
  }
  await load()
}

const publishSelected = () =>
  bulk(
    (id) => api('PATCH', `/${slug}/${id}?depth=0`, { status: 'published' }),
    (count) => t('list.publishedCount', { count }),
  )
const unpublishSelected = () =>
  bulk(
    (id) => api('POST', `/${slug}/${id}/unpublish?depth=0`),
    (count) => t('list.unpublishedCount', { count }),
  )
async function deleteSelected() {
  confirming.value = false
  await bulk(
    (id) => api('DELETE', `/${slug}/${id}`),
    (count) => t('list.deletedCount', { count }),
  )
}
</script>

<template>
  <p v-if="!collection" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <header class="toolbar">
      <div class="heading">
        <h1>{{ label(collection.labels?.plural, collection.slug) }}</h1>
        <span v-if="result" class="count">{{ t(result.totalDocs === 1 ? 'list.countOne' : 'list.count', { count: result.totalDocs }) }}</span>
      </div>
      <div class="toolbar-actions">
        <LocaleSwitcher v-if="localized" @change="switchLocale" />
        <!-- Media is created by uploading, below. -->
        <RouterLink v-if="collection.permissions.create && !isMedia" :to="`/collections/${slug}/new`" class="btn btn-primary">
          <Plus :size="16" aria-hidden="true" />
          {{ t('list.new') }}
        </RouterLink>
      </div>
    </header>

    <div class="filters">
      <label v-if="titleField" class="search">
        <span class="visually-hidden">{{ t('list.search', { field: titleLabel }) }}</span>
        <Search :size="16" class="search-icon" aria-hidden="true" />
        <input v-model="search" class="input" type="search" :placeholder="t('list.search', { field: titleLabel })" />
      </label>
      <div v-if="collection.drafts" class="segmented" role="group" :aria-label="t('list.status')">
        <button
          v-for="option in (['', 'published', 'draft'] as const)"
          :key="option"
          type="button"
          :class="{ on: statusFilter === option }"
          :aria-pressed="statusFilter === option"
          @click="setQuery({ status: option || undefined, page: undefined })"
        >
          {{ option === '' ? t('list.all') : t(option === 'published' ? 'status.published' : 'status.draft') }}
        </button>
      </div>
      <label v-for="f in filterFields" :key="f.name" :class="['filter', { on: filterValue(f.name) }]">
        <span class="visually-hidden">{{ label(f.label, f.name) }}</span>
        <select
          :value="filterValue(f.name)"
          @change="setQuery({ [`f_${f.name}`]: ($event.target as HTMLSelectElement).value, page: undefined })"
        >
          <option value="">{{ t('list.filterAll', { field: label(f.label, humanize(f.name)) }) }}</option>
          <option v-for="o in f.options" :key="o.value" :value="o.value">
            {{ label(f.label, humanize(f.name)) }}: {{ label(o.label, o.value) }}
          </option>
        </select>
      </label>
      <button v-if="activeFilters" type="button" class="btn btn-ghost btn-sm" @click="clearFilters">
        <X :size="14" aria-hidden="true" />
        {{ t('list.clearFilters') }}
      </button>
      <div v-if="columnFields.length" ref="columnsMenu" class="columns">
        <button type="button" class="btn btn-sm" :aria-expanded="columnsOpen" aria-haspopup="true" @click="columnsOpen = !columnsOpen">
          <Columns3 :size="15" aria-hidden="true" />
          {{ t('list.columns') }}
        </button>
        <div v-if="columnsOpen" class="menu">
          <p class="menu-title">{{ t('list.showColumns') }}</p>
          <label v-for="f in columnFields" :key="f.name" class="menu-item">
            <input type="checkbox" :checked="shownColumns.includes(f.name)" @change="toggleColumn(f.name)" />
            {{ label(f.label, humanize(f.name)) }}
          </label>
        </div>
      </div>
    </div>

    <UploadDropzone v-if="isMedia && collection.permissions.create" class="dropzone" @uploaded="load" />

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

    <div class="card table-wrap" :aria-busy="loading">
      <table>
        <thead>
          <tr>
            <th class="check">
              <input type="checkbox" :checked="allSelected" :aria-label="t('list.selectAll')" @change="toggleAll" />
            </th>
            <th v-if="isMedia" class="preview"><span class="visually-hidden">{{ t('media.preview') }}</span></th>
            <th :aria-sort="titleField ? sortState(titleField) : undefined">
              <button v-if="titleField" type="button" class="sort" @click="toggleSort(titleField)">
                {{ titleLabel }}
                <ArrowUp v-if="sortState(titleField) === 'ascending'" :size="13" aria-hidden="true" />
                <ArrowDown v-else-if="sortState(titleField) === 'descending'" :size="13" aria-hidden="true" />
              </button>
              <span v-else>{{ titleLabel }}</span>
            </th>
            <th v-for="f in extraColumns" :key="f.name" :aria-sort="SORTABLE_TYPES.has(f.type) && !f.hasMany ? sortState(f.name) : undefined">
              <button v-if="SORTABLE_TYPES.has(f.type) && !f.hasMany" type="button" class="sort" @click="toggleSort(f.name)">
                {{ label(f.label, humanize(f.name)) }}
                <ArrowUp v-if="sortState(f.name) === 'ascending'" :size="13" aria-hidden="true" />
                <ArrowDown v-else-if="sortState(f.name) === 'descending'" :size="13" aria-hidden="true" />
              </button>
              <span v-else>{{ label(f.label, humanize(f.name)) }}</span>
            </th>
            <th v-if="collection.drafts">{{ t('list.status') }}</th>
            <th :aria-sort="sortState('updatedAt')" class="date">
              <button type="button" class="sort" @click="toggleSort('updatedAt')">
                {{ t('list.updated') }}
                <ArrowUp v-if="sortState('updatedAt') === 'ascending'" :size="13" aria-hidden="true" />
                <ArrowDown v-else-if="sortState('updatedAt') === 'descending'" :size="13" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in result?.docs ?? []" :key="doc.id" :class="{ selected: selected.has(doc.id) }">
            <td class="check">
              <input
                type="checkbox"
                :checked="selected.has(doc.id)"
                :aria-label="t('list.selectRow', { title: titleOf(collection, doc) })"
                @change="toggle(doc.id)"
              />
            </td>
            <td v-if="isMedia" class="preview"><MediaThumb :media="doc" /></td>
            <td class="title-cell">
              <RouterLink :to="`/collections/${slug}/${doc.id}`" class="title-link">{{ titleOf(collection, doc) }}</RouterLink>
            </td>
            <td v-for="f in extraColumns" :key="f.name" class="muted value-cell" :data-label="label(f.label, humanize(f.name))">
              {{ cell(f, doc[f.name]) }}
            </td>
            <td v-if="collection.drafts" class="status-cell">
              <span :class="['badge', `badge-${statusOf(doc)}`]">{{ t(statusOf(doc) === 'published' ? 'status.published' : 'status.draft') }}</span>
              <span v-if="liveIds.has(String(doc.id))" class="badge badge-changed">{{ t('status.changed') }}</span>
            </td>
            <td class="date muted">{{ formatDate(doc.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="result && !result.docs.length" class="empty">
        <component :is="search || activeFilters ? SearchX : Inbox" :size="28" aria-hidden="true" class="empty-icon" />
        <p>{{ search || activeFilters ? t('list.noResults') : t('list.empty') }}</p>
        <RouterLink
          v-if="!search && !activeFilters && collection.permissions.create && !isMedia"
          :to="`/collections/${slug}/new`"
          class="btn btn-sm"
        >
          <Plus :size="15" aria-hidden="true" />
          {{ t('list.createFirst') }}
        </RouterLink>
      </div>
      <div v-if="range" class="table-footer">
        <span>{{ t('list.showing', { from: range.from, to: range.to, total: range.total }) }}</span>
        <nav v-if="result && result.totalPages > 1" class="pagination" :aria-label="humanize('pagination')">
          <button type="button" class="btn btn-sm btn-icon" :disabled="!result.hasPrevPage" :aria-label="t('list.previous')" @click="setQuery({ page: String(page - 1) })">
            <ChevronLeft :size="16" aria-hidden="true" />
          </button>
          <span>{{ t('list.page', { page: result.page, pages: result.totalPages }) }}</span>
          <button type="button" class="btn btn-sm btn-icon" :disabled="!result.hasNextPage" :aria-label="t('list.next')" @click="setQuery({ page: String(page + 1) })">
            <ChevronRight :size="16" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </div>

    <Transition name="bulk">
      <div v-if="selected.size" class="bulk" role="toolbar" :aria-label="t('list.bulkActions')">
        <span class="bulk-count">{{ t('list.selected', { count: selected.size }) }}</span>
        <button v-if="canPublish" type="button" class="bulk-btn" :disabled="busy" @click="publishSelected">
          <Send :size="15" aria-hidden="true" />
          {{ t('list.publishSelected') }}
        </button>
        <button v-if="canPublish" type="button" class="bulk-btn" :disabled="busy" @click="unpublishSelected">
          <Eye :size="15" aria-hidden="true" />
          {{ t('list.unpublishSelected') }}
        </button>
        <button v-if="collection.permissions.delete" type="button" class="bulk-btn danger" :disabled="busy" @click="confirming = true">
          <Trash2 :size="15" aria-hidden="true" />
          {{ t('list.deleteSelected') }}
        </button>
        <button type="button" class="bulk-btn icon" :aria-label="t('list.clearSelection')" @click="selected = new Set()">
          <X :size="15" aria-hidden="true" />
        </button>
      </div>
    </Transition>

    <ConfirmDialog
      :open="confirming"
      :message="t('list.confirmDelete', { count: selected.size })"
      :confirm-label="t('edit.delete')"
      @confirm="deleteSelected"
      @cancel="confirming = false"
    />
  </template>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.heading {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  min-width: 0;
}
.count {
  color: var(--faint);
  font-size: 0.9rem;
  white-space: nowrap;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
}
.search {
  position: relative;
  flex: 1 1 16rem;
  max-width: 22rem;
}
.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--faint);
  pointer-events: none;
}
.search .input {
  padding-left: 2.3rem;
}
.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: var(--surface-2);
}
.segmented button {
  min-height: 1.95rem;
  padding: 0 0.7rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.segmented button.on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}
.filter select {
  min-height: 2.25rem;
  padding: 0 1.9rem 0 0.75rem;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.filter.on select {
  border-style: solid;
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.columns {
  position: relative;
  margin-left: auto;
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 10;
  min-width: 13rem;
  padding: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.menu-title {
  margin: 0;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--faint);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.1rem;
  padding: 0 0.5rem;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
}
.menu-item:hover {
  background: var(--surface-2);
}
.menu-item input,
.check input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
}
.dropzone {
  margin-bottom: 0.9rem;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.7rem 0.9rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
th {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--faint);
  white-space: nowrap;
}
tbody tr:hover td {
  background: var(--surface-2);
}
tr.selected td {
  background: var(--accent-soft);
}
.check {
  width: 2.75rem;
}
.preview {
  width: 4rem;
  padding-top: 0.35rem;
  padding-bottom: 0.35rem;
}
.status-cell {
  white-space: nowrap;
}
.status-cell .badge + .badge {
  margin-left: 0.35rem;
}
.date {
  width: 12rem;
  white-space: nowrap;
}
.value-cell {
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sort {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.sort:hover {
  color: var(--text);
}
.title-link {
  color: var(--text);
  font-weight: 500;
  text-decoration: none;
}
.title-link:hover {
  color: var(--accent-ink);
  text-decoration: underline;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 1rem;
  color: var(--text-muted);
  text-align: center;
}
.empty p {
  margin: 0;
}
.empty-icon {
  color: var(--faint);
}
.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  color: var(--faint);
  font-size: 0.85rem;
}
.pagination {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

/* Selected rows: actions float at the bottom of the screen. */
.bulk {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.35rem 0.35rem 0.35rem 1rem;
  border-radius: 12px;
  background: var(--text);
  color: var(--bg);
  box-shadow: var(--shadow);
  transform: translateX(-50%);
}
.bulk-count {
  padding-right: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
}
.bulk-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.1rem;
  padding: 0 0.7rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.bulk-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--bg) 16%, transparent);
}
.bulk-btn:disabled {
  opacity: 0.6;
}
.bulk-btn.danger {
  color: color-mix(in srgb, var(--danger) 55%, var(--bg));
}
.bulk-btn.icon {
  width: 2.1rem;
  justify-content: center;
  padding: 0;
}
.bulk-enter-active,
.bulk-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}
.bulk-enter-from,
.bulk-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

/* Phones: each row becomes a card. */
@media (max-width: 640px) {
  .search {
    max-width: none;
  }
  .columns {
    display: none;
  }
  thead {
    display: none;
  }
  tbody tr {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.35rem 0.75rem;
    padding: 0.8rem 0.9rem;
    border-bottom: 1px solid var(--border);
  }
  tbody td {
    padding: 0;
    border: 0;
    background: none !important;
  }
  tbody td.check {
    grid-row: span 3;
    width: auto;
    padding-top: 0.15rem;
  }
  tbody td.preview {
    grid-row: span 3;
  }
  .title-cell {
    font-size: 1rem;
  }
  .value-cell {
    max-width: none;
    font-size: 0.85rem;
  }
  .value-cell::before {
    content: attr(data-label) ": ";
    color: var(--faint);
  }
  .date {
    width: auto;
    font-size: 0.8rem;
  }
  .bulk {
    left: 0.75rem;
    right: 0.75rem;
    bottom: 0.75rem;
    transform: none;
    flex-wrap: wrap;
  }
  .bulk-enter-from,
  .bulk-leave-to {
    transform: translateY(8px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .bulk-enter-active,
  .bulk-leave-active {
    transition: none;
  }
}
</style>
