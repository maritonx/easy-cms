<script setup lang="ts">
import { Maximize2, Trash2, X } from '@lucide/vue'
import { computed, onMounted, ref, useId } from 'vue'
import FieldList from '../fields/FieldList.vue'
import { ApiError, api, type Doc } from '../lib/api'
import { contentLocale, localeQuery, setContentLocale } from '../lib/content-locale'
import { initialValues, snapshot, titleOf, toFormValues } from '../lib/fields'
import { label, singularize, t } from '../lib/i18n'
import { findCollection, session } from '../lib/session'
import { notify } from '../lib/toast'
import { missingLocales } from '../lib/translation'
import ConfirmDialog from './ConfirmDialog.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'

/**
 * Creates or edits one document in a panel over the page: from a list of a small collection
 * (`editIn: 'drawer'`), or from a relationship field to create what it should point to.
 */
const props = defineProps<{
  slug: string
  /** `null` creates a new document. */
  id: string | null
  /** Starting values for a new document, e.g. the title typed in a relationship field. */
  initial?: Record<string, unknown> | undefined
}>()
const emit = defineEmits<{
  saved: [doc: Doc, created: boolean]
  deleted: []
  close: []
}>()

const collection = findCollection(props.slug)
const isUsers = props.slug === 'users'
const headingId = useId()
const dialog = ref<HTMLDialogElement>()

const form = ref<Record<string, unknown>>({})
const password = ref('')
const doc = ref<Doc | null>(null)
const baseline = ref('')
const loading = ref(props.id !== null)
const saving = ref(false)
const errors = ref<Record<string, string[]>>({})
const permissions = ref<{ update: boolean; delete: boolean } | null>(null)
const confirmingDelete = ref(false)

const canSave = computed(() =>
  props.id === null ? !!collection?.permissions.create : (permissions.value?.update ?? false),
)
const canDelete = computed(() => props.id !== null && (permissions.value?.delete ?? false))
const dirty = computed(() => snapshot([form.value, password.value]) !== baseline.value)
const singular = computed(() =>
  collection ? label(collection.labels?.singular, singularize(collection.slug)) : '',
)
const heading = computed(() =>
  props.id === null
    ? t('edit.create', { label: singular.value })
    : titleOf(collection, { ...(doc.value ?? {}), ...form.value, id: props.id }),
)
const localized = computed(
  () => !!contentLocale() && (collection?.fields.some((f) => f.localized) ?? false),
)
const fullPage = computed(() => `/collections/${props.slug}/${props.id ?? 'new'}`)

function reset(values: Record<string, unknown>) {
  form.value = values
  password.value = ''
  baseline.value = snapshot([values, ''])
}

async function load() {
  if (!collection) return
  if (props.id === null) {
    reset(initialValues(collection.fields))
    if (props.initial) form.value = { ...form.value, ...props.initial }
    return
  }
  loading.value = true
  try {
    const path = `/${props.slug}/${encodeURIComponent(props.id)}`
    const [loaded, access] = await Promise.all([
      api<Doc>('GET', `${path}?depth=0&draft=true${localeQuery({ editing: true })}`),
      api<{ update: boolean; delete: boolean }>(
        'GET',
        `/admin/access/${props.slug}/${encodeURIComponent(props.id)}`,
      ),
    ])
    doc.value = loaded
    permissions.value = access
    reset(toFormValues(collection.fields, loaded))
    void refreshTranslations()
  } catch (e) {
    notify('error', t('common.error', { message: (e as Error).message }))
  } finally {
    loading.value = false
  }
}

