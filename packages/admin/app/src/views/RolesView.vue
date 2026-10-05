<script setup lang="ts">
import type {
  AdminRole,
  AdminRoleChange,
  AdminRoleField,
  AdminRoles,
  FieldRule,
  RoleOperation,
  RolePermissions,
} from '@easy-cms/core'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  History,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
} from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { ApiError, api } from '../lib/api'
import { formatDate, label, t } from '../lib/i18n'
import { session } from '../lib/session'
import { notify } from '../lib/toast'

/** Settings → Roles (admins, `auth.rbac`): what each role may do, ticked per collection and page. */
const route = useRoute()
const router = useRouter()
const data = ref<AdminRoles | null>(null)
const failed = ref('')
const saving = ref(false)

const OPS: RoleOperation[] = ['read', 'create', 'update', 'delete', 'publish']
/** Operations that can be limited to the role's own documents. */
const OWN_OPS: RoleOperation[] = ['read', 'update', 'delete', 'publish']
type Group = 'collections' | 'globals'
interface Row {
  group: Group
  slug: string
  name: string
  ops: RoleOperation[]
  new: boolean
  /** Collections with owners: the field naming the owner. */
  owner?: string
  fields: AdminRoleField[]
}
type Rules = Record<string, Record<string, FieldRule>>

function errorText(e: unknown) {
  return e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
}

async function load() {
  try {
    data.value = await api<AdminRoles>('GET', '/admin/roles')
    failed.value = ''
  } catch (e) {
    failed.value = errorText(e)
  }
}
void load()

/** A role's name: its own, or for `admin` and `editor` the admin's word for it. */
function roleName(role: Pick<AdminRole, 'key' | 'name'>) {
  if (role.name) return role.name
  if (role.key === 'admin') return t('roles.admin')
  if (role.key === 'editor') return t('roles.editor')
  return role.key
}

const selected = computed<AdminRole | undefined>(() => {
  const roles = data.value?.roles ?? []
  const key = typeof route.query.role === 'string' ? route.query.role : undefined
  return roles.find((r) => r.key === key) ?? roles.find((r) => r.key !== 'admin') ?? roles[0]
})
const isAdminRole = computed(() => selected.value?.key === 'admin')

// The role being edited: a copy, saved with the Save button.
const name = ref('')
const draft = ref<{
  collections: Record<string, RoleOperation[]>
  globals: Record<string, RoleOperation[]>
  admin: string[]
  own: Record<string, RoleOperation[]>
  fields: { collections: Rules; globals: Rules }
}>({
  collections: {},
  globals: {},
  admin: [],
  own: {},
  fields: { collections: {}, globals: {} },
})
const baseline = ref('')
const snapshot = () => JSON.stringify({ name: name.value, draft: draft.value })
function reset(role: AdminRole | undefined) {
  name.value = role?.name ?? ''
  draft.value = {
    collections: Object.fromEntries(
      Object.entries(role?.permissions.collections ?? {}).map(([k, v]) => [k, [...v]]),
    ),
    globals: Object.fromEntries(
      Object.entries(role?.permissions.globals ?? {}).map(([k, v]) => [k, [...v]]),
    ),
    admin: [...(role?.permissions.admin ?? [])],
    own: Object.fromEntries(
      Object.entries(role?.permissions.own ?? {}).map(([k, v]) => [k, [...v]]),
    ),
    fields: {
      collections: copyRules(role?.permissions.fields?.collections),
      globals: copyRules(role?.permissions.fields?.globals),
    },
  }
  expanded.value = null
  baseline.value = snapshot()
  history.value = null
}
function copyRules(
  rules: Readonly<Record<string, Readonly<Record<string, FieldRule>>>> | undefined,
) {
  return Object.fromEntries(Object.entries(rules ?? {}).map(([k, v]) => [k, { ...v }])) as Rules
}
/** The row whose fields are open. */
const expanded = ref<string | null>(null)
watch(selected, reset, { immediate: true })
const dirty = computed(() => baseline.value !== '' && snapshot() !== baseline.value)

