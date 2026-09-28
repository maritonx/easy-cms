<script setup lang="ts">
import { CalendarClock, Eye, EyeOff } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LivePreview from '../components/LivePreview.vue'
import LocaleSwitcher from '../components/LocaleSwitcher.vue'
import PluginElement from '../components/PluginElement.vue'
import ScheduleControl from '../components/ScheduleControl.vue'
import VersionHistory from '../components/VersionHistory.vue'
import FieldList from '../fields/FieldList.vue'
import { ApiError, api } from '../lib/api'
import { contentLocale, localeQuery, setContentLocale } from '../lib/content-locale'
import { snapshot, toFormValues } from '../lib/fields'
import { formatDate, label, t } from '../lib/i18n'
import { FORM, setPath } from '../lib/plugins'
import { findGlobal, session } from '../lib/session'
import { showMessages } from '../lib/toast'
import { missingLocales } from '../lib/translation'

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
// Messages show as a toast (one at a time).
showMessages(message)
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
const scheduler = ref<InstanceType<typeof ScheduleControl>>()
/** Fields in the side panel (`position: 'sidebar'`), and the rest in the main form. */
const sideFields = computed(() => global?.fields.filter((f) => f.position === 'sidebar') ?? [])
const mainFields = computed(() => global?.fields.filter((f) => f.position !== 'sidebar') ?? [])
function undoChanges() {
  form.value = JSON.parse(baseline.value) as Data
}
// Components from admin modules read the form and may set any field.
provide(FORM, {
  doc: form,
  setField: (path, value) => {
    form.value = setPath(form.value, path, value)
  },
  global: slug,
  id: computed(() => null),
})
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

