<script setup lang="ts">
import { RotateCcw, X } from '@lucide/vue'
import { computed, ref, useId } from 'vue'
import {
  ApiError,
  type Doc,
  type Id,
  type Upload,
  UploadCancelled,
  uploadFromURL,
  uploadWithProgress,
} from '../lib/api'
import { fileKind, KIND_ICON } from '../lib/filetypes'
import { formatBytes, t } from '../lib/i18n'
import { session } from '../lib/session'

// Several files unless `multiple` is false (Vue would turn a missing boolean into false).
const props = withDefaults(
  defineProps<{
    accept?: string | undefined
    multiple?: boolean
    /** The media folder files go in (`upload.folders`). */
    folder?: number | string | null | undefined
  }>(),
  { multiple: true },
)
/** When a batch is finished: the files uploaded, in the order they were added. */
const emit = defineEmits<{ uploaded: [Doc[]] }>()

const input = ref<HTMLInputElement>()
const dragging = ref(false)
/** Uploads from links, when the server allows them (`upload.fromURL`). */
const links = computed(() => session.schema?.uploadFromURL === true)
const link = ref('')
const linkId = useId()
const maxFileSize = computed(() => session.schema?.upload?.maxFileSize)

/** Files (or links) in the queue: three at a time, each with its progress. */
interface Item {
  key: number
  source: File | string
  name: string
  size: number | null
  kind: ReturnType<typeof fileKind>
  state: 'waiting' | 'uploading' | 'done' | 'failed' | 'cancelled'
  progress: number
  error: string
  /** Trying again could work (not for a file that is too big). */
  retryable: boolean
  doc: Doc | null
  upload: Upload | null
  folder: Id | null | undefined
}
const queue = ref<Item[]>([])
const PARALLEL = 3
let nextKey = 0
/** Files uploaded in the batch still running. */
let batch: Doc[] = []

const messageOf = (e: unknown) =>
  e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : (e as Error).message
const busy = computed(() =>
  queue.value.some((i) => i.state === 'waiting' || i.state === 'uploading'),
)
const counts = computed(() => ({
  done: queue.value.filter((i) => i.state === 'done').length,
  failed: queue.value.filter((i) => i.state === 'failed').length,
  left: queue.value.filter((i) => i.state === 'waiting' || i.state === 'uploading').length,
}))
/** Shown in the list: what is going on and what failed; finished files are only counted. */
const shown = computed(() =>
  queue.value.filter((i) => i.state !== 'done' && i.state !== 'cancelled'),
)

function add(items: (File | string)[]) {
  const list = props.multiple === false ? items.slice(0, 1) : items
  if (!busy.value) {
    // A new batch: what finished before goes, what failed stays to retry.
    queue.value = queue.value.filter((i) => i.state === 'failed')
    batch = []
  }
  for (const source of list) {
    const file = typeof source === 'string' ? null : source
    const item: Item = {
      key: nextKey++,
      source,
      name: file ? file.name : (source as string),
      size: file ? file.size : null,
      kind: fileKind(file?.type),
      state: 'waiting',
      progress: 0,
      error: '',
      retryable: true,
      doc: null,
      upload: null,
      folder: props.folder,
    }
    // Too big: no need to send it to find out.
    if (file && maxFileSize.value && file.size > maxFileSize.value) {
      item.state = 'failed'
      item.error = t('media.tooBig', { max: formatBytes(maxFileSize.value) })
      item.retryable = false
    }
    queue.value.push(item)
  }
  if (input.value) input.value.value = ''
  pump()
}

/** Starts waiting files while fewer than three are uploading. */
function pump() {
  const items = queue.value
  while (items.filter((i) => i.state === 'uploading').length < PARALLEL) {
    const next = items.find((i) => i.state === 'waiting')
    if (!next) break
    void start(next)
  }
  if (!items.some((i) => i.state === 'waiting' || i.state === 'uploading') && batch.length) {
    const docs = batch
    batch = []
    emit('uploaded', docs)
  }
}

async function start(item: Item) {
  // Reactive copy: changes to it update the list.
  const live = queue.value.find((i) => i.key === item.key) as Item
  live.state = 'uploading'
  live.progress = 0
  try {
    if (typeof live.source === 'string') {
      live.doc = await uploadFromURL(live.source, undefined, live.folder)
    } else {
      live.upload = uploadWithProgress(live.source, { folder: live.folder }, (fraction) => {
        live.progress = fraction
      })
      live.doc = await live.upload.done
    }
    live.state = 'done'
    live.progress = 1
    batch.push(live.doc)
  } catch (e) {
    if (e instanceof UploadCancelled) live.state = 'cancelled'
    else {
      live.state = 'failed'
      live.error = messageOf(e)
    }
  } finally {
    live.upload = null
    pump()
  }
}

function cancel(item: Item) {
  if (item.state === 'waiting') item.state = 'cancelled'
  else item.upload?.abort()
  pump()
}
function retry(item: Item) {
  if (!busy.value) batch = []
  item.state = 'waiting'
  item.error = ''
  pump()
}
function clearFailed() {
  queue.value = queue.value.filter((i) => i.state !== 'failed')
}
function run(items: (File | string)[]) {
  add(items)
}

