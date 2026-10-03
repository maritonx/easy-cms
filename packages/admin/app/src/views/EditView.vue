<script setup lang="ts">
import { CalendarClock, ChevronDown, ChevronLeft, Eye, EyeOff, Link2, Trash2 } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ApiKeyCreated from '../components/ApiKeyCreated.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LivePreview from '../components/LivePreview.vue'
import LocaleSwitcher from '../components/LocaleSwitcher.vue'
import MediaThumb from '../components/MediaThumb.vue'
import PluginElement from '../components/PluginElement.vue'
import ScheduleControl from '../components/ScheduleControl.vue'
import VersionHistory from '../components/VersionHistory.vue'
import FieldList from '../fields/FieldList.vue'
import { ApiError, api, type Doc } from '../lib/api'
import { contentLocale, localeQuery, setContentLocale } from '../lib/content-locale'
import { initialValues, snapshot, titleOf, toFormValues } from '../lib/fields'
import { formatBytes, formatDate, label, singularize, t } from '../lib/i18n'
import { FORM, setPath } from '../lib/plugins'
import { findCollection, loadSession, session, setFlash, takeFlash } from '../lib/session'
import { notify, showMessages } from '../lib/toast'
import { missingLocales } from '../lib/translation'

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
const hasSidebar = computed(
  () =>
    !!doc.value ||
    side.value === 'history' ||
    sideFields.value.length > 0 ||
    (collection?.sidebar?.length ?? 0) > 0,
)

const form = ref<Record<string, unknown>>(collection ? initialValues(collection.fields) : {})
const password = ref('')
// Admins can email a link to set the password instead (needs email in the CMS config).
const canSendLink = computed(
  () => isUsers && session.schema?.passwordLinks === true && session.user?.role === 'admin',
)
const sendingLink = ref(false)
/** Emails the user a link to set their password: an invitation, or a reset link. */
async function sendPasswordLink(
  userId: string | number,
  email: string,
): Promise<'invite' | 'reset' | null> {
  sendingLink.value = true
  try {
    const { sent } = await api<{ sent: 'invite' | 'reset' }>(
      'POST',
      `/users/${encodeURIComponent(String(userId))}/password-link`,
      { locale: session.schema?.locale },
    )
    notify('success', t(sent === 'invite' ? 'users.inviteSent' : 'users.resetSent', { email }))
    return sent
  } catch (e) {
    notify('error', (e as Error).message)
    return null
  } finally {
    sendingLink.value = false
  }
}
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

// The title field is the page's big heading input, and a slug made from it sits right below.
const titleField = computed(() => {
  const field = collection?.fields.find((f) => f.name === collection.useAsTitle)
  return !isMedia && field?.type === 'text' && !field.readOnly ? field : undefined
})
const slugField = computed(() =>
  titleField.value
    ? collection?.fields.find((f) => f.type === 'slug' && f.from === titleField.value?.name)
    : undefined,
)
/** Fields in the side panel (`position: 'sidebar'`). */
const sideFields = computed(() => collection?.fields.filter((f) => f.position === 'sidebar') ?? [])
/** Everything else, in the main form. */
const mainFields = computed(() =>
  (isMedia ? mediaFields.value : (collection?.fields ?? [])).filter(
    (f) => f !== titleField.value && f !== slugField.value && f.position !== 'sidebar',
  ),
)
// Components from admin modules read the form and may set any field.
provide(FORM, {
  doc: form,
  setField: (path, value) => {
    form.value = setPath(form.value, path, value)
  },
  collection: slug,
  id: computed(() => id ?? null),
})
const splitOpen = ref(false)
const newKey = ref<{ key: string; id: string | number } | null>(null)
async function closeNewKey() {
  const created = newKey.value
  newKey.value = null
  if (created) await router.replace(`/collections/${slug}/${created.id}`)
}
/** Replaces the form (like FieldList does), so watchers see the change. */
function setField(name: string, value: string) {
  form.value = { ...form.value, [name]: value }
}
function undoChanges() {
  const [values, pw] = JSON.parse(baseline.value) as [Record<string, unknown>, string]
  form.value = values
  password.value = pw
}
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

