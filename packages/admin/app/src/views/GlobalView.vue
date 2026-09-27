<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LivePreview from '../components/LivePreview.vue'
import LocaleSwitcher from '../components/LocaleSwitcher.vue'
import VersionHistory from '../components/VersionHistory.vue'
import FieldList from '../fields/FieldList.vue'
import { ApiError, api } from '../lib/api'
import { contentLocale, localeQuery, setContentLocale } from '../lib/content-locale'
import { snapshot, toFormValues } from '../lib/fields'
import { formatDate, label, t } from '../lib/i18n'
import { findGlobal } from '../lib/session'

type Data = Record<string, unknown>

const route = useRoute()
const slug = String(route.params.slug)
const global = findGlobal(slug)

const form = ref<Data>({})
const meta = ref<{ updatedAt?: unknown; status?: unknown }>({})
const baseline = ref('')
const loading = ref(true)
const saving = ref(false)
const errors = ref<Record<string, string[]>>({})
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
const readOnly = computed(() => !global?.permissions.update)
const dirty = computed(() => snapshot(form.value) !== baseline.value)
// See EditView: with versions and drafts the published version stays live until published again.
const separateDrafts = !!global?.drafts && !!global?.versions
const live = ref(false)
const pendingChanges = computed(
  () => separateDrafts && live.value && meta.value.status !== 'published',
)
const liveStatus = computed(() =>
  separateDrafts ? (live.value ? 'published' : 'draft') : String(meta.value.status ?? 'draft'),
)
const historyKey = ref(0)
const confirmingDiscard = ref(false)
const previewing = ref(false)
const side = computed(() =>
  readOnly.value ? null : previewing.value ? 'preview' : global?.versions ? 'history' : null,
)

function reset(data: Data) {
  if (!global) return
  form.value = toFormValues(global.fields, data)
  meta.value = { updatedAt: data.updatedAt, status: data.status }
  baseline.value = snapshot(form.value)
}

const localized = computed(
  () => !!contentLocale() && (global?.fields.some((f) => f.localized) ?? false),
)

async function switchLocale(next: string) {
  if (dirty.value && !window.confirm(t('locale.switchUnsaved'))) return
  setContentLocale(next)
  message.value = null
  errors.value = {}
  await load()
}

onMounted(() => load())

async function load() {
  if (!global) return
  try {
    const [draft, current] = await Promise.all([
      api<Data>('GET', `/globals/${slug}?depth=0&draft=true${localeQuery({ editing: true })}`),
      api<Data>('GET', `/globals/${slug}?depth=0`),
    ])
    live.value = current.status === 'published'
    reset(draft)
  } catch (e) {
    message.value = { kind: 'error', text: t('common.error', { message: (e as Error).message }) }
  } finally {
    loading.value = false
  }
}

async function save(status?: 'draft' | 'published') {
  saving.value = true
  errors.value = {}
  message.value = null
  try {
    reset(
      await api<Data>(
        'POST',
        `/globals/${slug}?depth=0${localeQuery({ editing: true })}`,
        status ? { ...form.value, status } : form.value,
      ),
    )
    historyKey.value += 1
    if (status === 'published') live.value = true
    const text =
      separateDrafts && live.value && status === 'draft' ? t('edit.draftSaved') : t('edit.saved')
    message.value = { kind: 'success', text }
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      message.value = {
        kind: 'error',
        text: Object.keys(errors.value).length ? t('edit.fixErrors') : e.message,
      }
    }
  } finally {
    saving.value = false
  }
}

async function action(path: 'unpublish' | 'discard-draft') {
  confirmingDiscard.value = false
  saving.value = true
  message.value = null
  try {
    reset(
      await api<Data>('POST', `/globals/${slug}/${path}?depth=0${localeQuery({ editing: true })}`),
    )
    if (path === 'unpublish') live.value = false
    historyKey.value += 1
    message.value = {
      kind: 'success',
      text: t(path === 'unpublish' ? 'edit.unpublished' : 'edit.discarded'),
    }
  } catch (e) {
    message.value = { kind: 'error', text: (e as Error).message }
  } finally {
    saving.value = false
  }
}