/** `http(s)` links in text, one per line (as `text/uri-list` and pasted lists have them). */
function linksIn(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\/\S+$/i.test(line))
}

function onChange(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  if (files.length) void run(files)
}
function onDrop(event: DragEvent) {
  dragging.value = false
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length) return void run(files)
  // An image dragged from another page arrives as its link.
  const dropped = links.value ? linksIn(event.dataTransfer?.getData('text/uri-list') ?? '') : []
  if (dropped.length) void run(dropped)
}
function onPaste(event: ClipboardEvent) {
  // Typing or pasting into the link field is just text.
  if (event.target instanceof HTMLInputElement) return
  const files = [...(event.clipboardData?.files ?? [])]
  const pasted = links.value ? linksIn(event.clipboardData?.getData('text') ?? '') : []
  if (!files.length && !pasted.length) return
  event.preventDefault()
  void run(files.length ? files : pasted)
}
function importLink() {
  const value = link.value.trim()
  if (!value) return
  link.value = ''
  void run([value])
}
</script>

<template>
  <!-- Focusable, so files and links can be pasted into it. -->
  <div
    :class="['dropzone', { dragging }]"
    tabindex="0"
    :aria-label="t('media.dropArea')"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <label class="btn btn-sm">
      {{ t('media.upload') }}
      <input
        ref="input"
        class="visually-hidden"
        type="file"
        :accept="accept"
        :multiple="multiple !== false"
        @change="onChange"
      />
    </label>
    <span class="muted status" aria-live="polite">
      <template v-if="counts.left">{{ t('media.uploadingCount', { done: counts.done, total: counts.done + counts.left }) }}</template>
      <template v-else-if="counts.done || counts.failed">
        {{ counts.failed ? t('media.uploadedSome', { done: counts.done, failed: counts.failed }) : t('media.uploaded', { count: counts.done }) }}
      </template>
      <template v-else>{{ links ? t('media.dropOrLink') : t('media.drop') }}</template>
    </span>
    <!-- Not a <form>: the drop zone can be inside an edit form. -->
    <div v-if="links" class="link">
      <label :for="linkId" class="link-label">{{ t('media.fromLink') }}</label>
      <input
        :id="linkId"
        v-model="link"
        class="input"
        type="url"
        inputmode="url"
        placeholder="https://"
        autocomplete="off"
        @keydown.enter.prevent="importLink"
      />
      <button type="button" class="btn btn-sm" :disabled="!link.trim()" @click="importLink">
        {{ t('media.import') }}
      </button>
    </div>
    <ul v-if="shown.length" class="queue" :aria-label="t('media.queue')">
      <li v-for="item in shown" :key="item.key" :class="['item', item.state]">
        <component :is="KIND_ICON[item.kind]" :size="18" class="item-icon" aria-hidden="true" />
        <span class="item-main">
          <span class="item-name" :title="item.name">{{ item.name }}</span>
          <span v-if="item.state === 'failed'" class="item-error" role="alert">{{ item.error }}</span>
          <progress
            v-else
            class="item-progress"
            :value="item.state === 'waiting' || typeof item.source === 'string' ? undefined : item.progress"
            max="1"
            :aria-label="t('media.progressOf', { name: item.name })"
          />
        </span>
        <span v-if="item.size !== null" class="item-size muted">{{ formatBytes(item.size) }}</span>
        <button
          v-if="item.state === 'failed' && item.retryable"
          type="button"
          class="btn btn-ghost btn-sm btn-icon"
          :aria-label="t('media.retry', { name: item.name })"
          @click="retry(item)"
        >
          <RotateCcw :size="15" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-icon"
          :aria-label="item.state === 'failed' ? t('media.dismiss', { name: item.name }) : t('media.cancel', { name: item.name })"
          @click="item.state === 'failed' ? (queue = queue.filter((i) => i !== item)) : cancel(item)"
        >
          <X :size="15" aria-hidden="true" />
        </button>
      </li>
      <li v-if="counts.failed > 1 && !counts.left" class="queue-actions">
        <button type="button" class="btn btn-ghost btn-sm" @click="clearFailed">{{ t('media.clearFailed') }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
}
.dropzone:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.dropzone label.btn:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.link {
  display: flex;
  flex-basis: 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.link-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.link input {
  flex: 1;
  min-width: 12rem;
}
.status {
  flex: 1;
  min-width: 12rem;
}
.queue {
  display: flex;
  flex-basis: 100%;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 16rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.item.failed {
  background: var(--danger-soft);
}
.item-icon {
  flex: none;
  color: var(--text-muted);
}
.item-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.item-name {
  overflow: hidden;
  font-size: 0.85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-error {
  color: var(--danger);
  font-size: 0.8rem;
}
.item-progress {
  width: 100%;
  height: 0.35rem;
  accent-color: var(--accent);
}
.item-size {
  flex: none;
  font-size: 0.8rem;
}
.queue-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
