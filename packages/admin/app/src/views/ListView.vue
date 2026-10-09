<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Ellipsis,
  Eye,
  EyeOff,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  Inbox,
  LayoutGrid,
  List as ListIcon,
  Lock,
  Pencil,
  Plus,
  Search,
  SearchX,
  Send,
  Shield,
  Trash2,
  UserRound,
  X,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import DeleteDialog from '../components/DeleteDialog.vue'
import DocumentDrawer from '../components/DocumentDrawer.vue'
import FolderMoveDialog from '../components/FolderMoveDialog.vue'
import FolderNameDialog from '../components/FolderNameDialog.vue'
import FolderPermissionsDialog from '../components/FolderPermissionsDialog.vue'
import FolderTree from '../components/FolderTree.vue'
import MediaThumb from '../components/MediaThumb.vue'
import PluginElement from '../components/PluginElement.vue'
import TransferDialog from '../components/TransferDialog.vue'
import UploadDropzone from '../components/UploadDropzone.vue'
import { ApiError, api, type Doc, type Id, type Paginated, toQuery } from '../lib/api'
import { localeName } from '../lib/content-locale'
import { titleOf } from '../lib/fields'
import { extensionOf } from '../lib/filetypes'
import {
  atLeast,
  buildTree,
  type FolderLevel,
  type FolderNode,
  foldersOn,
  folderWhere,
  loadFolders,
  pathTo,
  privateAt,
  rememberFolder,
  type FolderTree as Tree,
  within,
} from '../lib/folders'
import { formatBytes, formatDate, humanize, label, t } from '../lib/i18n'
import { findCollection, session } from '../lib/session'
import { notify } from '../lib/toast'
import { inLocale, missingLocales } from '../lib/translation'

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
  typeof route.query.sort === 'string'
    ? route.query.sort
    : (collection?.defaultSort ?? (collection?.tree && titleField ? titleField : '-updatedAt')),
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
  () =>
    collection?.fields.filter(
      (f) =>
        (COLUMN_TYPES.has(f.type) || (f.type === 'relationship' && !f.hasMany)) &&
        f.name !== titleField,
    ) ?? [],
)
const columnsKey = `easy-cms-columns:${slug}`
/** The columns chosen before; at first, fields with a cell of their own (e.g. a color swatch). */
function storedColumns(): string[] {
  const shownFirst = columnFields.value.filter((f) => f.admin?.cell || f.column).map((f) => f.name)
  try {
    const stored = localStorage.getItem(columnsKey)
    if (stored === null) return shownFirst
    const value = JSON.parse(stored)
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
  } catch {
    return shownFirst
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
/** The row whose "more" menu is open. */
const rowMenu = ref<Doc['id'] | null>(null)
function onDocumentClick(event: MouseEvent) {
  if (columnsOpen.value && !columnsMenu.value?.contains(event.target as Node))
    columnsOpen.value = false
  if (rowMenu.value !== null && !(event.target as Element).closest?.('.row-menu'))
    rowMenu.value = null
  if (folderMenu.value !== null && !(event.target as Element).closest?.('.folder-menu'))
    folderMenu.value = null
}

/** Titles of related documents shown in columns, by field and id. */
const relatedTitles = ref<Record<string, Record<string, string>>>({})
async function loadRelatedTitles(docs: Doc[]) {
  const titles: Record<string, Record<string, string>> = {}
  for (const field of extraColumns.value) {
    if (field.type !== 'relationship' || !field.to) continue
    const ids = [
      ...new Set(docs.map((d) => d[field.name]).filter((v) => v !== null && v !== undefined)),
    ]
    if (ids.length === 0) continue
    const target = findCollection(field.to)
    try {
      const found = await api<Paginated<Doc>>(
        'GET',
        `/${field.to}${toQuery({ where: { id: { in: ids.join(',') } }, limit: ids.length, depth: 0 })}`,
      )
      titles[field.name] = Object.fromEntries(
        found.docs.map((d) => [String(d.id), titleOf(target, d)]),
      )
    } catch {
      // Not readable: ids are shown.
    }
  }
  relatedTitles.value = titles
}

// A relationship column turned on: its titles.
watch(extraColumns, () => {
  if (result.value) void loadRelatedTitles(result.value.docs)
})

function cell(field: AdminField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field.type === 'relationship')
    return relatedTitles.value[field.name]?.[String(value)] ?? `#${String(value)}`
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

/** With roles (`auth.rbac`): the field naming a document's owner, for "Mine". */
const owner = collection?.owner

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
  () =>
    (collection?.fields ?? []).filter(
      (f) =>
        (f.type === 'select' || (f.type === 'relationship' && !f.hasMany)) && filterValue(f.name),
    ).length + (statusFilter.value ? 1 : 0),
)

function whereOf() {
  const parts: Record<string, unknown>[] = []
  if (search.value && titleField) parts.push({ [titleField]: { like: search.value } })
  if (statusFilter.value) parts.push({ status: { equals: statusFilter.value } })
  for (const f of filterFields.value) {
    const value = filterValue(f.name)
    if (value) parts.push({ [f.name]: { equals: value } })
  }
  // Links can narrow the list to one related document, e.g. a form's submissions (?f_form=3).
  for (const f of collection?.fields ?? []) {
    const value = f.type === 'relationship' && !f.hasMany ? filterValue(f.name) : ''
    if (value) parts.push({ [f.name]: { equals: value } })
  }
  // The open folder; a search also looks in its subfolders.
  if (useFolders) {
    const inFolder = folderWhere(tree.value, currentFolder.value, !!search.value)
    if (inFolder) parts.push(inFolder)
  }
  return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { and: parts }
}

// --- Media: grid or table, and what was just uploaded -----------------------------------------

const VIEW_KEY = 'easy-cms-media-view'
function storedView(): 'grid' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid'
  } catch {
    return 'grid'
  }
}
/** The media library shows a grid of cards unless the table was chosen. */
const view = ref<'grid' | 'table'>(isMedia ? storedView() : 'table')
const grid = computed(() => isMedia && view.value === 'grid')
function setView(next: 'grid' | 'table') {
  view.value = next
  try {
    localStorage.setItem(VIEW_KEY, next)
  } catch {
    // private mode: for this page only
  }
}
/** A file's type and size under its name, e.g. "PDF · 1.2 MB". */
const fileMeta = (doc: Doc) =>
  [extensionOf(doc.filename), formatBytes(doc.filesize)].filter(Boolean).join(' · ')

