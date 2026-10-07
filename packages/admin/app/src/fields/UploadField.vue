<script setup lang="ts">
import { EyeOff, ImageUp, Lock, Trash2, Upload } from '@lucide/vue'
import { ref, watch } from 'vue'
import MediaPicker from '../components/MediaPicker.vue'
import MediaThumb from '../components/MediaThumb.vue'
import { api, type Doc } from '../lib/api'
import type { FieldFolder } from '../lib/folders'
import { t } from '../lib/i18n'

const props = defineProps<{
  id: string
  modelValue: unknown
  readOnly: boolean
  invalid: boolean
  /** Allowed file types (`mimeTypes`), e.g. `image/*`. */
  mimeTypes?: readonly string[] | undefined
  /** The media folder the picker opens in (`folder`). */
  folder?: FieldFolder | undefined
}>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const media = ref<Doc | null>(null)
const picking = ref(false)

async function load(id: unknown) {
  if (id === null || id === undefined || id === '') {
    media.value = null
    return
  }
  if (media.value && String(media.value.id) === String(id)) return
  media.value = await api<Doc>('GET', `/media/${encodeURIComponent(String(id))}?depth=0`).catch(
    () => null,
  )
}
watch(() => props.modelValue, load, { immediate: true })

function choose(doc: Doc) {
  media.value = doc
  picking.value = false
  emit('update:modelValue', doc.id)
}
</script>

<template>
  <!-- The field label points at this group; buttons keep their own names. -->
  <div :id="id" class="upload" role="group" :aria-invalid="invalid">
    <div v-if="media" class="selected card">
      <MediaThumb :media="media" />
      <div class="info">
        <RouterLink :to="`/collections/media/${media.id}`" class="name">{{ media.alt || media.filename }}</RouterLink>
        <span class="muted small">{{ media.mimeType }}</span>
        <!-- A private file: visitors to the site can't open it. -->
        <span v-if="media.private" class="private small" :title="t('media.privateHint')">
          <EyeOff :size="13" aria-hidden="true" />
          {{ t('media.private') }} · {{ t('media.privateHint') }}
        </span>
      </div>
      <div v-if="!readOnly" class="actions">
        <button type="button" class="btn btn-sm" @click="picking = true">
          <Upload :size="15" aria-hidden="true" />
          {{ t('media.change') }}
        </button>
        <button type="button" class="btn btn-sm btn-ghost" @click="emit('update:modelValue', null)">
          <Trash2 :size="15" aria-hidden="true" />
          {{ t('media.remove') }}
        </button>
      </div>
    </div>
    <!-- A file in a folder the user may not see: it stays unless they change or remove it. -->
    <div v-else-if="modelValue !== null && modelValue !== undefined && modelValue !== ''" class="selected card">
      <span class="locked" aria-hidden="true"><Lock :size="18" /></span>
      <div class="info">
        <span class="name muted">{{ t('media.noAccess') }}</span>
      </div>
      <div v-if="!readOnly" class="actions">
        <button type="button" class="btn btn-sm" @click="picking = true">
          <Upload :size="15" aria-hidden="true" />
          {{ t('media.change') }}
        </button>
        <button type="button" class="btn btn-sm btn-ghost" @click="emit('update:modelValue', null)">
          <Trash2 :size="15" aria-hidden="true" />
          {{ t('media.remove') }}
        </button>
      </div>
    </div>
    <button v-else-if="!readOnly" type="button" class="btn choose" @click="picking = true">
      <ImageUp :size="18" aria-hidden="true" />
      {{ t('media.choose') }}
    </button>
    <span v-else class="muted">—</span>
    <MediaPicker :open="picking" :mime-types="mimeTypes" :folder="folder" @select="choose" @close="picking = false" />
  </div>
</template>

<style scoped>
.selected {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
}
.info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.name {
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.small {
  font-size: 0.8rem;
}
.actions {
  display: flex;
  gap: 0.25rem;
}
.private {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--warning-text);
}
.locked {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--faint);
}
.choose {
  width: 100%;
  min-height: 4.5rem;
  border-style: dashed;
  color: var(--text-muted);
}
</style>
