<script setup lang="ts">
import { CalendarClock, ChevronLeft, Eye, EyeOff, Trash2 } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LivePreview from '../components/LivePreview.vue'
import LocaleSwitcher from '../components/LocaleSwitcher.vue'
import MediaThumb from '../components/MediaThumb.vue'
import ScheduleControl from '../components/ScheduleControl.vue'
import VersionHistory from '../components/VersionHistory.vue'
import FieldList from '../fields/FieldList.vue'
import { ApiError, api, type Doc } from '../lib/api'
import { contentLocale, localeQuery, setContentLocale } from '../lib/content-locale'
import { initialValues, snapshot, titleOf, toFormValues } from '../lib/fields'
import { formatBytes, formatDate, label, singularize, t } from '../lib/i18n'
import { findCollection, loadSession, session, setFlash, takeFlash } from '../lib/session'
import { showMessages } from '../lib/toast'

const route = useRoute()
const router = useRouter()
const slug = String(route.params.slug)
const id = route.params.id === undefined ? undefined : String(route.params.id)
const collection = findCollection(slug)
const isUsers = slug === 'users'
const isMedia = slug === 'media'
const published = computed(() => doc.value?.status === 'published')
// With versions and drafts, a draft of a published document is saved separately and the
// published version stays live until it is published again.
const separateDrafts = !!collection?.drafts && !!collection?.versions
const live = ref(false)
const pendingChanges = computed(() => separateDrafts && live.value && !published.value)
// What visitors see: with separate drafts the live version, otherwise the document's status.
const liveStatus = computed(() =>
  separateDrafts ? (live.value ? 'published' : 'draft') : (doc.value?.status ?? 'draft'),
)
const historyKey = ref(0)
const confirmingDiscard = ref(false)
const previewing = ref(false)
const scheduler = ref<InstanceType<typeof ScheduleControl>>()
// Side panel: live preview when open, otherwise history (both need edit rights).
const side = computed(() =>
  !collection || !canSave.value
    ? null
    : previewing.value
      ? 'preview'
      : collection.versions && id
        ? 'history'
        : null,
)

// The right-hand column: publishing and actions for a saved document, and its history.
const hasSidebar = computed(() => !!doc.value || side.value === 'history')

const form = ref<Record<string, unknown>>(collection ? initialValues(collection.fields) : {})
const password = ref('')
const doc = ref<Doc | null>(null)
const baseline = ref('')
const loading = ref(id !== undefined)
const saving = ref(false)
const errors = ref<Record<string, string[]>>({})
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
const notFound = ref(false)
const confirmingDelete = ref(false)
const flash = takeFlash()
if (flash) message.value = { kind: 'success', text: flash }
// Messages show as a toast (one at a time).
showMessages(message)

// Collection-level permissions say what is possible at all; for an existing document the
// server resolves document-level rules (e.g. "only your own") into exact answers.
const docPermissions = ref<{ update: boolean; delete: boolean } | null>(null)
const canSave = computed(
  () =>
    !!collection && (id ? (docPermissions.value?.update ?? false) : collection.permissions.create),
)
const canDelete = computed(() => !!id && (docPermissions.value?.delete ?? false))
const readOnly = computed(() => !canSave.value)
// Media file metadata is shown above; only editable fields go in the form.
const mediaFields = computed(() => collection?.fields.filter((f) => !f.readOnly) ?? [])
const dirty = computed(() => snapshot([form.value, password.value]) !== baseline.value)
const singular = computed(() =>
  collection ? label(collection.labels?.singular, singularize(collection.slug)) : '',
)
const heading = computed(() =>
  id
    ? titleOf(collection, { ...(doc.value ?? {}), ...form.value, id })
    : t('edit.create', { label: singular.value }),
)

// Clear a field's server error as soon as the user edits it.
watch(form, (next, prev) => {
  if (!prev || Object.keys(errors.value).length === 0) return
  const changed = Object.keys(next).filter((key) => snapshot(next[key]) !== snapshot(prev[key]))
  if (changed.length === 0) return
  errors.value = Object.fromEntries(
    Object.entries(errors.value).filter(
      ([path]) => !changed.some((key) => path === key || path.startsWith(`${key}.`)),
    ),
  )
  if (Object.keys(errors.value).length === 0 && message.value?.kind === 'error')
    message.value = null
})
watch(password, () => {
  if (errors.value.password) {
    const { password: _, ...rest } = errors.value
    errors.value = rest
  }
})

function reset(values: Record<string, unknown>) {
  form.value = values
  password.value = ''
  baseline.value = snapshot([values, ''])
}

