<script setup lang="ts">
import type { AdminField, Version, VersionSummary } from '@easy-cms/core'
import { ref, watch } from 'vue'
import FieldList from '../fields/FieldList.vue'
import { ApiError, api, type Paginated } from '../lib/api'
import { toFormValues } from '../lib/fields'
import { formatDate, t } from '../lib/i18n'
import { session } from '../lib/session'

const props = defineProps<{
  /** The document's API path, e.g. `/posts/3` or `/globals/site`. */
  path: string
  fields: readonly AdminField[]
  drafts: boolean
  canRestore: boolean
  /** Changes after every save, so the list reloads. */
  reloadKey: number
}>()
const emit = defineEmits<{ restored: [doc: Record<string, unknown>] }>()

const PAGE_SIZE = 10
const versions = ref<VersionSummary[]>([])
const hasMore = ref(false)
const page = ref(1)
const error = ref('')
const selected = ref<Version | null>(null)
const preview = ref<Record<string, unknown>>({})
const restoring = ref(false)
const dialog = ref<HTMLDialogElement>()

async function load(reset = true) {
  if (reset) page.value = 1
  try {
    const result = await api<Paginated<VersionSummary>>(
      'GET',
      `${props.path}/versions?limit=${PAGE_SIZE}&page=${page.value}`,
    )
    versions.value = reset ? result.docs : [...versions.value, ...result.docs]
    hasMore.value = result.hasNextPage
    error.value = ''
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 403 ? t('common.forbidden') : String(e)
  }
}

async function more() {
  page.value += 1
  await load(false)
}

async function open(summary: VersionSummary) {
  const version = await api<Version>('GET', `${props.path}/versions/${summary.id}?depth=0`)
  selected.value = version
  preview.value = toFormValues(props.fields, version.data)
  dialog.value?.showModal()
}

function close() {
  dialog.value?.close()
  selected.value = null
}

async function restore() {
  if (!selected.value) return
  restoring.value = true
  try {
    const doc = await api<Record<string, unknown>>(
      'POST',
      `${props.path}/versions/${selected.value.id}/restore?depth=0`,
    )
    close()
    emit('restored', doc)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    restoring.value = false
  }
}

function author(version: VersionSummary) {
  if (version.author === null) return ''
  const name =
    String(version.author) === String(session.user?.id)
      ? t('history.you')
      : t('history.user', { id: String(version.author) })
  return t('history.by', { name })
}

watch(
  () => [props.path, props.reloadKey],
  () => load(),
  { immediate: true },
)
</script>

<template>
  <aside class="card history" :aria-label="t('history.title')">
    <h2>{{ t('history.title') }}</h2>
    <p v-if="error" class="field-error">{{ error }}</p>
    <p v-else-if="versions.length === 0" class="muted">{{ t('history.empty') }}</p>
    <ol v-else>
      <li v-for="version in versions" :key="String(version.id)">
        <button type="button" class="version" @click="open(version)">
          <span class="when">{{ formatDate(version.createdAt) }}</span>
          <span class="muted who">{{ author(version) }}</span>
          <span class="tags">
            <span v-if="drafts && version.status" :class="['badge', `badge-${version.status}`]">
              {{ t(version.status === 'published' ? 'status.published' : 'status.draft') }}
            </span>
            <span v-if="version.latest" class="badge">{{ t('history.current') }}</span>
          </span>
        </button>
      </li>
    </ol>
    <button v-if="hasMore" type="button" class="btn more" @click="more">{{ t('history.more') }}</button>

    <dialog ref="dialog" class="dialog card" :aria-label="t('history.title')" @cancel.prevent="close">
      <template v-if="selected">
        <header>
          <h2>{{ t('history.view', { date: formatDate(selected.createdAt) }) }}</h2>
          <span v-if="drafts && selected.status" :class="['badge', `badge-${selected.status}`]">
            {{ t(selected.status === 'published' ? 'status.published' : 'status.draft') }}
          </span>
        </header>
        <div class="preview">
          <FieldList v-model="preview" :fields="fields" :errors="{}" read-only />
        </div>
        <div class="actions">
          <button type="button" class="btn" @click="close">{{ t('history.close') }}</button>
          <button
            v-if="canRestore && !selected.latest"
            type="button"
            class="btn btn-primary"
            :disabled="restoring"
            @click="restore"
          >
            {{ drafts ? t('history.restoreDraft') : t('history.restore') }}
          </button>
        </div>
      </template>
    </dialog>
  </aside>
</template>

<style scoped>
.history {
  padding: 1rem;
}
h2 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
}
ol {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.version {
  display: grid;
  width: 100%;
  gap: 0.15rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid transparent;
  border-radius: var(--radius, 6px);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.version:hover,
.version:focus-visible {
  border-color: var(--border);
  background: var(--surface-2, var(--bg));
}
.when {
  font-size: 0.85rem;
  font-weight: 550;
}
.who {
  font-size: 0.8rem;
}
.tags {
  display: flex;
  gap: 0.35rem;
}
.more {
  width: 100%;
  margin-top: 0.5rem;
}
.dialog {
  width: min(48rem, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  overflow-y: auto;
  padding: 1.25rem 1.25rem 0;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.dialog header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.dialog header h2 {
  margin: 0;
}
.preview {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
/* Stays visible while the version's fields scroll. */
.actions {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding: 0.75rem 0 1.25rem;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
</style>