// Switching roles with unsaved changes asks first.
const switching = ref<string | null>(null)
function select(key: string) {
  if (key === selected.value?.key) return
  if (dirty.value) switching.value = key
  else void router.replace({ query: { role: key } })
}
function confirmSwitch() {
  const key = switching.value
  switching.value = null
  if (key) void router.replace({ query: { role: key } })
}

const collectionName = (slug: string) => {
  const c = session.schema?.collections.find((x) => x.slug === slug)
  return label(c?.labels?.plural, slug)
}
const rows = computed<Row[]>(() => [
  ...(data.value?.collections ?? []).map((c) => ({
    group: 'collections' as const,
    slug: c.slug,
    name: collectionName(c.slug),
    ops: c.ops,
    new: c.new,
    ...(c.owner ? { owner: c.owner } : {}),
    fields: c.fields,
  })),
  ...(data.value?.globals ?? []).map((g) => {
    const global = session.schema?.globals.find((x) => x.slug === g.slug)
    return {
      group: 'globals' as const,
      slug: g.slug,
      name: label(global?.label, g.slug),
      ops: g.ops,
      new: g.new,
      fields: g.fields,
    }
  }),
])

const has = (row: Row, op: RoleOperation) => draft.value[row.group][row.slug]?.includes(op) ?? false
function setOps(row: Row, next: Set<RoleOperation>) {
  draft.value[row.group][row.slug] = row.ops.filter((op) => next.has(op))
}
function toggle(row: Row, op: RoleOperation, on: boolean) {
  const current = new Set(draft.value[row.group][row.slug] ?? [])
  if (on) {
    current.add(op)
    // Doing anything else needs reading.
    current.add('read')
  } else {
    current.delete(op)
    if (op === 'read') current.clear()
  }
  setOps(row, current)
  // What the role can't do can't be limited to its own documents either.
  const own = draft.value.own[row.slug]
  if (own) draft.value.own[row.slug] = own.filter((o) => current.has(o))
}

/** Allowed on the role's own documents only (collections with owners). */
const isOwn = (row: Row, op: RoleOperation) => draft.value.own[row.slug]?.includes(op) ?? false
const canOwn = (row: Row, op: RoleOperation) =>
  row.group === 'collections' && !!row.owner && OWN_OPS.includes(op) && has(row, op)
function toggleOwn(row: Row, op: RoleOperation) {
  const own = new Set(draft.value.own[row.slug] ?? [])
  if (own.has(op)) own.delete(op)
  else own.add(op)
  draft.value.own[row.slug] = OWN_OPS.filter((o) => own.has(o))
}

const rowKey = (row: Row) => `${row.group}:${row.slug}`
const fieldRule = (row: Row, field: string): FieldRule | 'edit' =>
  draft.value.fields[row.group][row.slug]?.[field] ?? 'edit'
function setFieldRule(row: Row, field: string, rule: FieldRule | 'edit') {
  const rules = { ...(draft.value.fields[row.group][row.slug] ?? {}) }
  if (rule === 'edit') delete rules[field]
  else rules[field] = rule
  draft.value.fields[row.group][row.slug] = rules
}
const ruleCount = (row: Row) => Object.keys(draft.value.fields[row.group][row.slug] ?? {}).length
/** A required field can't be read-only or hidden for a role that creates documents. */
const mustEdit = (row: Row, field: AdminRoleField) =>
  field.required && row.group === 'collections' && has(row, 'create')
const RULES = ['edit', 'read', 'hidden'] as const
const ruleLabel = (rule: (typeof RULES)[number]) =>
  t(rule === 'edit' ? 'roles.fieldEdit' : rule === 'read' ? 'roles.fieldRead' : 'roles.fieldHidden')