// Localized fields are edited one content language at a time.
const localized = computed(() => !!contentLocale() && hasLocalized(collection?.fields ?? []))
function hasLocalized(fields: readonly { localized?: boolean; fields?: unknown }[]): boolean {
  return fields.some(
    (f) => f.localized || (Array.isArray(f.fields) && hasLocalized(f.fields as typeof fields)),
  )
}

async function switchLocale(next: string) {
  if (dirty.value && !window.confirm(t('locale.switchUnsaved'))) return
  setContentLocale(next)
  message.value = null
  errors.value = {}
  if (id) await load()
}

onMounted(() => load())

async function load() {
  if (!collection) return
  if (!id) {
    reset(initialValues(collection.fields))
    return
  }
  try {
    const [loaded, permissions] = await Promise.all([
      api<Doc>(
        'GET',
        `/${slug}/${encodeURIComponent(id)}?depth=0&draft=true${localeQuery({ editing: true })}`,
      ),
      api<{ update: boolean; delete: boolean }>(
        'GET',
        `/admin/access/${slug}/${encodeURIComponent(id)}`,
      ),
    ])
    doc.value = loaded
    docPermissions.value = permissions
    live.value = separateDrafts ? await isLive() : loaded.status === 'published'
    reset(toFormValues(collection.fields, loaded))
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else
      message.value = { kind: 'error', text: t('common.error', { message: (e as Error).message }) }
  } finally {
    loading.value = false
  }
}

/** Whether a published version is on the site (the draft we edit may be newer). */
async function isLive(): Promise<boolean> {
  try {
    const current = await api<Doc>('GET', `/${slug}/${encodeURIComponent(String(id))}?depth=0`)
    return current.status === 'published'
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return false
    throw e
  }
}

/** Shows a document returned by an action (unpublish, discard, restore). */
function show(saved: Doc, text: string) {
  if (!collection) return
  doc.value = saved
  reset(toFormValues(collection.fields, saved))
  historyKey.value += 1
  message.value = { kind: 'success', text }
}

async function action(path: 'unpublish' | 'discard-draft') {
  confirmingDiscard.value = false
  saving.value = true
  message.value = null
  try {
    const saved = await api<Doc>(
      'POST',
      `/${slug}/${encodeURIComponent(String(id))}/${path}?depth=0${localeQuery({ editing: true })}`,
    )
    if (path === 'unpublish') live.value = false
    show(saved, t(path === 'unpublish' ? 'edit.unpublished' : 'edit.discarded'))
  } catch (e) {
    message.value = {
      kind: 'error',
      text:
        e instanceof ApiError && e.status === 403 ? t('common.forbidden') : (e as Error).message,
    }
  } finally {
    saving.value = false
  }
}

async function save(status?: 'draft' | 'published') {
  if (!collection) return
  saving.value = true
  errors.value = {}
  message.value = null
  const wasPublished = published.value
  const body: Record<string, unknown> = { ...form.value }
  if (status) body.status = status
  if (isUsers && password.value) body.password = password.value
  try {
    const saved = id
      ? await api<Doc>(
          'PATCH',
          `/${slug}/${encodeURIComponent(id)}?depth=0${localeQuery({ editing: true })}`,
          body,
        )
      : await api<Doc>('POST', `/${slug}?depth=0${localeQuery({ editing: true })}`, body)
    doc.value = saved
    reset(toFormValues(collection.fields, saved))
    historyKey.value += 1
    if (status === 'published') live.value = true
    const text = !id
      ? t('edit.created')
      : separateDrafts && live.value && status === 'draft'
        ? t('edit.draftSaved')
        : wasPublished && status === 'draft'
          ? t('edit.unpublished')
          : t('edit.saved')
    message.value = { kind: 'success', text }
    // Editing yourself may change what you can do (role, name shown in the sidebar).
    if (isUsers && String(saved.id) === String(session.user?.id)) await loadSession()
    if (!id) {
      setFlash(t('edit.created'))
      await router.replace(`/collections/${slug}/${saved.id}`)
    }
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      message.value = {
        kind: 'error',
        text: Object.keys(errors.value).length
          ? t('edit.fixErrors')
          : e.status === 403
            ? t('common.forbidden')
            : e.message,
      }
    } else {
      message.value = { kind: 'error', text: String(e) }
    }
  } finally {
    saving.value = false
  }
}

