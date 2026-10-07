<script setup lang="ts">
import { Check, ChevronRight, Folder } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { api, type Doc, type Id, type Paginated, toQuery } from '../lib/api'
import {
  atLeast,
  buildTree,
  type FieldFolder,
  type FolderTree,
  foldersOn,
  folderWhere,
  lastFolder,
  loadFolders,
  pathTo,
  rememberFolder,
} from '../lib/folders'
import { t } from '../lib/i18n'
import { findCollection } from '../lib/session'
import MediaThumb from './MediaThumb.vue'
import UploadDropzone from './UploadDropzone.vue'

const props = defineProps<{
  open: boolean
  imagesOnly?: boolean
  /** Allowed file types, e.g. `image/*` (an upload field's `mimeTypes`). */
  mimeTypes?: readonly string[] | undefined
  /** Pick several files, then add them with one button. */
  multiple?: boolean
  /** How many more files fit (`maxRows`), when picking several. */
  room?: number | undefined
  allowUrl?: boolean
  /** An upload field's folder (`folder`): the picker opens there; `only`: and stays inside it. */
  folder?: FieldFolder | undefined
}>()
const emit = defineEmits<{ select: [Doc]; selectMany: [Doc[]]; url: [string]; close: [] }>()

const types = computed(() => props.mimeTypes ?? (props.imagesOnly ? ['image/*'] : undefined))
const accept = computed(() => types.value?.join(','))
/** Files picked so far, in the order they were picked. */
const chosen = ref<Doc[]>([])
const isChosen = (doc: Doc) => chosen.value.some((d) => d.id === doc.id)
const full = computed(() => props.room !== undefined && chosen.value.length >= props.room)
function toggle(doc: Doc) {
  if (isChosen(doc)) chosen.value = chosen.value.filter((d) => d.id !== doc.id)
  else if (!full.value) chosen.value = [...chosen.value, doc]
}
function pick(doc: Doc) {
  if (props.multiple) toggle(doc)
  else emit('select', doc)
}
function addChosen() {
  emit('selectMany', chosen.value)
  chosen.value = []
}

const dialog = ref<HTMLDialogElement>()
const search = ref('')
const items = ref<Doc[]>([])
const page = ref(1)
const hasMore = ref(false)
const urlInput = ref('')

// Folders (`upload.folders`): the picker opens where the user last worked.
const useFolders = foldersOn()
const tree = ref<FolderTree>({ roots: [], byId: new Map() })
/** The folder the picker shows; `null`: the top level. */
const openId = ref<Id | null>(null)
/** With `folderOnly`: the picker's top, which it can't go above. */
const top = computed<Id | null>(() => (props.folder?.only ? props.folder.id : null))
const crumbs = computed(() => {
  const path = pathTo(tree.value, openId.value)
  if (top.value === null) return path
  const start = path.findIndex((n) => String(n.id) === String(top.value))
  return start === -1 ? path : path.slice(start + 1)
})
const subfolders = computed(() =>
  openId.value === null
    ? tree.value.roots
    : (tree.value.byId.get(String(openId.value))?.children ?? []),
)
const canUpload = computed(() => {
  if (!useFolders) return true
  if (openId.value === null) return !!findCollection('media')?.permissions.create
  return atLeast(tree.value.byId.get(String(openId.value))?.level, 'edit')
})
async function loadTree() {
  if (!useFolders) return
  tree.value = buildTree(await loadFolders().catch(() => []))
  // The field's folder, else where the user last was.
  if (props.folder) {
    openId.value = props.folder.id
    return
  }
  const last = lastFolder()
  openId.value = last === null ? null : (tree.value.byId.get(last)?.id ?? null)
}
function openFolder(id: Id | null) {
  openId.value = id ?? top.value
  if (!props.folder) rememberFolder(id)
  search.value = ''
  void load()
}

async function load(reset = true) {
  if (reset) page.value = 1
  const where: Record<string, unknown> = {}
  const inFolder = useFolders ? folderWhere(tree.value, openId.value, !!search.value) : undefined
  if (inFolder) Object.assign(where, inFolder)
  if (search.value)
    where.or = [{ filename: { like: search.value } }, { alt: { like: search.value } }]
  if (types.value)
    where.and = [
      {
        or: types.value.map((type) =>
          type.endsWith('/*')
            ? { mimeType: { like: type.slice(0, -1) } }
            : { mimeType: { equals: type } },
        ),
      },
    ]
  const result = await api<Paginated<Doc>>(
    'GET',
    `/media${toQuery({ where, limit: 24, page: page.value, sort: '-createdAt', depth: 0 })}`,
  )
  items.value = reset ? result.docs : [...items.value, ...result.docs]
  hasMore.value = result.hasNextPage
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      chosen.value = []
      dialog.value?.showModal()
      void loadTree().then(() => load())
    } else {
      dialog.value?.close()
    }
  },
)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => load(), 250)
})
onMounted(() => {
  if (props.open) void loadTree().then(() => load())
})