// Languages this document still needs translating into (dots on the language buttons).
const untranslated = ref<string[]>([])
async function refreshTranslations() {
  const localization = session.schema?.localization
  if (!localization || !localized.value || !true) {
    untranslated.value = []
    return
  }
  try {
    const all = await api<Data>('GET', `/globals/${slug}?depth=0&draft=true&locale=all`)
    untranslated.value = missingLocales(
      global?.fields ?? [],
      all,
      localization.locales,
      localization.defaultLocale,
    )
  } catch {
    untranslated.value = []
  }
}

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
    void refreshTranslations()
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
    void refreshTranslations()
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
    void refreshTranslations()
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
  void refreshTranslations()
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
      <div class="title-row">
        <h1>{{ label(global.label, global.slug) }}</h1>
        <span v-if="meta.updatedAt && global.drafts" :class="['badge', `badge-${liveStatus}`]">
          {{ t(liveStatus === 'published' ? 'status.published' : 'status.draft') }}
        </span>
        <span v-if="pendingChanges" class="badge badge-changed">{{ t('status.changed') }}</span>
      </div>
      <div class="actions">
        <LocaleSwitcher v-if="localized" :missing="untranslated" @change="switchLocale" />
        <button v-if="global.preview && !readOnly" type="button" class="btn" :aria-pressed="previewing" @click="previewing = !previewing">
          <component :is="previewing ? EyeOff : Eye" :size="16" aria-hidden="true" />
          {{ previewing ? t('preview.hide') : t('preview.show') }}
        </button>
        <template v-if="!readOnly">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ !global.drafts ? t('edit.save') : pendingChanges ? t('edit.publishChanges') : t('edit.publish') }}
          </button>
        </template>
      </div>
    </header>
    <p v-if="readOnly" class="notice notice-warning">{{ t('edit.readOnly') }}</p>
    <div :class="['editor-body', side === 'preview' ? 'with-preview' : 'with-sidebar']">
      <div class="form-body">
        <FieldList v-model="form" :fields="mainFields" :errors="errors" :read-only="readOnly" />
      </div>
      <LivePreview
        v-if="side === 'preview'"
        :path="`/globals/${slug}/preview`"
        :data="form"
        :global="slug"
        :query="localeQuery({ editing: true })"
      />
      <aside v-else class="sidebar">
        <section class="card side-card" :aria-label="global.drafts ? t('edit.publishing') : t('edit.manage')">
          <h2>{{ global.drafts ? t('edit.publishing') : t('edit.manage') }}</h2>
          <dl class="facts">
            <div v-if="global.drafts">
              <dt>{{ t('edit.onSite') }}</dt>
              <dd>
                <span :class="['badge', `badge-${liveStatus}`]">
                  {{ t(liveStatus === 'published' ? 'status.published' : 'status.draft') }}
                </span>
              </dd>
            </div>
            <div>
              <dt>{{ t('edit.lastSaved') }}</dt>
              <dd>{{ meta.updatedAt ? formatDate(meta.updatedAt) : '—' }}</dd>
            </div>
          </dl>
          <ScheduleControl
            v-if="global.schedule && !readOnly"
            ref="scheduler"
            :path="`/globals/${slug}`"
            :reload-key="historyKey"
          />
          <div v-if="!readOnly && (global.schedule || (separateDrafts && live))" class="side-actions">
            <button v-if="global.schedule" type="button" class="btn btn-sm" @click="scheduler?.open()">
              <CalendarClock :size="15" aria-hidden="true" />
              {{ t('schedule.button') }}
            </button>
            <template v-if="separateDrafts && live">
              <button v-if="pendingChanges" type="button" class="btn btn-sm" :disabled="saving" @click="confirmingDiscard = true">{{ t('edit.discardChanges') }}</button>
              <button type="button" class="btn btn-sm" :disabled="saving" @click="action('unpublish')">{{ t('edit.unpublish') }}</button>
            </template>
          </div>
        </section>
        <section v-if="sideFields.length" class="card side-card" :aria-label="t('edit.details')">
          <h2>{{ t('edit.details') }}</h2>
          <FieldList v-model="form" :fields="sideFields" :errors="errors" :read-only="readOnly" />
        </section>
        <section v-for="(panel, i) in global.sidebar ?? []" :key="`${i}-${panel.tag}`" class="card side-card">
          <PluginElement :component="panel" :read-only="readOnly" />
        </section>
        <VersionHistory
          v-if="side === 'history'"
          :path="`/globals/${slug}`"
          :fields="global.fields"
          :drafts="global.drafts"
          :can-restore="!readOnly"
          :reload-key="historyKey"
          :query="localeQuery({ editing: true })"
          @restored="restored"
        />
      </aside>
    </div>
    <footer v-if="!readOnly" class="save-bar">
      <span class="save-state">
        <template v-if="dirty"><span class="dot" aria-hidden="true" />{{ t('edit.unsavedChanges') }}</template>
        <template v-else-if="meta.updatedAt">{{ t('edit.savedAt', { date: formatDate(meta.updatedAt) }) }}</template>
        <template v-else>{{ t('edit.notSaved') }}</template>
      </span>
      <div class="save-actions">
        <button v-if="dirty" type="button" class="btn btn-ghost" :disabled="saving" @click="undoChanges">{{ t('edit.undoChanges') }}</button>
        <button v-if="global.drafts" type="button" class="btn" :disabled="saving" @click="save('draft')">{{ t('edit.saveDraft') }}</button>
      </div>
    </footer>
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
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin: calc(-1 * var(--page-top)) calc(-1 * var(--page-x)) 1.75rem;
  padding: 0.85rem var(--page-x);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.editor-header h1 {
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0;
}
form {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--page-top) - var(--page-bottom));
}
.editor-body {
  margin-bottom: 2rem;
}
.save-bar {
  margin-top: auto !important;
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 2rem calc(-1 * var(--page-x)) calc(-1 * var(--page-bottom));
  padding: 0.75rem var(--page-x);
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.save-state {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
}
.save-actions {
  display: flex;
  gap: 0.5rem;
}
@media (max-width: 900px) {
  .editor-header {
    position: static;
  }
}
.title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  min-width: 0;
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
  grid-template-columns: minmax(0, 1fr) 21rem;
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
  top: 5rem;
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
  max-width: 54rem;
  min-width: 0;
}
.notice-warning {
  margin-bottom: 1rem;
}
</style>