// Languages this document still needs translating into (dots on the language buttons).
const untranslated = ref<string[]>([])
async function refreshTranslations() {
  const localization = session.schema?.localization
  if (!localization || !localized.value || !id) {
    untranslated.value = []
    return
  }
  try {
    const all = await api<Doc>(
      'GET',
      `/${slug}/${encodeURIComponent(String(id))}?depth=0&draft=true&locale=all`,
    )
    untranslated.value = missingLocales(
      collection?.fields ?? [],
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
    void refreshTranslations()
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
  void refreshTranslations()
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
  // Without email, a new user needs a password: there is no invitation to set one.
  if (isUsers && !id && !password.value && !canSendLink.value) {
    errors.value = { password: [t('users.passwordRequired')] }
    saving.value = false
    return
  }
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
    void refreshTranslations()
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
    // A new user without a password gets an invitation to set one.
    const invited =
      !id && isUsers && !password.value && canSendLink.value
        ? (await sendPasswordLink(saved.id, String(saved.email))) === 'invite'
        : false
    if (!id) {
      setFlash(
        invited ? t('users.createdInvited', { email: String(saved.email) }) : t('edit.created'),
      )
      // A new API key is shown once; go to its page when the dialog is closed.
      if (typeof saved.key === 'string') newKey.value = { key: saved.key, id: saved.id }
      else await router.replace(`/collections/${slug}/${saved.id}`)
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
        <RouterLink :to="`/collections/${slug}`" class="btn btn-ghost btn-sm btn-icon back" :aria-label="label(collection.labels?.plural, collection.slug)">
          <ChevronLeft :size="18" aria-hidden="true" />
        </RouterLink>
        <div class="title-text">
          <span class="crumb">{{ label(collection.labels?.plural, collection.slug) }}</span>
          <div class="title-row">
            <h1>{{ heading }}</h1>
            <span v-if="doc && collection.drafts" :class="['badge', `badge-${liveStatus}`]">
              {{ t(liveStatus === 'published' ? 'status.published' : 'status.draft') }}
            </span>
            <span v-if="pendingChanges" class="badge badge-changed">{{ t('status.changed') }}</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <LocaleSwitcher v-if="localized" :missing="untranslated" @change="switchLocale" />
        <button v-if="collection.preview && canSave" type="button" class="btn" :aria-pressed="previewing" @click="previewing = !previewing">
          <component :is="previewing ? EyeOff : Eye" :size="16" aria-hidden="true" />
          {{ previewing ? t('preview.hide') : t('preview.show') }}
        </button>
        <div v-if="canSave" class="split">
          <button type="submit" class="btn btn-primary" :class="{ 'split-main': collection.schedule && id }" :disabled="saving">
            {{
              collection.drafts && !published
                ? pendingChanges
                  ? t('edit.publishChanges')
                  : t('edit.publish')
                : separateDrafts && live
                  ? t('edit.publish')
                  : t('edit.save')
            }}
          </button>
          <button
            v-if="collection.schedule && id"
            type="button"
            class="btn btn-primary btn-icon split-toggle"
            :aria-label="t('edit.publishOptions')"
            :aria-expanded="splitOpen"
            aria-haspopup="menu"
            @click="splitOpen = !splitOpen"
          >
            <ChevronDown :size="16" aria-hidden="true" />
          </button>
          <div v-if="splitOpen" class="split-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              @click="
                splitOpen = false;
                scheduler?.open()
              "
            >
              <CalendarClock :size="15" aria-hidden="true" />
              {{ t('schedule.button') }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <p v-if="readOnly" class="notice notice-warning">{{ t('edit.readOnly') }}</p>

    <div :class="['editor-body', side === 'preview' ? 'with-preview' : hasSidebar && 'with-sidebar']">
      <div class="form-body">
        <div v-if="titleField" class="title-field">
          <label class="visually-hidden" for="doc-title">{{ label(titleField.label, titleField.name) }}</label>
          <input
            id="doc-title"
            :value="form[titleField.name] ?? ''"
            class="title-input"
            type="text"
            :maxlength="titleField.maxLength"
            :placeholder="label(titleField.label, titleField.name)"
            :aria-invalid="!!errors[titleField.name]"
            :aria-describedby="errors[titleField.name] ? 'doc-title-error' : undefined"
            :readonly="readOnly"
            @input="setField(titleField.name, ($event.target as HTMLInputElement).value)"
          />
          <p v-for="m in errors[titleField.name]" id="doc-title-error" :key="m" class="field-error">{{ m }}</p>
          <div v-if="slugField" class="slug-row">
            <Link2 :size="14" aria-hidden="true" />
            <label class="visually-hidden" for="doc-slug">{{ label(slugField.label, slugField.name) }}</label>
            <span aria-hidden="true">/</span>
            <input
              id="doc-slug"
              :value="form[slugField.name] ?? ''"
              class="slug-input"
              type="text"
              :placeholder="t('field.slugAuto')"
              :aria-invalid="!!errors[slugField.name]"
              :readonly="readOnly || slugField.readOnly"
              @input="setField(slugField.name, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <p v-for="m in slugField ? errors[slugField.name] : []" :key="m" class="field-error">{{ m }}</p>
        </div>
        <template v-if="isMedia && doc">
          <MediaThumb :media="doc" size="large" />
          <p class="muted media-meta">
            <a :href="String(doc.url)" target="_blank" rel="noopener">{{ doc.filename }}</a>
            · {{ doc.mimeType }}
            <template v-if="doc.width">· {{ t('media.size', { width: String(doc.width), height: String(doc.height), size: formatBytes(doc.filesize) }) }}</template>
            <template v-else>· {{ formatBytes(doc.filesize) }}</template>
          </p>
        </template>
        <FieldList v-model="form" :fields="mainFields" :errors="errors" :read-only="readOnly" />
        <label v-if="isUsers && canSave" class="field">
          <span class="field-label">
            {{ id ? t('edit.newPassword') : t('edit.password') }}<span v-if="!id && !canSendLink" class="field-required" aria-hidden="true">*</span>
          </span>
          <input
            v-model="password"
            class="input"
            type="password"
            autocomplete="new-password"
            :aria-invalid="!!errors.password"
            :aria-describedby="!id && canSendLink ? 'password-error password-hint' : 'password-error'"
          />
          <span v-for="m in errors.password" id="password-error" :key="m" class="field-error">{{ m }}</span>
        </label>
        <p v-if="isUsers && canSave && !id && canSendLink" id="password-hint" class="field-hint">{{ t('users.inviteHint') }}</p>
        <div v-if="id && canSendLink" class="password-link">
          <button
            type="button"
            class="btn btn-sm"
            :disabled="sendingLink"
            @click="sendPasswordLink(id, String(form.email ?? ''))"
          >
            {{ t('users.sendLink') }}
          </button>
          <span class="field-hint">{{ t('users.sendLinkHint') }}</span>
        </div>
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
        <section v-if="sideFields.length" class="card side-card" :aria-label="t('edit.details')">
          <h2>{{ t('edit.details') }}</h2>
          <FieldList v-model="form" :fields="sideFields" :errors="errors" :read-only="readOnly" />
        </section>
        <section v-for="(panel, i) in collection.sidebar ?? []" :key="`${i}-${panel.tag}`" class="card side-card">
          <PluginElement :component="panel" :read-only="readOnly" />
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

    <footer v-if="canSave" class="save-bar">
      <span class="save-state">
        <template v-if="dirty"><span class="dot" aria-hidden="true" />{{ t('edit.unsavedChanges') }}</template>
        <template v-else-if="doc">{{ t('edit.savedAt', { date: formatDate(doc.updatedAt) }) }}</template>
        <template v-else>{{ t('edit.notSaved') }}</template>
      </span>
      <div class="save-actions">
        <button v-if="dirty && id" type="button" class="btn btn-ghost" :disabled="saving" @click="undoChanges">{{ t('edit.undoChanges') }}</button>
        <button
          v-if="collection.drafts && (!published || (separateDrafts && live))"
          type="button"
          class="btn"
          :disabled="saving"
          @click="save('draft')"
        >
          {{ t('edit.saveDraft') }}
        </button>
      </div>
    </footer>

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
  <ApiKeyCreated v-if="newKey" :api-key="newKey.key" @close="closeNewKey" />
</template>

<style scoped>
/* A bar across the page: offsets the content padding (--page-x / --page-top). */
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
.title-block {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.back {
  margin-left: -0.4rem;
}
.title-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.crumb {
  color: var(--faint);
  font-size: 0.85rem;
}
.title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  min-width: 0;
}
.title-row h1 {
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 36rem;
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
.split {
  position: relative;
  display: inline-flex;
}
.split-main {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.split-toggle {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: 1px solid color-mix(in srgb, var(--accent-text) 25%, transparent);
  width: 2.4rem;
}
.split-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 10;
  min-width: 11rem;
  padding: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.split-menu button {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.25rem;
  padding: 0 0.6rem;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.split-menu button:hover {
  background: var(--surface-2);
}
.editor-body.with-sidebar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 21rem;
  align-items: start;
  gap: 2rem;
}
.editor-body.with-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 1.5rem;
}
.form-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 54rem;
  min-width: 0;
}
.title-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.title-input {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 2.15rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  outline: none;
}
.title-input::placeholder {
  color: var(--faint);
}
.title-input[aria-invalid="true"] {
  text-decoration: underline wavy var(--danger);
  text-underline-offset: 6px;
}
.slug-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--faint);
  font-size: 0.9rem;
}
.slug-input {
  flex: 1;
  min-width: 8rem;
  padding: 0.15rem 0.35rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-weight: 500;
}
.slug-input:hover {
  border-color: var(--border);
}
.slug-input:focus {
  outline: none;
  border-color: var(--focus);
  background: var(--surface);
}
.sidebar {
  position: sticky;
  top: 6rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.side-card {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.1rem;
}
.side-card h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}
.facts {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin: 0;
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
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
}
.side-actions .btn {
  flex: 1 1 auto;
}
/* The form fills the screen, so the save bar sits at the bottom even on short pages. */
form {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--page-top) - var(--page-bottom));
}
.editor-body {
  margin-bottom: 2rem;
}
/* Pinned to the bottom of the screen, across the page. */
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
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--warning-text);
}
.save-actions {
  display: flex;
  gap: 0.5rem;
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
@media (max-width: 900px) {
  /* The app's top bar is sticky there; keep this bar in the flow. */
  .editor-header {
    position: static;
  }
  .title-input {
    font-size: 1.6rem;
  }
}
.notice-warning {
  margin-bottom: 1rem;
}
.media-meta {
  margin: -0.5rem 0 0;
  font-size: 0.85rem;
}
.password-link {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}
</style>