function onUploaded(docs: Doc[]) {
  // Picking right after uploading is the common case.
  if (props.multiple) {
    for (const doc of docs) if (!isChosen(doc) && !full.value) chosen.value = [...chosen.value, doc]
    void load()
  } else if (docs.length === 1) emit('select', docs[0] as Doc)
  else void load()
}
function insertUrl() {
  if (urlInput.value.trim()) emit('url', urlInput.value.trim())
  urlInput.value = ''
}
</script>

<template>
  <dialog ref="dialog" class="picker card" :aria-label="t('media.pickerTitle')" @cancel.prevent="emit('close')">
    <header class="picker-header">
      <h2>{{ t('media.pickerTitle') }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" :aria-label="t('common.cancel')" @click="emit('close')">✕</button>
    </header>
    <nav v-if="useFolders" class="crumbs" :aria-label="t('folders.path')">
      <button type="button" class="crumb" :aria-current="String(openId) === String(top) ? 'page' : undefined" @click="openFolder(null)">
        {{ top === null ? t('folders.top') : (tree.byId.get(String(top))?.name ?? t('folders.top')) }}
      </button>
      <template v-for="(node, i) in crumbs" :key="String(node.id)">
        <ChevronRight :size="13" aria-hidden="true" />
        <button type="button" class="crumb" :aria-current="i === crumbs.length - 1 ? 'page' : undefined" @click="openFolder(node.id)">{{ node.name }}</button>
      </template>
    </nav>
    <UploadDropzone v-if="canUpload" :accept="accept" :multiple="!!multiple" :folder="useFolders ? openId : undefined" @uploaded="onUploaded" />
    <input v-model="search" class="input" type="search" :placeholder="t('field.searchRelation')" />
    <ul v-if="useFolders && !search && subfolders.length" class="subfolders">
      <li v-for="node in subfolders" :key="String(node.id)">
        <button type="button" class="subfolder" @click="openFolder(node.id)">
          <Folder :size="16" aria-hidden="true" />
          <span>{{ node.name }}</span>
        </button>
      </li>
    </ul>
    <p v-if="!items.length" class="muted">{{ t('media.empty') }}</p>
    <ul class="grid">
      <li v-for="item in items" :key="String(item.id)">
        <button
          type="button"
          :class="['item', { chosen: multiple && isChosen(item) }]"
          :title="String(item.filename)"
          :aria-pressed="multiple ? isChosen(item) : undefined"
          :disabled="multiple && full && !isChosen(item)"
          @click="pick(item)"
        >
          <MediaThumb :media="item" />
          <span class="name">{{ item.alt || item.filename }}</span>
          <span v-if="multiple && isChosen(item)" class="tick" aria-hidden="true"><Check :size="14" /></span>
        </button>
      </li>
    </ul>
    <button v-if="hasMore" type="button" class="btn btn-sm" @click="page++, load(false)">{{ t('list.next') }}</button>
    <footer v-if="multiple" class="picker-footer">
      <span class="muted">{{ full ? t('media.full') : '' }}</span>
      <button type="button" class="btn btn-primary" :disabled="!chosen.length" @click="addChosen">
        {{ t('media.addChosen', { count: chosen.length }) }}
      </button>
    </footer>
    <form v-if="allowUrl" class="url" @submit.prevent="insertUrl">
      <label class="field">
        <span class="field-label">{{ t('rte.imageFromUrl') }}</span>
        <span class="url-row">
          <input v-model="urlInput" class="input" type="url" placeholder="https://" />
          <button type="submit" class="btn">{{ t('common.confirm') }}</button>
        </span>
      </label>
    </form>
  </dialog>
</template>

<style scoped>
.picker {
  width: min(52rem, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.picker[open] {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.picker::backdrop {
  background: rgb(0 0 0 / 35%);
}
.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.picker-header h2 {
  font-size: 1.1rem;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.6rem;
  overflow-y: auto;
}
.item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  padding: 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font: inherit;
}
.item {
  position: relative;
}
.item:hover:not(:disabled) {
  border-color: var(--accent);
}
.item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.item.chosen {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.tick {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: var(--accent);
  color: var(--surface);
}
.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.item :deep(.thumb) {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}
.name {
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem;
  color: var(--faint);
}
.crumb {
  padding: 0.15rem 0.35rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.crumb:hover {
  background: var(--surface-2);
}
.crumb[aria-current='page'] {
  color: var(--text);
  font-weight: 600;
}
.subfolders {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.subfolder {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.subfolder:hover {
  border-color: var(--accent);
}
.subfolder :deep(svg) {
  color: var(--accent);
}
.url-row {
  display: flex;
  gap: 0.5rem;
}
</style>