function restored(data: Data) {
  reset(data)
  historyKey.value += 1
  message.value = { kind: 'success', text: t('history.restored') }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(() => (dirty.value ? window.confirm(t('edit.unsaved')) : true))
</script>

<template>
  <p v-if="!global" class="notice">{{ t('common.notFound') }}</p>
  <p v-else-if="loading" class="muted">{{ t('common.loading') }}</p>
  <form v-else novalidate @submit.prevent="save(global.drafts ? 'published' : undefined)">
    <header class="editor-header">
      <div>
        <h1>{{ label(global.label, global.slug) }}</h1>
        <LocaleSwitcher v-if="localized" class="locale-switcher" @change="switchLocale" />
        <p v-if="meta.updatedAt" class="muted meta">
          <span v-if="global.drafts" :class="['badge', `badge-${liveStatus}`]">
            {{ t(liveStatus === 'published' ? 'status.published' : 'status.draft') }}
          </span>
          <span v-if="pendingChanges" class="badge badge-changed">{{ t('status.changed') }}</span>
          {{ t('list.updated') }} {{ formatDate(meta.updatedAt) }}
        </p>
      </div>
      <div class="actions">
        <span v-if="message" :class="['status', message.kind]" role="status" aria-live="polite">{{ message.text }}</span>
        <button v-if="global.preview && !readOnly" type="button" class="btn" :aria-pressed="previewing" @click="previewing = !previewing">
          {{ previewing ? t('preview.hide') : t('preview.show') }}
        </button>
        <template v-if="!readOnly">
          <template v-if="separateDrafts && live">
            <button v-if="pendingChanges" type="button" class="btn" :disabled="saving" @click="confirmingDiscard = true">{{ t('edit.discardChanges') }}</button>
            <button type="button" class="btn" :disabled="saving" @click="action('unpublish')">{{ t('edit.unpublish') }}</button>
          </template>
          <button v-if="global.drafts" type="button" class="btn" :disabled="saving" @click="save('draft')">{{ t('edit.saveDraft') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ !global.drafts ? t('edit.save') : pendingChanges ? t('edit.publishChanges') : t('edit.publish') }}
          </button>
        </template>
      </div>
    </header>
    <p v-if="readOnly" class="notice notice-warning">{{ t('edit.readOnly') }}</p>
    <div :class="['editor-body', side && `with-${side}`]">
      <div class="card form-body">
        <FieldList v-model="form" :fields="global.fields" :errors="errors" :read-only="readOnly" />
      </div>
      <LivePreview
        v-if="side === 'preview'"
        :path="`/globals/${slug}/preview`"
        :data="form"
        :global="slug"
        :query="localeQuery({ editing: true })"
      />
      <VersionHistory
        v-else-if="side === 'history'"
        :path="`/globals/${slug}`"
        :fields="global.fields"
        :drafts="global.drafts"
        :can-restore="!readOnly"
        :reload-key="historyKey"
        :query="localeQuery({ editing: true })"
        @restored="restored"
      />
    </div>
    <ConfirmDialog
      :open="confirmingDiscard"
      :message="t('edit.confirmDiscard')"
      :confirm-label="t('edit.discardChanges')"
      @confirm="action('discard-draft')"
      @cancel="confirmingDiscard = false"
    />
  </form>
</template>

<style scoped>
.editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.locale-switcher {
  margin-top: 0.5rem;
}
.meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.status {
  font-size: 0.875rem;
  font-weight: 550;
}
.status.success {
  color: var(--accent);
}
.status.error {
  color: var(--danger);
}
.editor-body.with-history {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  align-items: start;
  gap: 1rem;
}
.editor-body.with-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 1rem;
}
@media (max-width: 900px) {
  .editor-body.with-history,
  .editor-body.with-preview {
    grid-template-columns: 1fr;
  }
}
.form-body {
  padding: 1.5rem;
}
.notice-warning {
  margin-bottom: 1rem;
}
</style>