async function remove() {
  confirmingDelete.value = false
  try {
    await api('DELETE', `/${slug}/${encodeURIComponent(String(id))}`)
    baseline.value = snapshot([form.value, password.value])
    await router.push(`/collections/${slug}`)
  } catch (e) {
    message.value = {
      kind: 'error',
      text:
        e instanceof ApiError && e.status === 403 ? t('common.forbidden') : (e as Error).message,
    }
  }
}

// Warn before losing unsaved changes (FR-ADM-08).
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(() => (dirty.value && !saving.value ? window.confirm(t('edit.unsaved')) : true))
</script>

<template>
  <p v-if="!collection || notFound" class="notice">
    {{ notFound ? t('edit.notFound') : t('common.notFound') }}
    <RouterLink :to="`/collections/${slug}`">{{ t('common.back') }}</RouterLink>
  </p>
  <p v-else-if="loading" class="muted">{{ t('common.loading') }}</p>
  <form v-else class="editor" novalidate @submit.prevent="save(collection.drafts ? 'published' : undefined)">
    <header class="editor-header">
      <div class="title-block">
        <RouterLink :to="`/collections/${slug}`" class="back">
          <ChevronLeft :size="16" aria-hidden="true" />
          {{ label(collection.labels?.plural, collection.slug) }}
        </RouterLink>
        <div class="title-row">
          <h1>{{ heading }}</h1>
          <span v-if="doc && collection.drafts" :class="['badge', `badge-${liveStatus}`]">
            {{ t(liveStatus === 'published' ? 'status.published' : 'status.draft') }}
          </span>
          <span v-if="pendingChanges" class="badge badge-changed">{{ t('status.changed') }}</span>
          <span v-if="dirty && canSave" class="unsaved">
            <span class="dot" aria-hidden="true" />{{ t('edit.unsavedChanges') }}
          </span>
        </div>
      </div>
      <div class="actions">
        <LocaleSwitcher v-if="localized" @change="switchLocale" />
        <button v-if="collection.preview && canSave" type="button" class="btn" :aria-pressed="previewing" @click="previewing = !previewing">
          <component :is="previewing ? EyeOff : Eye" :size="16" aria-hidden="true" />
          {{ previewing ? t('preview.hide') : t('preview.show') }}
        </button>
        <template v-if="canSave">
          <!-- Separate drafts: the live version changes only on Publish (FR-VER-04). -->
          <template v-if="separateDrafts && live">
            <button type="button" class="btn" :disabled="saving" @click="save('draft')">{{ t('edit.saveDraft') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ pendingChanges ? t('edit.publishChanges') : t('edit.publish') }}</button>
          </template>
          <!-- A published document stays published on save; unpublishing is explicit (FR-DRF-05). -->
          <template v-else-if="collection.drafts && published">
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ t('edit.save') }}</button>
          </template>
          <template v-else-if="collection.drafts">
            <button type="button" class="btn" :disabled="saving" @click="save('draft')">{{ t('edit.saveDraft') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ t('edit.publish') }}</button>
          </template>
          <button v-else type="submit" class="btn btn-primary" :disabled="saving">{{ t('edit.save') }}</button>
        </template>
      </div>
    </header>

    <p v-if="readOnly" class="notice notice-warning">{{ t('edit.readOnly') }}</p>

    <div :class="['editor-body', side === 'preview' ? 'with-preview' : hasSidebar && 'with-sidebar']">
      <div class="card form-body">
        <template v-if="isMedia && doc">
          <MediaThumb :media="doc" size="large" />
          <p class="muted media-meta">
            <a :href="String(doc.url)" target="_blank" rel="noopener">{{ doc.filename }}</a>
            · {{ doc.mimeType }}
            <template v-if="doc.width">· {{ t('media.size', { width: String(doc.width), height: String(doc.height), size: formatBytes(doc.filesize) }) }}</template>
            <template v-else>· {{ formatBytes(doc.filesize) }}</template>
          </p>
        </template>
        <FieldList v-model="form" :fields="isMedia ? mediaFields : collection.fields" :errors="errors" :read-only="readOnly" />
        <label v-if="isUsers && canSave" class="field">
          <span class="field-label">
            {{ id ? t('edit.newPassword') : t('edit.password') }}<span v-if="!id" class="field-required" aria-hidden="true">*</span>
          </span>
          <input
            v-model="password"
            class="input"
            type="password"
            autocomplete="new-password"
            :aria-invalid="!!errors.password"
            aria-describedby="password-error"
          />
          <span v-for="m in errors.password" id="password-error" :key="m" class="field-error">{{ m }}</span>
        </label>
      </div>

      <LivePreview
        v-if="side === 'preview'"
        :path="id ? `/${slug}/${encodeURIComponent(id)}/preview` : `/${slug}/preview`"
        :data="form"
        :collection="slug"
        :query="localeQuery({ editing: true })"
      />
      <aside v-else-if="hasSidebar" class="sidebar">
        <section v-if="doc" class="card side-card" :aria-label="collection.drafts ? t('edit.publishing') : t('edit.manage')">
          <h2>{{ collection.drafts ? t('edit.publishing') : t('edit.manage') }}</h2>
          <dl class="facts">
            <div v-if="collection.drafts">
              <dt>{{ t('edit.onSite') }}</dt>
              <dd>
                <span :class="['badge', `badge-${liveStatus}`]">
                  {{ t(liveStatus === 'published' ? 'status.published' : 'status.draft') }}
                </span>
              </dd>
            </div>
            <div>
              <dt>{{ t('edit.lastSaved') }}</dt>
              <dd>{{ formatDate(doc.updatedAt) }}</dd>
            </div>
          </dl>
          <ScheduleControl
            v-if="collection.schedule && id && canSave"
            ref="scheduler"
            :path="`/${slug}/${encodeURIComponent(id)}`"
            :reload-key="historyKey"
          />
          <div v-if="canSave || canDelete" class="side-actions">
            <button v-if="collection.schedule && id && canSave" type="button" class="btn btn-sm" @click="scheduler?.open()">
              <CalendarClock :size="15" aria-hidden="true" />
              {{ t('schedule.button') }}
            </button>
            <template v-if="canSave && separateDrafts && live">
              <button v-if="pendingChanges" type="button" class="btn btn-sm" :disabled="saving" @click="confirmingDiscard = true">{{ t('edit.discardChanges') }}</button>
              <button type="button" class="btn btn-sm" :disabled="saving" @click="action('unpublish')">{{ t('edit.unpublish') }}</button>
            </template>
            <button
              v-else-if="canSave && collection.drafts && published"
              type="button"
              class="btn btn-sm"
              :disabled="saving"
              @click="save('draft')"
            >
              {{ t('edit.unpublish') }}
            </button>
            <button v-if="canDelete" type="button" class="btn btn-sm btn-danger" @click="confirmingDelete = true">
              <Trash2 :size="15" aria-hidden="true" />
              {{ t('edit.delete') }}
            </button>
          </div>
        </section>
        <VersionHistory
          v-if="side === 'history' && id"
          :path="`/${slug}/${encodeURIComponent(id)}`"
          :fields="collection.fields"
          :drafts="collection.drafts"
          :can-restore="canSave"
          :reload-key="historyKey"
          :query="localeQuery({ editing: true })"
          @restored="(d) => show(d as Doc, t('history.restored'))"
        />
      </aside>
    </div>

    <ConfirmDialog
      :open="confirmingDiscard"
      :message="t('edit.confirmDiscard')"
      :confirm-label="t('edit.discardChanges')"
      @confirm="action('discard-draft')"
      @cancel="confirmingDiscard = false"
    />
    <ConfirmDialog
      :open="confirmingDelete"
      :message="t('edit.confirmDelete')"
      :confirm-label="t('edit.delete')"
      @confirm="remove"
      @cancel="confirmingDelete = false"
    />
  </form>
