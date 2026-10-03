<script setup lang="ts">
import { ArrowLeft, ArrowRight, ImagePlus, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import MediaPicker from '../components/MediaPicker.vue'
import MediaThumb from '../components/MediaThumb.vue'
import UploadDropzone from '../components/UploadDropzone.vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import { t } from '../lib/i18n'
import { notify } from '../lib/toast'

type Id = number | string

/** An upload field with `hasMany`: files in the order editors arrange, e.g. a gallery. */
const props = defineProps<{
  id: string
  /** The field's label, naming the group for screen readers. */
  label: string
  modelValue: unknown
  readOnly: boolean
  invalid: boolean
  mimeTypes?: readonly string[] | undefined
  minRows?: number | undefined
  maxRows?: number | undefined
}>()
const emit = defineEmits<{ 'update:modelValue': [Id[]] }>()

const ids = computed<Id[]>(() =>
  Array.isArray(props.modelValue) ? (props.modelValue as Id[]) : [],
)
const byId = ref<Record<string, Doc>>({})
const picking = ref(false)
const room = computed(() =>
  props.maxRows === undefined ? undefined : Math.max(0, props.maxRows - ids.value.length),
)
const accept = computed(() => props.mimeTypes?.join(','))

/** The media documents for ids not loaded yet, 100 at a time. */
async function load(list: Id[]) {
  const missing = list.filter((id) => !(String(id) in byId.value))
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100)
    try {
      const found = await api<Paginated<Doc>>(
        'GET',
        `/media${toQuery({ where: { id: { in: chunk.join(',') } }, limit: 100, depth: 0 })}`,
      )
      for (const doc of found.docs) byId.value[String(doc.id)] = doc
    } catch {
      // no read access: the ids still show
    }
  }
}
watch(ids, load, { immediate: true })

function set(next: Id[]) {
  emit('update:modelValue', next)
}
/** Adds files at the end, skipping ones already there and any beyond `maxRows`. */
function add(docs: Doc[]) {
  for (const doc of docs) byId.value[String(doc.id)] = doc
  const fresh = docs.map((d) => d.id as Id).filter((id) => !ids.value.includes(id))
  const fits = room.value === undefined ? fresh : fresh.slice(0, room.value)
  if (fits.length < fresh.length)
    notify(
      'error',
      t('media.tooMany', { max: props.maxRows ?? 0, count: fresh.length - fits.length }),
    )
  if (fits.length) set([...ids.value, ...fits])
  picking.value = false
}
function remove(index: number) {
  set(ids.value.filter((_, i) => i !== index))
}
function move(from: number, to: number) {
  if (to < 0 || to >= ids.value.length || from === to) return
  const next = [...ids.value]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as Id)
  set(next)
}

// Drag to reorder; the arrow buttons do the same from the keyboard.
const dragging = ref<number | null>(null)
const over = ref<number | null>(null)
function onDragStart(event: DragEvent, index: number) {
  dragging.value = index
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onDrop(index: number) {
  if (dragging.value !== null) move(dragging.value, index)
  dragging.value = null
  over.value = null
}

const nameOf = (id: Id) => {
  const doc = byId.value[String(id)]
  return String(doc?.alt || doc?.filename || `#${id}`)
}
</script>

<template>
  <div :id="id" class="gallery" role="group" :aria-label="label" :aria-invalid="invalid">
    <ol v-if="ids.length" class="items">
      <li
        v-for="(item, index) in ids"
        :key="String(item)"
        :class="['tile', { over: over === index && dragging !== index, dragging: dragging === index }]"
        :draggable="!readOnly"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent="over = index"
        @dragleave="over = null"
        @drop.prevent="onDrop(index)"
        @dragend="dragging = null; over = null"
      >
        <MediaThumb v-if="byId[String(item)]" :media="byId[String(item)] as Doc" />
        <span v-else class="thumb placeholder" aria-hidden="true" />
        <span class="name" :title="nameOf(item)">{{ nameOf(item) }}</span>
        <span v-if="!readOnly" class="tools">
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            :disabled="index === 0"
            :aria-label="t('media.moveEarlier', { name: nameOf(item) })"
            @click="move(index, index - 1)"
          >
            <ArrowLeft :size="14" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            :disabled="index === ids.length - 1"
            :aria-label="t('media.moveLater', { name: nameOf(item) })"
            @click="move(index, index + 1)"
          >
            <ArrowRight :size="14" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            :aria-label="t('field.remove', { title: nameOf(item) })"
            @click="remove(index)"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </span>
      </li>
    </ol>
    <span v-else-if="readOnly" class="muted">—</span>

    <div v-if="!readOnly" class="add">
      <button type="button" class="btn" :disabled="room === 0" @click="picking = true">
        <ImagePlus :size="16" aria-hidden="true" />
        {{ t('media.choose') }}
      </button>
      <UploadDropzone v-if="room !== 0" :accept="accept" multiple @uploaded="add" />
    </div>
    <p v-if="maxRows !== undefined || minRows !== undefined" class="count muted">
      {{ maxRows !== undefined ? t('media.count', { count: ids.length, max: maxRows }) : t('media.countMin', { count: ids.length, min: minRows ?? 0 }) }}
    </p>
  </div>
  <!-- Outside the group: its own upload field is not the gallery's. -->
  <MediaPicker
    :open="picking"
    multiple
    :mime-types="mimeTypes"
    :room="room"
    @select-many="add"
    @close="picking = false"
  />
</template>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  gap: 0.6rem;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: grab;
}
.tile.dragging {
  opacity: 0.4;
}
.tile.over {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.tile :deep(.thumb),
.placeholder {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}
.placeholder {
  display: block;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.name {
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tools {
  display: flex;
  justify-content: space-between;
}
.add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}
.add :deep(.dropzone) {
  flex: 1;
  min-width: 14rem;
}
.count {
  margin: 0;
  font-size: 0.8rem;
}
</style>
