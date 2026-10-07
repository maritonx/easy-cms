<script setup lang="ts">
import { Download } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { fileKind } from '../lib/filetypes'
import { t } from '../lib/i18n'
import { settings } from '../lib/settings'
import { parseCsv, readTextStart } from '../lib/text-preview'
import MediaThumb from './MediaThumb.vue'

/** A media document as its type is best seen: the image, a player, the PDF, the text. */
const props = defineProps<{ media: Record<string, unknown> }>()

const kind = computed(() => fileKind(props.media.mimeType))
const url = computed(() => String(props.media.url ?? ''))
/** Through the API, from this origin: the same headers for every storage. */
const fileRoute = computed(
  () => `${settings.apiPath}/media/file/${encodeURIComponent(String(props.media.filename ?? ''))}`,
)
const name = computed(() =>
  String(props.media.alt || props.media.originalName || props.media.filename || ''),
)

const LINES = 100
const text = ref<{ lines: string[]; more: boolean } | null>(null)
const failed = ref(false)
watch(
  () => [kind.value, fileRoute.value] as const,
  async ([k, route]) => {
    text.value = null
    failed.value = false
    if (k !== 'text' && props.media.mimeType !== 'text/csv') return
    try {
      const start = await readTextStart(route)
      const lines = start.text.split(/\r?\n/)
      text.value = { lines: lines.slice(0, LINES), more: start.more || lines.length > LINES }
    } catch {
      failed.value = true
    }
  },
  { immediate: true },
)
const csv = computed(() =>
  props.media.mimeType === 'text/csv' && text.value ? parseCsv(text.value.lines.join('\n')) : null,
)
</script>

<template>
  <div class="preview">
    <MediaThumb v-if="kind === 'image'" :media="media" size="large" />
    <video v-else-if="kind === 'video'" class="player" :src="url" controls preload="metadata">
      <a :href="url">{{ name }}</a>
    </video>
    <div v-else-if="kind === 'audio'" class="audio">
      <MediaThumb :media="media" size="card" />
      <audio class="audio-player" :src="url" controls preload="metadata" />
    </div>
    <iframe v-else-if="kind === 'pdf'" class="pdf" :src="fileRoute" :title="name" />
    <div v-else-if="csv" class="text">
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th v-for="(cell, i) in csv[0]" :key="i" scope="col">{{ cell }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in csv.slice(1)" :key="r">
              <td v-for="(cell, i) in row" :key="i">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="text?.more" class="muted more">{{ t('media.previewMore', { count: LINES }) }}</p>
    </div>
    <div v-else-if="text" class="text">
      <pre>{{ text.lines.join('\n') }}</pre>
      <p v-if="text.more" class="muted more">{{ t('media.previewMore', { count: LINES }) }}</p>
    </div>
    <div v-else class="other">
      <MediaThumb :media="media" size="large" />
      <p v-if="failed" class="muted">{{ t('media.previewFailed') }}</p>
    </div>
    <a v-if="kind !== 'image'" class="btn btn-sm download" :href="url" :download="String(media.originalName || media.filename || '')" target="_blank" rel="noopener">
      <Download :size="15" aria-hidden="true" />
      {{ t('media.download') }}
    </a>
  </div>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
}
.preview > :first-child {
  width: 100%;
}
.player {
  max-height: 70vh;
  border-radius: var(--radius-sm);
  background: #000;
}
.audio {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.audio :deep(.thumb) {
  width: 6rem;
  flex: none;
}
.audio-player {
  flex: 1;
  min-width: 0;
}
.pdf {
  height: 70vh;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.text {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
}
pre {
  max-height: 60vh;
  margin: 0;
  padding: 0.75rem 1rem;
  overflow: auto;
  font-family: var(--mono);
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.table-scroll {
  max-height: 60vh;
  overflow: auto;
}
table {
  border-collapse: collapse;
  font-size: 0.85rem;
}
th,
td {
  padding: 0.35rem 0.65rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}
th {
  position: sticky;
  top: 0;
  background: var(--surface);
  font-weight: 600;
}
.more {
  margin: 0;
  padding: 0.4rem 1rem;
  font-size: 0.8rem;
  border-top: 1px solid var(--border);
}
</style>