/** After uploading: the list again, with the new files selected to move or edit next. */
async function onUploaded(docs: Doc[]) {
  await load()
  selected.value = new Set(docs.map((d) => d.id))
}

// --- Media folders (`upload.folders`) ---------------------------------------------------------

const useFolders = isMedia && foldersOn()
/** Admins choose which roles use each folder (`auth.rbac`). */
const canSetPermissions =
  !!session.schema?.folders?.permissions || !!session.schema?.folders?.private
const tree = ref<Tree>({ roots: [], byId: new Map() })
/** The open folder, `null` for the top level (`?folder=<id>`). */
const currentFolder = computed<Id | null>(() => {
  const value = route.query.folder
  if (typeof value !== 'string' || value === '') return null
  return tree.value.byId.get(value)?.id ?? value
})
const here = computed(() =>
  currentFolder.value === null ? null : (tree.value.byId.get(String(currentFolder.value)) ?? null),
)
/** The top level is open to everyone who may use the media library. */
const rootLevel: FolderLevel = collection?.permissions.create ? 'manage' : 'view'
const levelOf = (folder: Id | null): FolderLevel =>
  folder === null ? rootLevel : (tree.value.byId.get(String(folder))?.level ?? 'view')
const hereLevel = computed(() => levelOf(currentFolder.value))
const crumbs = computed(() => pathTo(tree.value, currentFolder.value))
const subfolders = computed(() =>
  currentFolder.value === null ? tree.value.roots : (here.value?.children ?? []),
)
const canAddFolder = computed(
  () => !!collection?.permissions.create && atLeast(hereLevel.value, 'manage'),
)
const canUploadHere = computed(
  () => !!collection?.permissions.create && atLeast(hereLevel.value, 'edit'),
)

async function loadTree() {
  if (!useFolders) return
  try {
    tree.value = buildTree(await loadFolders())
  } catch (e) {
    notify('error', (e as Error).message)
  }
}
function openFolder(id: Id | null) {
  rememberFolder(id)
  search.value = ''
  setQuery({ folder: id === null ? undefined : String(id), q: undefined, page: undefined })
}

const folderMenu = ref<string | null>(null)
const naming = ref<{ mode: 'new' } | { mode: 'rename'; folder: FolderNode } | null>(null)
const namingError = ref('')
const errorText = (e: unknown) =>
  e instanceof ApiError
    ? e.status === 403
      ? t('common.forbidden')
      : (e.errors[0]?.message ?? e.message)
    : String(e)

async function saveName(name: string) {
  const target = naming.value
  if (!target) return
  namingError.value = ''
  try {
    if (target.mode === 'new')
      await api('POST', '/media-folders?depth=0', {
        name,
        ...(currentFolder.value !== null ? { parent: currentFolder.value } : {}),
      })
    else await api('PATCH', `/media-folders/${target.folder.id}?depth=0`, { name })
    naming.value = null
    notify('success', t(target.mode === 'new' ? 'folders.created' : 'folders.renamed', { name }))
    await loadTree()
  } catch (e) {
    namingError.value =
      e instanceof ApiError && e.errors[0]?.field === 'name'
        ? t('folders.nameTaken', { name })
        : errorText(e)
  }
}

/** What is being moved: files (by id) or one folder. */
const moving = ref<{ files: Id[] } | { folder: FolderNode } | null>(null)
const movingExclude = computed(() =>
  moving.value && 'folder' in moving.value ? within(tree.value, moving.value.folder.id) : [],
)
async function moveFiles(ids: Id[], to: Id | null) {
  if (ids.length === 0) return
  busy.value = true
  let count = 0
  try {
    for (const id of ids) {
      await api('PATCH', `/media/${id}?depth=0`, { folder: to })
      count++
    }
    const name = to === null ? t('folders.top') : (tree.value.byId.get(String(to))?.name ?? '')
    notify('success', t('folders.movedFiles', { count, name }))
  } catch (e) {
    notify('error', errorText(e))
  } finally {
    busy.value = false
  }
  await load()
}
/**
 * Moving files to or from a private folder moves them to the other storage and changes their
 * URLs: say so first, with how many documents use them.
 */