</template>

<style scoped>
.editor-header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  padding: 0.75rem 0 1rem;
  margin-top: -0.75rem;
  background: var(--bg);
}
.title-block {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  align-self: flex-start;
  margin-left: -0.2rem;
  color: var(--faint);
  font-size: 0.85rem;
  text-decoration: none;
}
.back:hover {
  color: var(--text);
}
.title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  min-width: 0;
}
.title-row h1 {
  overflow-wrap: anywhere;
}
.unsaved {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--warning-text);
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
.editor-body.with-sidebar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 19rem;
  align-items: start;
  gap: 1.25rem;
}
.editor-body.with-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 1.25rem;
}
.sidebar {
  position: sticky;
  top: 5.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.side-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
}
.side-card h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}
.facts {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  font-size: 0.875rem;
}
.facts div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.facts dt {
  color: var(--text-muted);
}
.facts dd {
  margin: 0;
  text-align: right;
}
.side-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}
.side-actions .btn {
  flex: 1 1 auto;
}
@media (max-width: 1100px) {
  .editor-body.with-sidebar,
  .editor-body.with-preview {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: static;
  }
}
.form-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
}
.notice-warning {
  margin-bottom: 1rem;
}
.media-meta {
  margin: -0.5rem 0 0;
  font-size: 0.85rem;
}
</style>