const fieldName = (row: Row, field: AdminRoleField) => {
  const fields =
    row.group === 'collections'
      ? session.schema?.collections.find((c) => c.slug === row.slug)?.fields
      : session.schema?.globals.find((g) => g.slug === row.slug)?.fields
  return label(field.label ?? fields?.find((f) => f.name === field.name)?.label, field.name)
}
const rowAll = (row: Row) => row.ops.every((op) => has(row, op))
function toggleRow(row: Row, on: boolean) {
  setOps(row, new Set(on ? row.ops : []))
}
const columnRows = (op: RoleOperation) => rows.value.filter((r) => r.ops.includes(op))
const columnAll = (op: RoleOperation) => {
  const list = columnRows(op)
  return list.length > 0 && list.every((r) => has(r, op))
}
function toggleColumn(op: RoleOperation, on: boolean) {
  for (const row of columnRows(op)) toggle(row, op, on)
}
const opLabel = (row: Row | null, op: RoleOperation) =>
  op === 'create' && row?.slug === 'media' ? t('apiKey.upload') : t(`apiKey.${op}` as 'apiKey.read')

const views = computed(() =>
  (data.value?.views ?? []).map((view) => {
    if (view.id === 'status') return { id: view.id, name: t('roles.viewStatus'), kind: '' }
    if (view.id === 'deliveries') return { id: view.id, name: t('deliveries.title'), kind: '' }
    if (view.id === 'audit') return { id: view.id, name: t('audit.title'), kind: '' }
    const page = view.id.startsWith('page:')
    const fallback = view.id.slice(view.id.indexOf(':') + 1)
    return {
      id: view.id,
      name: label(view.label, fallback),
      kind: page ? t('roles.page') : t('roles.widget'),
    }
  }),
)
function toggleView(id: string, on: boolean) {
  const set = new Set(draft.value.admin)
  if (on) set.add(id)
  else set.delete(id)
  draft.value.admin = (data.value?.views ?? []).map((v) => v.id).filter((v) => set.has(v))
}

/** Fields that would show "no access": a collection it may edit points to one it can't read. */
const warnings = computed(() => {
  const out: string[] = []
  for (const c of data.value?.collections ?? []) {
    const ops = draft.value.collections[c.slug] ?? []
    if (!ops.includes('create') && !ops.includes('update')) continue
    for (const to of c.references) {
      if (!(draft.value.collections[to] ?? []).includes('read'))
        out.push(t('roles.warnRef', { from: collectionName(c.slug), to: collectionName(to) }))
    }
  }
  return out
})

/** Every row is saved, ticked or not: what was looked at is no longer "new". */
function permissions(): RolePermissions {
  const collections: Record<string, RoleOperation[]> = {}
  const globals: Record<string, RoleOperation[]> = {}
  for (const row of rows.value) {
    const ops = draft.value[row.group][row.slug] ?? []
    if (row.group === 'collections') collections[row.slug] = ops
    else globals[row.slug] = ops
  }
  const own: Record<string, RoleOperation[]> = {}
  for (const row of rows.value) {
    const ops = (draft.value.own[row.slug] ?? []).filter((op) => canOwn(row, op))
    if (ops.length > 0) own[row.slug] = ops
  }
  const fields = { collections: {} as Rules, globals: {} as Rules }
  for (const row of rows.value) {
    const rules = draft.value.fields[row.group][row.slug]
    if (rules && Object.keys(rules).length > 0) fields[row.group][row.slug] = rules
  }
  return { collections, globals, admin: draft.value.admin, own, fields }
}

async function save() {
  const role = selected.value
  if (!role) return
  saving.value = true
  try {
    await api('PATCH', `/admin/roles/${role.id}`, {
      name: name.value,
      ...(isAdminRole.value ? {} : { permissions: permissions() }),
    })
    notify('success', t('roles.saved'))
    await load()
    reset(selected.value)
  } catch (e) {
    notify('error', errorText(e))
  } finally {
    saving.value = false
  }
}

// New role, empty or from another role's permissions.
const dialog = ref<HTMLDialogElement>()
const newKey = ref('')
const newName = ref('')
const copyFrom = ref('')
const createError = ref('')
function openNew(from = '') {
  newKey.value = ''
  newName.value = ''
  copyFrom.value = from
  createError.value = ''
  dialog.value?.showModal()
}
async function create() {
  const source = data.value?.roles.find((r) => r.key === copyFrom.value)
  try {
    const created = await api<AdminRole>('POST', '/admin/roles', {
      key: newKey.value.trim(),
      name: newName.value,
      permissions: source && source.key !== 'admin' ? source.permissions : {},
    })
    dialog.value?.close()
    notify('success', t('roles.created'))
    await load()
    void router.replace({ query: { role: created.key } })
  } catch (e) {
    createError.value = errorText(e)
  }
}