const confirmMove = ref<{ message: string; run: () => Promise<void> } | null>(null)
async function guardedMoveFiles(ids: Id[], to: Id | null) {
  const toPrivate = privateAt(tree.value, to)
  const changing = (result.value?.docs ?? []).filter(
    (d) => ids.some((id) => String(id) === String(d.id)) && (d.private === true) !== toPrivate,
  )
  if (changing.length === 0) return moveFiles(ids, to)
  let uses = 0
  try {
    uses = (
      await api<{ count: number }>(
        'GET',
        `/admin/media-usage?ids=${changing.map((d) => d.id).join(',')}`,
      )
    ).count
  } catch {
    // Not known: the message still says the URLs change.
  }
  confirmMove.value = {
    message: t(toPrivate ? 'folders.confirmPrivate' : 'folders.confirmPublic', {
      count: changing.length,
      uses,
    }),
    run: () => moveFiles(ids, to),
  }
}
async function runConfirmedMove() {
  const pending = confirmMove.value
  confirmMove.value = null
  await pending?.run()
}

async function moveTo(to: Id | null) {
  const what = moving.value
  moving.value = null
  if (!what) return
  if ('files' in what) return guardedMoveFiles(what.files, to)
  // A folder moving in or out of a private one takes its files along.
  const was = privateAt(tree.value, what.folder.id)
  const will = what.folder.private === true || privateAt(tree.value, to)
  if (was !== will) {
    confirmMove.value = {
      message: t(will ? 'folders.confirmFolderPrivate' : 'folders.confirmFolderPublic', {
        name: what.folder.name,
      }),
      run: () => moveFolder(what.folder, to),
    }
    return
  }
  await moveFolder(what.folder, to)
}
async function moveFolder(folder: FolderNode, to: Id | null) {
  try {
    await api('PATCH', `/media-folders/${folder.id}?depth=0`, { parent: to })
    notify('success', t('folders.movedFolder', { name: folder.name }))
    await loadTree()
  } catch (e) {
    notify('error', errorText(e))
  }
}