// Languages this document still needs translating into (dots on the language buttons).
const untranslated = ref<string[]>([])
async function refreshTranslations() {
  const localization = session.schema?.localization
  if (!localization || !localized.value || !props.id) {
    untranslated.value = []
    return
  }
  try {
    const all = await api<Doc>(
      'GET',
      `/${props.slug}/${encodeURIComponent(String(props.id))}?depth=0&draft=true&locale=all`,
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
  errors.value = {}
  await load()
}

async function save() {
  if (!collection || !canSave.value) return
  saving.value = true
  errors.value = {}
  const body: Record<string, unknown> = { ...form.value }
  if (isUsers && password.value) body.password = password.value
  const created = props.id === null
  try {
    const saved = created
      ? await api<Doc>('POST', `/${props.slug}?depth=0${localeQuery({ editing: true })}`, body)
      : await api<Doc>(
          'PATCH',
          `/${props.slug}/${encodeURIComponent(String(props.id))}?depth=0${localeQuery({ editing: true })}`,
          body,
        )
    doc.value = saved
    reset(toFormValues(collection.fields, saved))
    void refreshTranslations()
    notify('success', t(created ? 'edit.created' : 'edit.saved'))
    emit('saved', saved, created)
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      notify(
        'error',
        Object.keys(errors.value).length
          ? t('edit.fixErrors')
          : e.status === 403
            ? t('common.forbidden')
            : e.message,
      )
    } else {
      notify('error', String(e))
    }
  } finally {
    saving.value = false
  }
}

async function remove() {
  confirmingDelete.value = false
  try {
    await api('DELETE', `/${props.slug}/${encodeURIComponent(String(props.id))}`)
    notify('success', t('list.deletedCount', { count: 1 }))
    baseline.value = snapshot([form.value, password.value])
    emit('deleted')
  } catch (e) {
    notify(
      'error',
      e instanceof ApiError && e.status === 403 ? t('common.forbidden') : (e as Error).message,
    )
  }
}

/** Esc, the close button and a click outside all ask before losing changes. */
function close() {
  if (dirty.value && !window.confirm(t('edit.unsaved'))) return
  emit('close')
}
function onClick(event: MouseEvent) {
  // The dialog element itself is the backdrop; the panel is inside it.
  if (event.target === dialog.value) close()
}

onMounted(() => {
  dialog.value?.showModal()
  void load()
})
</script>

<template>
  <!-- At the end of <body>: never inside the page's own form (a relationship field's drawer). -->
  <Teleport to="body">
  <dialog ref="dialog" class="drawer" :aria-labelledby="headingId" @cancel.prevent="close" @click="onClick">
    <form class="panel" novalidate @submit.prevent.stop="save">
      <header class="panel-header">
        <h2 :id="headingId">{{ heading }}</h2>
        <div class="header-actions">
          <RouterLink :to="fullPage" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('drawer.openPage')" :title="t('drawer.openPage')">
            <Maximize2 :size="16" aria-hidden="true" />
          </RouterLink>
          <button type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('drawer.close')" @click="close">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="panel-body">
        <LocaleSwitcher v-if="localized" :missing="untranslated" @change="switchLocale" />
        <p v-if="loading" class="muted">{{ t('common.loading') }}</p>
        <template v-else-if="collection">
          <p v-if="!canSave" class="notice notice-warning">{{ t('edit.readOnly') }}</p>
          <FieldList v-model="form" :fields="collection.fields" :errors="errors" :read-only="!canSave" />
          <label v-if="isUsers && canSave" class="field">
            <span class="field-label">
              {{ id ? t('edit.newPassword') : t('edit.password') }}<span v-if="!id" class="field-required" aria-hidden="true">*</span>
            </span>
            <input v-model="password" class="input" type="password" autocomplete="new-password" :aria-invalid="!!errors.password" />
            <span v-for="m in errors.password" :key="m" class="field-error">{{ m }}</span>
          </label>
        </template>
      </div>

      <footer class="panel-footer">
        <button v-if="canDelete" type="button" class="btn btn-ghost danger" @click="confirmingDelete = true">
          <Trash2 :size="15" aria-hidden="true" />
          {{ t('edit.delete') }}
        </button>
        <span class="spacer" />
        <button type="button" class="btn" @click="close">{{ t('common.cancel') }}</button>
        <button v-if="canSave" type="submit" class="btn btn-primary" :disabled="saving || loading">{{ t('edit.save') }}</button>
      </footer>
    </form>
    <ConfirmDialog
      :open="confirmingDelete"
      :message="t('edit.confirmDelete')"
      :confirm-label="t('edit.delete')"
      @confirm="remove"
      @cancel="confirmingDelete = false"
    />
  </dialog>
  </Teleport>
</template>

<style scoped>
/* A modal dialog shown as a panel on the right; the dialog element is the backdrop. */
.drawer {
  position: fixed;
  inset: 0;
  width: 100vw;
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
}
.drawer::backdrop {
  background: rgb(0 0 0 / 35%);
}
.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(30rem, 100vw);
  background: var(--bg);
  box-shadow: var(--shadow);
  animation: slide-in 0.2s ease;
}
@keyframes slide-in {
  from {
    transform: translateX(2rem);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem 0.85rem 1.4rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.panel-header h2 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.1rem;
  font-weight: 600;
}
.header-actions {
  display: flex;
  gap: 0.15rem;
}
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  flex-grow: 1;
  overflow-y: auto;
  padding: 1.4rem;
}
.panel-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.4rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.spacer {
  flex-grow: 1;
}
.danger {
  color: var(--danger);
}
</style>