const deleting = ref(false)
const deleteBlocked = computed(() => {
  const role = selected.value
  if (!role) return ''
  if (role.system) return t('roles.cantDeleteSystem')
  if (role.users > 0) return t('roles.cantDeleteUsed', { count: role.users })
  return ''
})
async function remove() {
  deleting.value = false
  const role = selected.value
  if (!role) return
  try {
    await api('DELETE', `/admin/roles/${role.id}`)
    notify('success', t('roles.deleted'))
    baseline.value = ''
    await router.replace({ query: {} })
    await load()
  } catch (e) {
    notify('error', errorText(e))
  }
}

const history = ref<AdminRoleChange[] | null>(null)
async function toggleHistory() {
  if (history.value) {
    history.value = null
    return
  }
  try {
    history.value = await api<AdminRoleChange[]>(
      'GET',
      `/admin/roles/${selected.value?.id}/history`,
    )
  } catch (e) {
    notify('error', errorText(e))
  }
}
const ticks = (p: RolePermissions) =>
  [...Object.values(p.collections ?? {}), ...Object.values(p.globals ?? {})].reduce(
    (n, ops) => n + ops.length,
    0,
  ) + (p.admin?.length ?? 0)
</script>

<template>
  <p v-if="!session.schema?.views.roles" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <nav class="crumbs" :aria-label="t('list.breadcrumb')">
      <span>{{ t('nav.globals') }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
      <span class="current">{{ t('roles.title') }}</span>
    </nav>
    <header class="page-header">
      <div>
        <h1>{{ t('roles.title') }}</h1>
        <p class="muted">{{ t('roles.lead') }}</p>
      </div>
      <button type="button" class="btn btn-primary" :disabled="!data" @click="openNew()">
        <Plus :size="16" aria-hidden="true" />
        {{ t('roles.new') }}
      </button>
    </header>

    <p v-if="failed" class="field-error">{{ failed }}</p>
    <p v-else-if="!data" class="muted">{{ t('common.loading') }}</p>
    <div v-else class="layout">
      <ul class="role-list card" :aria-label="t('roles.title')">
        <li v-for="role in data.roles" :key="role.key">
          <button
            type="button"
            :class="['role', { active: role.key === selected?.key }]"
            :aria-current="role.key === selected?.key ? 'true' : undefined"
            @click="select(role.key)"
          >
            <span class="role-name">
              <ShieldCheck v-if="role.key === 'admin'" :size="15" aria-hidden="true" />
              {{ roleName(role) }}
              <span v-if="role.system" class="badge" :title="t('roles.systemHint')">{{ t('roles.system') }}</span>
            </span>
            <span class="muted small"><code>{{ role.key }}</code> · {{ t('roles.users', { count: role.users }) }}</span>
          </button>
        </li>
      </ul>

      <form v-if="selected" class="editor" novalidate @submit.prevent="save">
        <section class="card panel">
          <div class="name-row">
            <div class="field">
              <label class="field-label" for="role-name">{{ t('roles.name') }}</label>
              <input id="role-name" v-model="name" class="input" maxlength="60" :placeholder="roleName({ key: selected.key, name: '' })" />
            </div>
            <div class="field">
              <span class="field-label">{{ t('roles.key') }}</span>
              <code class="key">{{ selected.key }}</code>
            </div>
          </div>
          <p v-if="selected.system" class="field-hint">{{ t('roles.systemHint') }}</p>
        </section>

        <p v-if="isAdminRole" class="notice">{{ t('roles.adminAll') }}</p>
        <template v-else>
          <section class="card panel" aria-labelledby="content-heading">
            <h2 id="content-heading">{{ t('roles.content') }}</h2>
            <p class="field-hint">{{ t('roles.contentHint') }}</p>
            <p v-if="rows.some((r) => r.owner)" class="field-hint own-hint">
              <UserRound :size="13" aria-hidden="true" /> {{ t('roles.ownHint') }}
            </p>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col" class="name-col" />
                    <th v-for="op in OPS" :key="op" scope="col">
                      <label class="col-head">
                        <span>{{ t(`apiKey.${op}`) }}</span>
                        <input
                          type="checkbox"
                          :checked="columnAll(op)"
                          :disabled="!columnRows(op).length"
                          :aria-label="t('roles.allColumn', { op: t(`apiKey.${op}`) })"
                          :title="t('roles.allColumn', { op: t(`apiKey.${op}`) })"
                          @change="toggleColumn(op, ($event.target as HTMLInputElement).checked)"
                        />
                      </label>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in rows" :key="rowKey(row)">
                  <tr>
                    <th scope="row" class="name-col">
                      <label class="row-head">
                        <input
                          type="checkbox"
                          :checked="rowAll(row)"
                          :aria-label="t('roles.allOf', { name: row.name })"
                          :title="t('roles.allOf', { name: row.name })"
                          @change="toggleRow(row, ($event.target as HTMLInputElement).checked)"
                        />
                        <span>{{ row.name }}</span>
                      </label>
                      <span v-if="row.group === 'globals'" class="kind">{{ t('apiKey.global') }}</span>
                      <span v-if="row.new" class="badge badge-new" :title="t('roles.newHint')">{{ t('roles.newBadge') }}</span>
                      <button
                        v-if="row.fields.length"
                        type="button"
                        class="fields-toggle"
                        :aria-expanded="expanded === rowKey(row)"
                        :aria-controls="`fields-${row.group}-${row.slug}`"
                        :aria-label="t('roles.fieldsOf', { name: row.name })"
                        @click="expanded = expanded === rowKey(row) ? null : rowKey(row)"
                      >
                        {{ t('roles.fields') }}
                        <span v-if="ruleCount(row)" class="count">{{ ruleCount(row) }}</span>
                        <component :is="expanded === rowKey(row) ? ChevronDown : ChevronRight" :size="13" aria-hidden="true" />
                      </button>
                    </th>
                    <td v-for="op in OPS" :key="op">
                      <span v-if="row.ops.includes(op)" class="cell">
                        <input
                          type="checkbox"
                          :checked="has(row, op)"
                          :aria-label="`${row.name}: ${opLabel(row, op)}`"
                          :title="opLabel(row, op)"
                          @change="toggle(row, op, ($event.target as HTMLInputElement).checked)"
                        />
                        <button
                          v-if="canOwn(row, op)"
                          type="button"
                          :class="['own', { on: isOwn(row, op) }]"
                          :aria-pressed="isOwn(row, op)"
                          :aria-label="t('roles.ownOf', { name: row.name, op: opLabel(row, op) })"
                          :title="t('roles.ownOf', { name: row.name, op: opLabel(row, op) })"
                          @click="toggleOwn(row, op)"
                        >
                          <UserRound :size="13" aria-hidden="true" />
                        </button>
                      </span>
                    </td>
                  </tr>
                  <tr v-if="expanded === rowKey(row)" :id="`fields-${row.group}-${row.slug}`" class="fields-row">
                    <td :colspan="OPS.length + 1">
                      <p class="field-hint">{{ t('roles.fieldsHint') }}</p>
                      <ul class="field-rules">
                        <li v-for="field in row.fields" :key="field.name">
                          <span class="field-name">
                            {{ fieldName(row, field) }}
                            <code>{{ field.name }}</code>
                            <span v-if="field.owner" class="badge">{{ t('roles.ownerBadge') }}</span>
                          </span>
                          <span class="segmented-rules" role="radiogroup" :aria-label="fieldName(row, field)">
                            <label v-for="rule in RULES" :key="rule" :class="{ on: fieldRule(row, field.name) === rule }">
                              <input
                                type="radio"
                                :name="`rule-${row.group}-${row.slug}-${field.name}`"
                                :value="rule"
                                :checked="fieldRule(row, field.name) === rule"
                                :disabled="rule !== 'edit' && mustEdit(row, field)"
                                @change="setFieldRule(row, field.name, rule)"
                              />
                              {{ ruleLabel(rule) }}
                            </label>
                          </span>
                          <span v-if="mustEdit(row, field)" class="field-hint required-hint">{{ t('roles.fieldRequired') }}</span>
                        </li>
                      </ul>
                    </td>
                  </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <ul v-if="warnings.length" class="warnings" role="status">
              <li v-for="w in warnings" :key="w">
                <TriangleAlert :size="15" aria-hidden="true" />
                <span>{{ w }}</span>
              </li>
            </ul>
          </section>

          <section class="card panel" aria-labelledby="pages-heading">
            <h2 id="pages-heading">{{ t('roles.pages') }}</h2>
            <p class="field-hint">{{ t('roles.pagesHint') }}</p>
            <ul class="views">
              <li v-for="view in views" :key="view.id">
                <label>
                  <input
                    type="checkbox"
                    :checked="draft.admin.includes(view.id)"
                    @change="toggleView(view.id, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ view.name }}</span>
                  <span v-if="view.kind" class="kind">{{ view.kind }}</span>
                </label>
              </li>
            </ul>
          </section>
        </template>

        <section class="card panel">
          <div class="tools">
            <button type="button" class="btn btn-sm" @click="toggleHistory">
              <History :size="15" aria-hidden="true" />
              {{ t('roles.history') }}
            </button>
            <button v-if="!isAdminRole" type="button" class="btn btn-sm" @click="openNew(selected.key)">
              <Copy :size="15" aria-hidden="true" />
              {{ t('roles.copy') }}
            </button>
            <button
              v-if="!isAdminRole"
              type="button"
              class="btn btn-sm btn-danger"
              :disabled="!!deleteBlocked"
              :title="deleteBlocked || undefined"
              @click="deleting = true"
            >
              <Trash2 :size="15" aria-hidden="true" />
              {{ t('roles.delete') }}
            </button>
          </div>
          <p v-if="deleteBlocked && !isAdminRole" class="field-hint">{{ deleteBlocked }}</p>
          <template v-if="history">
            <p v-if="!history.length" class="muted small">{{ t('roles.historyEmpty') }}</p>
            <ol v-else class="history">
              <li v-for="change in history" :key="String(change.id)">
                <strong>{{ formatDate(change.createdAt) }}</strong>
                <span class="muted">{{ change.author ?? t('roles.bySystem') }}</span>
                <span class="muted small">
                  {{ change.name || roleName({ key: selected.key, name: '' }) }} ·
                  {{ t('roles.changes', { count: ticks(change.permissions) }) }}
                </span>
              </li>
            </ol>
          </template>
        </section>

        <footer class="save-bar">
          <span class="save-state">
            <template v-if="dirty"><span class="dot" aria-hidden="true" />{{ t('edit.unsavedChanges') }}</template>
          </span>
          <div class="save-actions">
            <button v-if="dirty" type="button" class="btn btn-ghost" :disabled="saving" @click="reset(selected)">{{ t('edit.undoChanges') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="!dirty || saving">{{ t('edit.save') }}</button>
          </div>
        </footer>
      </form>
    </div>

    <dialog ref="dialog" class="dialog card" :aria-label="t('roles.new')">
      <form class="new-role" novalidate @submit.prevent="create">
        <h2>{{ t('roles.new') }}</h2>
        <div class="field">
          <label class="field-label" for="new-name">{{ t('roles.name') }}</label>
          <input id="new-name" v-model="newName" class="input" maxlength="60" />
        </div>
        <div class="field">
          <label class="field-label" for="new-key">{{ t('roles.key') }}</label>
          <input id="new-key" v-model="newKey" class="input" required pattern="[a-z][a-z0-9\-]*" maxlength="32" autocomplete="off" spellcheck="false" :aria-invalid="!!createError" />
          <span class="field-hint">{{ t('roles.keyHint') }}</span>
        </div>
        <div class="field">
          <label class="field-label" for="new-from">{{ t('roles.copyFrom') }}</label>
          <select id="new-from" v-model="copyFrom" class="input">
            <option value="">{{ t('roles.copyNone') }}</option>
            <option v-for="role in data?.roles.filter((r) => r.key !== 'admin') ?? []" :key="role.key" :value="role.key">
              {{ roleName(role) }}
            </option>
          </select>
        </div>
        <p v-if="createError" class="field-error">{{ createError }}</p>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="dialog?.close()">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="!newKey.trim()">{{ t('roles.create') }}</button>
        </div>
      </form>
    </dialog>

    <ConfirmDialog
      :open="deleting"
      :message="t('roles.confirmDelete', { name: selected ? roleName(selected) : '' })"
      :confirm-label="t('roles.delete')"
      @confirm="remove"
      @cancel="deleting = false"
    />
    <ConfirmDialog
      :open="switching !== null"
      :message="t('roles.confirmDiscard', { name: selected ? roleName(selected) : '' })"
      :confirm-label="t('roles.discard')"
      @confirm="confirmSwitch"
      @cancel="switching = null"
    />
  </template>
</template>

<style scoped>
.crumbs {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
  color: var(--faint);
  font-size: 0.875rem;
}
.crumbs .current {
  color: var(--text-muted);
}
.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.page-header p {
  margin: 0.3rem 0 0;
}
.layout {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
.role-list {
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  position: sticky;
  top: 1rem;
}
.role {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.role:hover {
  background: var(--surface-2);
}
.role.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.role-name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 500;
}
.role .badge {
  font-size: 0.68rem;
}
.small {
  font-size: 0.78rem;
}
.editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.panel {
  padding: 1rem 1.1rem 1.1rem;
  min-width: 0;
}
.panel h2 {
  margin: 0 0 0.3rem;
  font-size: 0.95rem;
  font-weight: 600;
}
.name-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
}
.key {
  display: block;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 0.85rem;
}
.table-wrap {
  margin-top: 0.75rem;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
th,
td {
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid var(--border);
  text-align: center;
}
tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
}
thead th {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-2);
}
.col-head {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
}
.name-col {
  text-align: left;
  font-weight: 500;
  white-space: nowrap;
}
.row-head {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  cursor: pointer;
}
.kind {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--text-muted);
}
.badge-new {
  margin-left: 0.4rem;
  background: var(--info-soft);
  color: var(--info);
  font-size: 0.68rem;
}
input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
}
.cell {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.own {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--faint);
  cursor: pointer;
}
.own.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.own-hint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.25rem;
}
.fields-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin-left: 0.5rem;
  padding: 0.1rem 0.4rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 400;
  cursor: pointer;
}
.fields-toggle:hover {
  background: var(--surface-2);
}
.fields-toggle .count {
  min-width: 1.1rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 0.7rem;
}
.fields-row > td {
  padding: 0.6rem 0.9rem 0.8rem;
  background: var(--surface-2);
  text-align: left;
}
.field-rules {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}
.field-rules li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem 1rem;
}
.field-name {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.field-name code {
  color: var(--faint);
  font-size: 0.75rem;
}
.segmented-rules {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface);
}
.segmented-rules label {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.segmented-rules label + label {
  border-left: 1px solid var(--border);
}
.segmented-rules label.on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.segmented-rules input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.segmented-rules label:has(input:disabled) {
  color: var(--faint);
  cursor: not-allowed;
}
.segmented-rules label:has(input:focus-visible) {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.required-hint {
  flex-basis: 100%;
  margin: 0;
}
.warnings {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.75rem 0 0;
  padding: 0.65rem 0.8rem;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.85rem;
  list-style: none;
}
.warnings li {
  display: flex;
  gap: 0.45rem;
}
.warnings svg {
  flex: none;
  margin-top: 0.15rem;
}
.views {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 0.35rem 1rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
}
.views label {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0;
  cursor: pointer;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.history {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.9rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
}
.history li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.save-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.save-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.875rem;
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
.dialog {
  width: min(28rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.new-role {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.new-role h2 {
  margin: 0;
  font-size: 1.05rem;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .role-list {
    position: static;
  }
  .name-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
