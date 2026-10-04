<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { ApiError, type Doc, uploadFile, uploadFromURL } from '../lib/api'
import { t } from '../lib/i18n'
import { session } from '../lib/session'

const props = defineProps<{ accept?: string | undefined; multiple?: boolean }>()
const emit = defineEmits<{ uploaded: [Doc[]] }>()

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const busy = ref('')
const errors = ref<string[]>([])
const done = ref('')
/** Uploads from links, when the server allows them (`upload.fromURL`). */
const links = computed(() => session.schema?.uploadFromURL === true)
const link = ref('')
const linkId = useId()

const messageOf = (e: unknown) =>
  e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)

/** Uploads files, or has the server download links; reports each failure by name. */
async function run(items: (File | string)[]) {
  errors.value = []
  done.value = ''
  const list = props.multiple === false ? items.slice(0, 1) : items
  const uploaded: Doc[] = []
  for (const item of list) {
    const name = typeof item === 'string' ? item : item.name
    busy.value =
      typeof item === 'string' ? t('media.importing', { name }) : t('media.uploading', { name })
    try {
      uploaded.push(typeof item === 'string' ? await uploadFromURL(item) : await uploadFile(item))
    } catch (e) {
      errors.value.push(t('media.failed', { name, message: messageOf(e) }))
    }
  }
  busy.value = ''
  if (uploaded.length) {
    done.value = t('media.uploaded', { count: uploaded.length })
    emit('uploaded', uploaded)
  }
  if (input.value) input.value.value = ''
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
  if (!value || busy.value) return
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
        :disabled="!!busy"
        @change="onChange"
      />
    </label>
    <span class="muted" aria-live="polite">{{ busy || done || (links ? t('media.dropOrLink') : t('media.drop')) }}</span>
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
        :disabled="!!busy"
        @keydown.enter.prevent="importLink"
      />
      <button type="button" class="btn btn-sm" :disabled="!!busy || !link.trim()" @click="importLink">
        {{ t('media.import') }}
      </button>
    </div>
    <ul v-if="errors.length" class="errors" role="alert">
      <li v-for="e in errors" :key="e" class="field-error">{{ e }}</li>
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
.errors {
  flex-basis: 100%;
  margin: 0;
  padding-left: 1.1rem;
}
</style>