/** Files dragged from the list onto a folder: the selection, or the row dragged. */
const dragged = ref<Id[]>([])
function onRowDragStart(event: DragEvent, doc: Doc) {
  dragged.value = selected.value.has(doc.id) ? [...selected.value] : [doc.id]
  event.dataTransfer?.setData('text/plain', dragged.value.join(','))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
const overFolder = ref<string | null>(null)
function onFolderDrop(to: Id | null) {
  overFolder.value = null
  const ids = dragged.value
  dragged.value = []
  if (ids.length === 0) return
  if (!atLeast(levelOf(to), 'edit')) return notify('error', t('common.forbidden'))
  void guardedMoveFiles(ids, to)
}

const permissionsOf = ref<FolderNode | null>(null)
function onPermissionsSaved() {
  permissionsOf.value = null
  notify('success', t('folders.permissionsSaved'))
  void loadTree()
}
const deletingFolder = ref<FolderNode | null>(null)
async function deleteFolder() {
  const folder = deletingFolder.value
  deletingFolder.value = null
  if (!folder) return
  try {
    await api('DELETE', `/media-folders/${folder.id}`)
    notify('success', t('folders.deleted', { name: folder.name }))
    if (currentFolder.value !== null && within(tree.value, folder.id).includes(currentFolder.value))
      openFolder(folder.parent)
    await loadTree()
    await load()
  } catch (e) {
    notify('error', errorText(e))
  }
}
const parentName = (folder: FolderNode | null) => {
  const parent =
    folder?.parent === null || !folder ? null : tree.value.byId.get(String(folder.parent))
  return parent ? parent.name : t('folders.top')
}

// --- Tree (`admin.list.tree`) -----------------------------------------------------------------

const treeField = collection?.tree
/** A tree while nothing narrows the list: a search or filter lists the matches flat. */
const treeMode = computed(() => !!treeField && !route.query.q && activeFilters.value === 0)
/** Children by parent id, for the documents whose children are loaded. */
const children = ref<Map<string, Doc[]>>(new Map())
const expanded = ref<Set<string>>(new Set())
/** All documents, when the tree shows only the top level in `result`. */
const treeTotal = ref<number | null>(null)

interface Row {
  doc: Doc
  depth: number
}
const rows = computed<Row[]>(() => {
  const docs = result.value?.docs ?? []
  if (!treeMode.value) return docs.map((doc) => ({ doc, depth: 0 }))
  const out: Row[] = []
  const walk = (list: Doc[], depth: number) => {
    for (const doc of list) {
      out.push({ doc, depth })
      if (expanded.value.has(String(doc.id)))
        walk(children.value.get(String(doc.id)) ?? [], depth + 1)
    }
  }
  walk(docs, 0)
  return out
})
const hasChildren = (doc: Doc) => (children.value.get(String(doc.id))?.length ?? 0) > 0

/** Loads the children of these documents, one request per level. */
async function loadChildren(ids: Doc['id'][]) {
  if (!treeField) return
  const pending = ids.filter((id) => !children.value.has(String(id)))
  if (pending.length === 0) return
  const next = new Map(children.value)
  for (const id of pending) next.set(String(id), [])
  // The API returns at most 100 at a time.
  for (let pageNumber = 1; ; pageNumber++) {
    const found = await fetchDocs({ [treeField]: { in: pending.join(',') } }, 100, pageNumber)
    for (const doc of found.docs) next.get(String(doc[treeField]))?.push(doc)
    if (!found.hasNextPage) break
  }
  children.value = next
}
async function toggleNode(doc: Doc) {
  const key = String(doc.id)
  const next = new Set(expanded.value)
  if (next.has(key)) {
    next.delete(key)
    expanded.value = next
    return
  }
  next.add(key)
  expanded.value = next
  // Their own children, so each shows whether it opens.
  try {
    await loadChildren((children.value.get(key) ?? []).map((d) => d.id))
  } catch (e) {
    notify('error', (e as Error).message)
  }
}

// --- Loading ----------------------------------------------------------------------------------

const result = ref<Paginated<Doc> | null>(null)
const loading = ref(false)
const error = ref('')
const selected = ref<Set<Doc['id']>>(new Set())
// With versions and drafts, a live document can have a newer draft; the list shows the draft,
// so it needs to know separately which documents are live.
const separateDrafts = !!collection?.drafts && !!collection?.versions
// Lists show the default language, with a column saying which translations are missing.
const localization = session.schema?.localization ?? null
const localized = !!localization && (collection?.fields.some((f) => f.localized) ?? false)
/** Locales each listed document still needs, by id. */
const missing = ref<Map<string, string[]>>(new Map())
const liveIds = ref<Set<string>>(new Set())
const confirming = ref(false)
const busy = ref(false)

/** One page of documents in the default language, noting translations and live versions. */
async function fetchDocs(where: unknown, limit: number, pageNumber = 1): Promise<Paginated<Doc>> {
  const found = await api<Paginated<Doc>>(
    'GET',
    `/${slug}${toQuery({ where, sort: sort.value, limit, page: pageNumber, depth: 0, draft: true })}${localized ? '&locale=all' : ''}`,
  )
  let docs = found.docs
  if (localized && localization && collection) {
    const { locales, defaultLocale } = localization
    const next = new Map(missing.value)
    for (const d of docs)
      next.set(String(d.id), missingLocales(collection.fields, d, locales, defaultLocale))
    missing.value = next
    docs = docs.map((d) => inLocale(collection.fields, d, defaultLocale, locales) as Doc)
  }
  if (separateDrafts) {
    const live = await loadLive(docs)
    if (live.size) liveIds.value = new Set([...liveIds.value, ...live])
  }
  return { ...found, docs }
}

async function load() {
  if (!collection) return
  loading.value = true
  error.value = ''
  try {
    missing.value = new Map()
    liveIds.value = new Set()
    const tree = treeMode.value && treeField
    const where = tree ? { [treeField]: { exists: false } } : whereOf()
    const found = await fetchDocs(where, PAGE_SIZE, page.value)
    children.value = new Map()
    if (tree) {
      await loadChildren(found.docs.map((d) => d.id))
      const all = await api<Paginated<Doc>>(
        'GET',
        `/${slug}${toQuery({ limit: 1, depth: 0, draft: true })}`,
      )
      treeTotal.value = all.totalDocs
    } else {
      treeTotal.value = null
    }
    result.value = found
    selected.value = new Set()
    void loadRelatedTitles(found.docs)
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
// Reload when the list's own parameters change, not when a drawer opens or closes.
const listQuery = computed(() =>
  JSON.stringify(
    Object.entries(route.query)
      .filter(([key]) => key !== 'edit' && key !== 'new')
      .sort(),
  ),
)
watch(listQuery, load)

// --- Drawer (`editIn: 'drawer'`): `?edit=<id>` or `?new` ----------------------------------------

const useDrawer = collection?.editIn === 'drawer'
/** The document open in the drawer: an id, `null` for a new one, `undefined` when closed. */
const drawerId = computed<string | null | undefined>(() => {
  if (!useDrawer) return undefined
  if (typeof route.query.edit === 'string') return route.query.edit
  return route.query.new !== undefined ? null : undefined
})
function listOnly() {
  const { edit: _edit, new: _new, ...rest } = route.query
  return rest
}
const docLink = (id: Doc['id']) =>
  useDrawer ? { query: { ...listOnly(), edit: String(id) } } : `/collections/${slug}/${id}`
const newLink = useDrawer
  ? computed(() => ({ query: { ...listOnly(), new: '1' } }))
  : computed(() => `/collections/${slug}/new`)
function closeDrawer() {
  // Opened from this list: going back closes it and keeps history tidy.
  const back = router.options.history.state.back
  if (back === router.resolve({ query: listOnly() }).fullPath) router.back()
  else void router.replace({ query: listOnly() })
}
function onDrawerSaved(doc: Doc, created: boolean) {
  void load()
  if (created) void router.replace({ query: { ...listOnly(), edit: String(doc.id) } })
}
function onDrawerDeleted() {
  closeDrawer()
  void load()
}
onMounted(async () => {
  document.addEventListener('click', onDocumentClick)
  // Searching a folder looks in its subfolders, so the tree comes first.
  await loadTree()
  void load()
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
  () => rows.value.length > 0 && rows.value.every((r) => selected.value.has(r.doc.id)),
)
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(rows.value.map((r) => r.doc.id))
}
function toggle(id: Doc['id']) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
const canPublish = computed(
  () =>
    !!collection?.drafts && !!collection?.permissions.update && !!collection.permissions.publish,
)

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
/** A single document deleted from its row menu. */
const deleting = ref<Doc | null>(null)
/** Deleting users with roles (`auth.rbac`) asks who gets the documents they own. */
const transfers = slug === 'users' && session.schema?.rbac === true
async function deleteOne(query = '') {
  const doc = deleting.value
  deleting.value = null
  if (!doc) return
  try {
    await api('DELETE', `/${slug}/${doc.id}${query}`)
    notify('success', t('list.deletedCount', { count: 1 }))
  } catch (e) {
    notify(
      'error',
      e instanceof ApiError && e.status === 403 ? t('common.forbidden') : (e as Error).message,
    )
  }
  await load()
}

async function deleteSelected(query = '') {
  confirming.value = false
  await bulk(
    (id) => api('DELETE', `/${slug}/${id}${query}`),
    (count) => t('list.deletedCount', { count }),
  )
}
</script>

<template>
  <p v-if="!collection" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <nav class="crumbs" :aria-label="t('list.breadcrumb')">
      <!-- The menu section: user accounts and other settings are under Settings. -->
      <span>{{ collection.group === 'settings' ? t('nav.globals') : t('nav.collections') }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
      <span class="current">{{ label(collection.labels?.plural, collection.slug) }}</span>
    </nav>
    <header class="toolbar">
      <div class="heading">
        <h1>{{ label(collection.labels?.plural, collection.slug) }}</h1>
        <span v-if="result" class="count">{{ t((treeTotal ?? result.totalDocs) === 1 ? 'list.countOne' : 'list.count', { count: treeTotal ?? result.totalDocs }) }}</span>
      </div>
      <div class="toolbar-actions">
        <button v-if="useFolders && canAddFolder" type="button" class="btn" @click="namingError = ''; naming = { mode: 'new' }">
          <FolderPlus :size="16" aria-hidden="true" />
          {{ t('folders.new') }}
        </button>
        <!-- Media is created by uploading, below. -->
        <RouterLink v-if="collection.permissions.create && !isMedia" :to="newLink" class="btn btn-primary">
          <Plus :size="16" aria-hidden="true" />
          {{ t('list.new') }}
        </RouterLink>
      </div>
    </header>

    <div :class="{ library: useFolders }">
    <aside v-if="useFolders" class="library-tree card">
      <FolderTree :tree="tree" :current="currentFolder" :label="t('folders.tree')" @select="openFolder" @drop="onFolderDrop" />
    </aside>
    <div :class="{ 'library-main': useFolders }">
    <nav v-if="useFolders" class="folder-crumbs" :aria-label="t('folders.path')">
      <button type="button" class="crumb" :aria-current="currentFolder === null ? 'page' : undefined" @click="openFolder(null)">{{ t('folders.top') }}</button>
      <template v-for="(node, i) in crumbs" :key="String(node.id)">
        <ChevronRight :size="14" aria-hidden="true" />
        <button type="button" class="crumb" :aria-current="i === crumbs.length - 1 ? 'page' : undefined" @click="openFolder(node.id)">{{ node.name }}</button>
      </template>
    </nav>
    <div class="filters">
      <label v-if="titleField" class="search">
        <span class="visually-hidden">{{ t('list.search', { field: titleLabel }) }}</span>
        <Search :size="16" class="search-icon" aria-hidden="true" />
        <input v-model="search" class="input" type="search" :placeholder="useFolders && currentFolder !== null ? t('folders.searchIn', { name: here?.name ?? '' }) : t('list.search', { field: titleLabel })" />
      </label>
      <label v-if="collection.drafts" :class="['filter', { on: statusFilter }]">
        <span class="visually-hidden">{{ t('list.status') }}</span>
        <select
          :value="statusFilter"
          @change="setQuery({ status: ($event.target as HTMLSelectElement).value || undefined, page: undefined })"
        >
          <option value="">{{ t('list.statusAll') }}</option>
          <option value="published">{{ t('list.statusIs', { status: t('status.published') }) }}</option>
          <option value="draft">{{ t('list.statusIs', { status: t('status.draft') }) }}</option>
        </select>
      </label>
      <button
        v-if="owner && session.user"
        type="button"
        :class="['btn', 'btn-sm', 'mine', { on: filterValue(owner) === String(session.user.id) }]"
        :aria-pressed="filterValue(owner) === String(session.user.id)"
        :title="t('list.mineHint')"
        @click="setQuery({ [`f_${owner}`]: filterValue(owner) ? undefined : String(session.user.id), page: undefined })"
      >
        <UserRound :size="14" aria-hidden="true" />
        {{ t('list.mine') }}
      </button>
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
      <div v-if="isMedia" class="view-switch" role="group" :aria-label="t('list.view')">
        <button type="button" :class="['btn', 'btn-sm', 'btn-icon', { on: view === 'grid' }]" :aria-pressed="view === 'grid'" :aria-label="t('list.viewGrid')" :title="t('list.viewGrid')" @click="setView('grid')">
          <LayoutGrid :size="15" aria-hidden="true" />
        </button>
        <button type="button" :class="['btn', 'btn-sm', 'btn-icon', { on: view === 'table' }]" :aria-pressed="view === 'table'" :aria-label="t('list.viewTable')" :title="t('list.viewTable')" @click="setView('table')">
          <ListIcon :size="15" aria-hidden="true" />
        </button>
      </div>
      <div v-if="columnFields.length && !grid" ref="columnsMenu" class="columns">
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

    <ul v-if="useFolders && !search && subfolders.length" class="folders">
      <li
        v-for="folder in subfolders"
        :key="String(folder.id)"
        :class="['folder', { over: overFolder === String(folder.id) }]"
        @dragover.prevent="overFolder = String(folder.id)"
        @dragleave="overFolder = null"
        @drop.prevent="onFolderDrop(folder.id)"
      >
        <button type="button" class="folder-open" @click="openFolder(folder.id)">
          <FolderIcon :size="20" aria-hidden="true" class="folder-icon" />
          <span class="folder-name">{{ folder.name }}</span>
          <Lock v-if="folder.permissions" :size="13" class="folder-lock" :aria-label="t('folders.restricted')" />
          <EyeOff v-if="folder.private" :size="13" class="folder-lock" :aria-label="t('folders.private')" />
        </button>
        <div v-if="atLeast(folder.level, 'manage') || canSetPermissions" class="folder-menu">
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-icon"
            :aria-label="t('folders.actions', { name: folder.name })"
            :aria-expanded="folderMenu === String(folder.id)"
            aria-haspopup="menu"
            @click="folderMenu = folderMenu === String(folder.id) ? null : String(folder.id)"
          >
            <Ellipsis :size="16" aria-hidden="true" />
          </button>
          <div v-if="folderMenu === String(folder.id)" class="menu" role="menu">
            <template v-if="atLeast(folder.level, 'manage')">
              <button type="button" class="menu-item" role="menuitem" @click="folderMenu = null; namingError = ''; naming = { mode: 'rename', folder }">
                <Pencil :size="15" aria-hidden="true" />
                {{ t('folders.rename') }}
              </button>
              <button type="button" class="menu-item" role="menuitem" @click="folderMenu = null; moving = { folder }">
                <FolderInput :size="15" aria-hidden="true" />
                {{ t('folders.moveFolder') }}
              </button>
            </template>
            <button v-if="canSetPermissions" type="button" class="menu-item" role="menuitem" @click="folderMenu = null; permissionsOf = folder">
              <Shield :size="15" aria-hidden="true" />
              {{ t('folders.permissions') }}
            </button>
            <button v-if="atLeast(folder.level, 'manage')" type="button" class="menu-item danger" role="menuitem" @click="folderMenu = null; deletingFolder = folder">
              <Trash2 :size="15" aria-hidden="true" />
              {{ t('folders.delete') }}
            </button>
          </div>
        </div>
      </li>
    </ul>

    <UploadDropzone
      v-if="isMedia && collection.permissions.create && (!useFolders || canUploadHere)"
      class="dropzone"
      :accept="session.schema?.upload?.mimeTypes.join(',')"
      :folder="useFolders ? currentFolder : undefined"
      @uploaded="onUploaded"
    />

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

    <div :class="['card', 'table-wrap', { 'grid-wrap': grid }]" :aria-busy="loading">
      <template v-if="grid">
        <label v-if="rows.length" class="grid-all">
          <input type="checkbox" :checked="allSelected" @change="toggleAll" />
          {{ t('list.selectAll') }}
        </label>
        <ul class="media-grid">
          <li
            v-for="{ doc } in rows"
            :key="doc.id"
            :class="['media-card', { selected: selected.has(doc.id), selecting: selected.size > 0 }]"
            :draggable="useFolders && collection.permissions.update"
            @dragstart="onRowDragStart($event, doc)"
          >
            <RouterLink :to="docLink(doc.id)" class="media-card-link">
              <MediaThumb :media="doc" size="card" />
              <span class="media-card-name" :title="titleOf(collection, doc)">{{ doc.alt || titleOf(collection, doc) }}</span>
              <span class="media-card-meta muted">{{ fileMeta(doc) }}</span>
            </RouterLink>
            <input
              class="media-card-check"
              type="checkbox"
              :checked="selected.has(doc.id)"
              :aria-label="t('list.selectRow', { title: titleOf(collection, doc) })"
              @change="toggle(doc.id)"
            />
            <div class="row-menu media-card-menu">
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-icon"
                :aria-label="t('list.rowActions', { title: titleOf(collection, doc) })"
                :aria-expanded="rowMenu === doc.id"
                aria-haspopup="menu"
                @click="rowMenu = rowMenu === doc.id ? null : doc.id"
              >
                <Ellipsis :size="16" aria-hidden="true" />
              </button>
              <div v-if="rowMenu === doc.id" class="menu" role="menu">
                <RouterLink :to="docLink(doc.id)" class="menu-item" role="menuitem">
                  <Pencil :size="15" aria-hidden="true" />
                  {{ t('list.open') }}
                </RouterLink>
                <button
                  v-if="useFolders && collection.permissions.update"
                  type="button"
                  class="menu-item"
                  role="menuitem"
                  @click="rowMenu = null; moving = { files: [doc.id] }"
                >
                  <FolderInput :size="15" aria-hidden="true" />
                  {{ t('folders.moveTo') }}
                </button>
                <button
                  v-if="collection.permissions.delete"
                  type="button"
                  class="menu-item danger"
                  role="menuitem"
                  @click="rowMenu = null; deleting = doc"
                >
                  <Trash2 :size="15" aria-hidden="true" />
                  {{ t('edit.delete') }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </template>
      <table v-else>
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
            <th v-if="localized">{{ t('list.translations') }}</th>
            <th v-if="collection.drafts">{{ t('list.status') }}</th>
            <th :aria-sort="sortState('updatedAt')" class="date">
              <button type="button" class="sort" @click="toggleSort('updatedAt')">
                {{ t('list.updated') }}
                <ArrowUp v-if="sortState('updatedAt') === 'ascending'" :size="13" aria-hidden="true" />
                <ArrowDown v-else-if="sortState('updatedAt') === 'descending'" :size="13" aria-hidden="true" />
              </button>
            </th>
            <th class="more"><span class="visually-hidden">{{ t('edit.manage') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="{ doc, depth } in rows"
            :key="doc.id"
            :class="{ selected: selected.has(doc.id) }"
            :draggable="useFolders && collection.permissions.update"
            @dragstart="onRowDragStart($event, doc)"
          >
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
              <span v-if="treeMode" class="tree" :style="{ '--depth': depth }">
                <button
                  v-if="hasChildren(doc)"
                  type="button"
                  class="tree-toggle"
                  :aria-expanded="expanded.has(String(doc.id))"
                  :aria-label="t(expanded.has(String(doc.id)) ? 'list.collapse' : 'list.expand', { title: titleOf(collection, doc) })"
                  @click="toggleNode(doc)"
                >
                  <ChevronRight :size="15" aria-hidden="true" />
                </button>
                <span v-else class="tree-toggle" aria-hidden="true" />
                <RouterLink :to="docLink(doc.id)" class="title-link">{{ titleOf(collection, doc) }}</RouterLink>
              </span>
              <RouterLink v-else :to="docLink(doc.id)" class="title-link">{{ titleOf(collection, doc) }}</RouterLink>
            </td>
            <td v-for="f in extraColumns" :key="f.name" class="muted value-cell" :data-label="label(f.label, humanize(f.name))">
              <!-- A field type's own cell, e.g. a color swatch. -->
              <PluginElement
                v-if="f.admin?.cell"
                :component="f.admin.cell"
                :value="doc[f.name] ?? null"
                :field="f"
                :label="label(f.label, humanize(f.name))"
                read-only
              />
              <template v-else>{{ cell(f, doc[f.name]) }}</template>
            </td>
            <td v-if="localized && localization" class="translations">
              <span
                v-for="code in localization.locales"
                :key="code"
                :class="['lang', missing.get(String(doc.id))?.includes(code) ? 'todo' : 'done']"
                :title="`${localeName(code)}: ${t(missing.get(String(doc.id))?.includes(code) ? 'list.untranslated' : 'list.translated')}`"
              >
                <span aria-hidden="true">{{ code.toUpperCase() }}</span>
                <span class="visually-hidden">
                  {{ localeName(code) }}: {{ t(missing.get(String(doc.id))?.includes(code) ? 'list.untranslated' : 'list.translated') }}
                </span>
              </span>
            </td>
            <td v-if="collection.drafts" class="status-cell">
              <span :class="['badge', `badge-${statusOf(doc)}`]">{{ t(statusOf(doc) === 'published' ? 'status.published' : 'status.draft') }}</span>
              <span v-if="liveIds.has(String(doc.id))" class="badge badge-changed">{{ t('status.changed') }}</span>
            </td>
            <td class="date muted">{{ formatDate(doc.updatedAt) }}</td>
            <td class="more">
              <div class="row-menu">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-icon"
                  :aria-label="t('list.rowActions', { title: titleOf(collection, doc) })"
                  :aria-expanded="rowMenu === doc.id"
                  aria-haspopup="menu"
                  @click="rowMenu = rowMenu === doc.id ? null : doc.id"
                >
                  <Ellipsis :size="16" aria-hidden="true" />
                </button>
                <div v-if="rowMenu === doc.id" class="menu" role="menu">
                  <RouterLink :to="docLink(doc.id)" class="menu-item" role="menuitem">
                    <Pencil :size="15" aria-hidden="true" />
                    {{ t('list.open') }}
                  </RouterLink>
                  <button
                    v-if="collection.permissions.delete"
                    type="button"
                    class="menu-item danger"
                    role="menuitem"
                    @click="
                      rowMenu = null;
                      deleting = doc
                    "
                  >
                    <Trash2 :size="15" aria-hidden="true" />
                    {{ t('edit.delete') }}
                  </button>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="result && !result.docs.length" class="empty">
        <component :is="search || activeFilters ? SearchX : Inbox" :size="28" aria-hidden="true" class="empty-icon" />
        <p>{{ search || activeFilters ? t('list.noResults') : t('list.empty') }}</p>
        <RouterLink
          v-if="!search && !activeFilters && collection.permissions.create && !isMedia"
          :to="newLink"
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
        <button v-if="useFolders && collection.permissions.update" type="button" class="bulk-btn" :disabled="busy" @click="moving = { files: [...selected] }">
          <FolderInput :size="15" aria-hidden="true" />
          {{ t('folders.moveTo') }}
        </button>
        <button v-if="collection.permissions.delete && !collection.confirmDelete" type="button" class="bulk-btn danger" :disabled="busy" @click="confirming = true">
          <Trash2 :size="15" aria-hidden="true" />
          {{ t('list.deleteSelected') }}
        </button>
        <button type="button" class="bulk-btn icon" :aria-label="t('list.clearSelection')" @click="selected = new Set()">
          <X :size="15" aria-hidden="true" />
        </button>
      </div>
    </Transition>

    <template v-if="useFolders">
      <FolderNameDialog
        :open="naming !== null"
        :title="naming?.mode === 'rename' ? t('folders.renameTitle', { name: naming.folder.name }) : t('folders.newTitle')"
        :initial="naming?.mode === 'rename' ? naming.folder.name : ''"
        :error="namingError"
        @save="saveName"
        @cancel="naming = null"
      />
      <FolderMoveDialog
        :open="moving !== null"
        :title="moving && 'folder' in moving ? t('folders.moveFolderTitle', { name: moving.folder.name }) : t('folders.moveFilesTitle', { count: moving && 'files' in moving ? moving.files.length : 0 })"
        :tree="tree"
        :need="moving && 'folder' in moving ? 'manage' : 'edit'"
        :root-level="rootLevel"
        :exclude="movingExclude"
        :from="moving && 'folder' in moving ? moving.folder.parent : currentFolder"
        @move="moveTo"
        @cancel="moving = null"
      />
      <FolderPermissionsDialog
        :open="permissionsOf !== null"
        :folder="permissionsOf"
        :tree="tree"
        @saved="onPermissionsSaved"
        @cancel="permissionsOf = null"
      />
      <ConfirmDialog
        :open="confirmMove !== null"
        :message="confirmMove?.message ?? ''"
        :confirm-label="t('folders.move')"
        @confirm="runConfirmedMove"
        @cancel="confirmMove = null"
      />
      <ConfirmDialog
        :open="deletingFolder !== null"
        :message="t('folders.confirmDelete', { name: deletingFolder?.name ?? '', parent: parentName(deletingFolder) })"
        :confirm-label="t('folders.delete')"
        @confirm="deleteFolder"
        @cancel="deletingFolder = null"
      />
    </template>
    <DocumentDrawer
      v-if="drawerId !== undefined"
      :key="String(drawerId)"
      :slug="slug"
      :id="drawerId"
      @saved="onDrawerSaved"
      @deleted="onDrawerDeleted"
      @close="closeDrawer"
    />
    <template v-if="transfers">
      <TransferDialog
        :open="deleting !== null"
        :user-ids="deleting ? [deleting.id] : []"
        :message="t('list.confirmDelete', { count: 1 })"
        @confirm="deleteOne"
        @cancel="deleting = null"
      />
      <TransferDialog
        :open="confirming"
        :user-ids="[...selected]"
        :message="t('list.confirmDelete', { count: selected.size })"
        @confirm="deleteSelected"
        @cancel="confirming = false"
      />
    </template>
    <template v-else>
      <DeleteDialog
        :open="deleting !== null"
        :collection="collection"
        :doc="deleting ? { id: deleting.id, title: titleOf(collection, deleting) } : null"
        :message="t('list.confirmDelete', { count: 1 })"
        @confirm="deleteOne()"
        @cancel="deleting = null"
      />
      <ConfirmDialog
        :open="confirming"
        :message="t('list.confirmDelete', { count: selected.size })"
        :confirm-label="t('edit.delete')"
        @confirm="deleteSelected()"
        @cancel="confirming = false"
      />
    </template>
  </template>
</template>

<style scoped>
.view-switch {
  display: flex;
  gap: 0.15rem;
  padding: 0.15rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.view-switch .btn {
  border-color: transparent;
}
.view-switch .btn.on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.grid-wrap {
  padding: 0.75rem;
}
.grid-all {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.6rem 0.25rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.media-card {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.media-card:hover {
  border-color: var(--border-strong);
}
.media-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.media-card-link {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.4rem 0.4rem 0.55rem;
  color: var(--text);
  text-decoration: none;
}
.media-card-link :deep(.thumb) {
  margin-bottom: 0.35rem;
}
.media-card-name {
  overflow: hidden;
  padding: 0 0.15rem;
  font-size: 0.85rem;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-card-meta {
  padding: 0 0.15rem;
  font-size: 0.75rem;
}
/* The checkbox and menu show on hover, while selecting, and always on touch screens. */
.media-card-check {
  position: absolute;
  top: 0.7rem;
  left: 0.7rem;
  width: 1.05rem;
  height: 1.05rem;
  opacity: 0;
}
.media-card .media-card-menu {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  opacity: 0;
}
.media-card-menu .btn {
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.media-card:hover .media-card-check,
.media-card:hover .media-card-menu,
.media-card:focus-within .media-card-check,
.media-card:focus-within .media-card-menu,
.media-card.selecting .media-card-check,
.media-card.selected .media-card-check,
.media-card-menu:has([aria-expanded='true']) {
  opacity: 1;
}
@media (hover: none) {
  .media-card-check,
  .media-card-menu {
    opacity: 1;
  }
}
.media-card-menu .menu {
  right: 0;
  min-width: 10rem;
}
.library {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}
.library-tree {
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 0.5rem;
}
@media (max-width: 900px) {
  .library {
    display: block;
  }
  .library-tree {
    display: none;
  }
}
.folder-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem;
  margin-bottom: 0.75rem;
  color: var(--faint);
}
.crumb {
  padding: 0.15rem 0.35rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
.crumb:hover {
  background: var(--surface-2);
}
.crumb[aria-current='page'] {
  color: var(--text);
  font-weight: 600;
}
.folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.6rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}
.folder {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.folder:hover {
  border-color: var(--border-strong);
}
.folder.over {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.folder-open {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex: 1;
  min-width: 0;
  padding: 0.65rem 0.75rem;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 550;
  text-align: left;
  cursor: pointer;
}
.folder-icon {
  flex: none;
  color: var(--accent);
}
.folder-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-lock {
  flex: none;
  color: var(--faint);
}
.folder-menu {
  position: relative;
  margin-right: 0.25rem;
}
.folder-menu .menu {
  right: 0;
  min-width: 11rem;
}
tr[draggable='true'] {
  cursor: grab;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
  color: var(--faint);
  font-size: 0.875rem;
}
.crumbs .current {
  color: var(--text-muted);
}
.more {
  width: 3rem;
  text-align: right;
}
.row-menu {
  position: relative;
  display: inline-block;
}
.row-menu .menu {
  min-width: 10rem;
}
.menu-item.danger {
  color: var(--danger);
}
a.menu-item,
button.menu-item {
  width: 100%;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: none;
  text-align: left;
}
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
.mine.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
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
.translations {
  white-space: nowrap;
}
.lang {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 1.4rem;
  margin-right: 0.25rem;
  padding: 0 0.35rem;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.lang.done {
  background: var(--success-soft);
  color: var(--ok);
}
.lang.todo {
  border: 1px dashed var(--border-strong);
  color: var(--faint);
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
.tree {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-inline-start: calc(var(--depth, 0) * 22px);
}
.tree-toggle {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
button.tree-toggle:hover {
  background: var(--surface-2);
}
.tree-toggle svg {
  transition: transform 0.15s;
}
.tree-toggle[aria-expanded='true'] svg {
  transform: rotate(90deg);
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
