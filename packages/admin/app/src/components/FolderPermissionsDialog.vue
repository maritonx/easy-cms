<script setup lang="ts">
import type { AdminRole, AdminRoles } from '@easy-cms/core'
import { computed, ref, useId, watch } from 'vue'
import { ApiError, api } from '../lib/api'
import { type FolderLevel, type FolderNode, type FolderTree, pathTo } from '../lib/folders'
import { t } from '../lib/i18n'
import { session } from '../lib/session'

/**
 * Who may use a folder (admins, `auth.rbac`): as its parent, or each role's level. Admins can
 * always do everything.
 */
const props = defineProps<{ open: boolean; folder: FolderNode | null; tree: FolderTree }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
const id = useId()

const roles = ref<AdminRole[]>([])
const mode = ref<'inherit' | 'own'>('inherit')
const levels = ref<Record<string, FolderLevel | ''>>({})
const error = ref('')
const busy = ref(false)
/** Roles per folder (`auth.rbac`), and private folders (`upload.privateStorage`): admins only. */
const canPermissions = !!session.schema?.folders?.permissions
const canPrivate = !!session.schema?.folders?.private
const isPrivate = ref(false)
/** Private through a folder above it: then this one is private whatever it says. */
const privateAbove = computed(() =>
  props.folder ? pathTo(props.tree, props.folder.parent).some((n) => n.private === true) : false,
)
const privacyChanges = computed(
  () => canPrivate && isPrivate.value !== (props.folder?.private === true) && !privateAbove.value,
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return dialog.value?.close()
    error.value = ''
    const own = props.folder?.permissions ?? null
    mode.value = own ? 'own' : 'inherit'
    levels.value = { ...(own ?? {}) }
    isPrivate.value = props.folder?.private === true
    dialog.value?.showModal()
    if (!canPermissions) return
    try {
      roles.value = (await api<AdminRoles>('GET', '/admin/roles')).roles.filter(
        (r) => r.key !== 'admin',
      )
      for (const role of roles.value) levels.value[role.key] ??= ''
    } catch (e) {
      error.value = (e as Error).message
    }
  },
)

function roleName(role: Pick<AdminRole, 'key' | 'name'>) {
  if (role.name) return role.name
  if (role.key === 'editor') return t('roles.editor')
  return role.key
}

/** Where the folder's permissions come from while it follows its parent. */
const inherited = computed(() => {
  const path = props.folder ? pathTo(props.tree, props.folder.parent) : []
  return [...path].reverse().find((n) => n.permissions) ?? null
})

const LEVELS: { value: FolderLevel | ''; key: Parameters<typeof t>[0] }[] = [
  { value: '', key: 'folders.level.none' },
  { value: 'view', key: 'folders.level.view' },
  { value: 'edit', key: 'folders.level.edit' },
  { value: 'manage', key: 'folders.level.manage' },
]

async function save() {
  if (!props.folder) return
  busy.value = true
  error.value = ''
  const permissions =
    mode.value === 'inherit'
      ? null
      : Object.fromEntries(Object.entries(levels.value).filter(([, level]) => level !== ''))
  try {
    await api('PATCH', `/media-folders/${props.folder.id}?depth=0`, {
      ...(canPermissions ? { permissions } : {}),
      ...(canPrivate ? { private: isPrivate.value } : {}),
    })
    emit('saved')
  } catch (e) {
    error.value = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="dialog card" :aria-labelledby="`${id}-title`" @cancel.prevent="emit('cancel')">
    <form @submit.prevent="save">
      <h2 :id="`${id}-title`">{{ t('folders.permissionsOf', { name: folder?.name ?? '' }) }}</h2>
      <label v-if="canPrivate" class="private-toggle">
        <input v-model="isPrivate" type="checkbox" :disabled="privateAbove" />
        <span>
          <strong>{{ t('folders.private') }}</strong>
          <span class="muted hint">{{ privateAbove ? t('folders.privateAbove') : t('folders.privateHint') }}</span>
        </span>
      </label>
      <p v-if="privacyChanges" class="warning" role="status">
        {{ isPrivate ? t('folders.privateMoveIn') : t('folders.privateMoveOut') }}
      </p>
      <template v-if="canPermissions">
      <p class="muted intro">{{ t('folders.permissionsIntro') }}</p>
      <fieldset class="modes">
        <legend class="visually-hidden">{{ t('folders.permissions') }}</legend>
        <label class="mode">
          <input v-model="mode" type="radio" value="inherit" :name="`${id}-mode`" />
          <span>
            <strong>{{ t('folders.inherit') }}</strong>
            <span class="muted hint">
              {{ inherited ? t('folders.inheritFrom', { name: inherited.name }) : t('folders.inheritTop') }}
            </span>
          </span>
        </label>
        <label class="mode">
          <input v-model="mode" type="radio" value="own" :name="`${id}-mode`" />
          <span>
            <strong>{{ t('folders.own') }}</strong>
            <span class="muted hint">{{ t('folders.ownHint') }}</span>
          </span>
        </label>
      </fieldset>
      <table v-if="mode === 'own'" class="levels">
        <thead>
          <tr>
            <th scope="col">{{ t('folders.role') }}</th>
            <th scope="col">{{ t('folders.access') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{{ t('roles.admin') }}</th>
            <td class="muted">{{ t('folders.level.manage') }}</td>
          </tr>
          <tr v-for="role in roles" :key="role.key">
            <th scope="row"><label :for="`${id}-${role.key}`">{{ roleName(role) }}</label></th>
            <td>
              <select :id="`${id}-${role.key}`" v-model="levels[role.key]" class="input">
                <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ t(l.key) }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
      <dl class="legend muted">
        <div><dt>{{ t('folders.level.view') }}</dt><dd>{{ t('folders.levelHint.view') }}</dd></div>
        <div><dt>{{ t('folders.level.edit') }}</dt><dd>{{ t('folders.levelHint.edit') }}</dd></div>
        <div><dt>{{ t('folders.level.manage') }}</dt><dd>{{ t('folders.levelHint.manage') }}</dd></div>
      </dl>
      </template>
      <p class="note muted">{{ isPrivate || privateAbove ? t('folders.privateNote') : t('folders.publicNote') }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn btn-primary" :disabled="busy">{{ t('edit.save') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(32rem, calc(100vw - 2rem));
  max-height: calc(100vh - 3rem);
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
h2 {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
}
.private-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin: 0.5rem 0 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.private-toggle:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.private-toggle input {
  margin-top: 0.2rem;
}
.private-toggle > span {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.warning {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.85rem;
}
.intro {
  margin: 0 0 1rem;
  font-size: 0.9rem;
}
.modes {
  display: grid;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0;
  border: 0;
}
.mode {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.mode:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.mode input {
  margin-top: 0.2rem;
}
.mode > span {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.hint {
  font-size: 0.85rem;
}
.levels {
  width: 100%;
  margin-bottom: 1rem;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.levels th,
.levels td {
  padding: 0.4rem 0.25rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-weight: 500;
}
.levels thead th {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.levels select {
  width: 100%;
}
.legend {
  display: grid;
  gap: 0.2rem;
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
}
.legend div {
  display: flex;
  gap: 0.35rem;
}
.legend dt {
  font-weight: 600;
}
.legend dt::after {
  content: ':';
}
.legend dd {
  margin: 0;
}
.note {
  margin: 0 0 1rem;
  font-size: 0.82rem;
}
.error {
  margin: 0 0 1rem;
  color: var(--danger);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
