<script setup lang="ts">
import type { IntegrationLogo, Label } from '@easy-cms/core'
import {
  CheckCircle2,
  CircleAlert,
  Code2,
  Copy,
  ExternalLink,
  Package,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from '@lucide/vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AiSettings from '../components/AiSettings.vue'
import IntegrationIcon from '../components/IntegrationIcon.vue'
import { ApiError, api } from '../lib/api'
import { formatDate, label, t } from '../lib/i18n'
import { notify } from '../lib/toast'

/**
 * Settings → Integrations (#311): plugins' providers in one compact list by category, each opening a
 * drawer with its accounts (`?open=<id>`).
 */

type Category = 'social' | 'ai' | 'notifications' | 'automation' | 'backups'
interface Field {
  name: string
  label?: Label
  description?: Label
  type?: 'text' | 'url' | 'textarea' | 'select' | 'multiselect'
  options?: (string | { value: string; label: Label })[]
  /** Has a Find button: choices from the provider (#356). */
  findable?: boolean
  placeholder?: string
  required?: boolean
  secret?: boolean
}
interface Connection {
  id: number | string
  name: string
  isDefault: boolean
  env: boolean
  account: string | null
  lastUsedAt: string | null
  lastError: string | null
  values: Record<string, string>
  /** AI providers: this month. */
  usage?: { requests: number; input: number; output: number }
}
interface Integration {
  id: string
  label: Label
  category: Category
  description?: Label
  icon?: string | IntegrationLogo
  docs?: string
  plugin?: string
  kind: 'fields' | 'oauth'
  fields: Field[]
  enabled: boolean
  envFields: string[]
  testable: boolean
  connections: Connection[]
  /** Accepted before the first connection (AI providers' privacy). */
  consent?: { text: Label; policy?: string }
  consented?: { at: string; by: string } | null
  /** OAuth: the app's keys at the provider, entered before connecting. */
  app?: {
    fields: Field[]
    envFields: string[]
    values: Record<string, string>
    complete: boolean
    redirectUri: string
  }
}
interface Overview {
  integrations: Integration[]
  configured: { id: string; kind: string; name: string }[]
  catalog: { name: string; category: string; description: Label; docs: string }[]
  staleSecrets: number
}

const route = useRoute()
const router = useRouter()
const data = ref<Overview | null>(null)
const error = ref('')
const CATEGORIES: (Category | 'code')[] = [
  'social',
  'ai',
  'notifications',
  'automation',
  'backups',
  'code',
]
const category = computed(() => {
  const value = route.query.category
  return typeof value === 'string' && (CATEGORIES as string[]).includes(value) ? value : null
})
function setCategory(value: string | null) {
  void router.replace({ query: value ? { category: value } : {} })
}
const query = ref('')
const matches = (...texts: string[]) => {
  const q = query.value.trim().toLowerCase()
  return !q || texts.some((text) => text.toLowerCase().includes(q))
}

/** What a row says about an integration. */
function statusOf(integration: Integration): {
  kind: 'ok' | 'error' | 'off' | 'none'
  text: string
} {
  if (!integration.enabled) return { kind: 'off', text: t('integrations.statusOff') }
  if (integration.connections.some((c) => c.lastError))
    return { kind: 'error', text: t('integrations.statusProblem') }
  if (integration.connections.length)
    return {
      kind: 'ok',
      text: t('integrations.statusConnected', { count: integration.connections.length }),
    }
  return { kind: 'none', text: t('integrations.statusNone') }
}

/** The AI plugin's settings, for its row (`GET /admin/ai`); `null` without it. */
const ai = ref<{
  main: string | null
  connections: { id: string; integration: string; name: string; label: Label }[]
  features: { enabled: boolean }[]
  usage: { byFeature: { requests: number }[] }
} | null>(null)
async function loadAi() {
  try {
    ai.value = await api('GET', '/admin/ai')
  } catch {
    ai.value = null
  }
}
const aiSummary = computed(() => {
  const value = ai.value
  if (!value) return ''
  const main = value.connections.find((c) => c.id === value.main) ?? value.connections[0]
  if (!main) return t('ai.rowNone')
  const count = value.usage.byFeature.reduce((sum, f) => sum + f.requests, 0)
  return t('ai.rowSummary', {
    main: label(main.label, main.integration),
    count: count.toLocaleString(),
  })
})

type Row =
  | { kind: 'integration'; key: string; integration: Integration }
  | { kind: 'ai'; key: string }
  | { kind: 'code'; key: string; service: Overview['configured'][number] }
/** The list: by category, filtered by the chips and the search. */
const groups = computed(() => {
  const out: { category: Category | 'code'; rows: Row[] }[] = []
  for (const c of CATEGORIES) {
    if (category.value && category.value !== c) continue
    const rows: Row[] = []
    if (c === 'code') {
      for (const service of data.value?.configured ?? []) {
        const name = t(`integrations.kind.${service.kind}` as never)
        if (matches(name, service.name)) rows.push({ kind: 'code', key: service.id, service })
      }
    } else {
      if (c === 'ai' && ai.value && matches(t('ai.row'), 'AI')) rows.push({ kind: 'ai', key: 'ai' })
      for (const integration of data.value?.integrations ?? [])
        if (
          integration.category === c &&
          matches(
            label(integration.label, integration.id),
            label(integration.description ?? '', ''),
            integration.plugin ?? '',
          )
        )
          rows.push({ kind: 'integration', key: integration.id, integration })
    }
    if (rows.length) out.push({ category: c, rows })
  }
  return out
})
const catalog = computed(() =>
  (data.value?.catalog ?? []).filter(
    (p) =>
      (!category.value || p.category === category.value) &&
      matches(p.name, label(p.description, '')),
  ),
)
/** Headings between categories only when everything shows. */
const grouped = computed(() => !category.value && !query.value.trim())
const counts = computed(() => {
  const out: Record<string, number> = { code: data.value?.configured.length ?? 0 }
  for (const i of data.value?.integrations ?? []) out[i.category] = (out[i.category] ?? 0) + 1
  return out
})
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify('success', t('integrations.copied'))
  } catch (e) {
    notify('error', (e as Error).message)
  }
}

/** The drawer: an integration's id, or `ai` for the AI settings (`?open=` in the address). */
const opened = computed(() => (typeof route.query.open === 'string' ? route.query.open : null))
const openIntegration = computed(
  () => data.value?.integrations.find((i) => i.id === opened.value) ?? null,
)
const drawer = ref<HTMLDialogElement>()
function open(id: string) {
  void router.replace({ query: { ...route.query, open: id } })
}
function close() {
  const { open: _, ...rest } = route.query
  void router.replace({ query: rest })
}
watch(
  [opened, () => data.value],
  async ([id]) => {
    await nextTick()
    const dialog = drawer.value
    if (!id || !dialog) return
    if (!dialog.open) {
      form.value = null
      consenting.value = null
      found.value = {}
      dialog.showModal()
      // Nothing connected yet: straight to connecting.
      const integration = openIntegration.value
      if (integration?.enabled && integration.connections.length === 0) startAdding(integration)
    }
  },
  { flush: 'post' },
)
watch(opened, (id) => {
  if (!id && drawer.value?.open) drawer.value.close()
})
function onDrawerClick(event: MouseEvent) {
  // The dialog element itself is the backdrop; the panel is inside it.
  if (event.target === drawer.value) close()
}

/** Tells the AI box to read its connections again. */
const version = ref(0)
async function load() {
  try {
    data.value = await api<Overview>('GET', '/admin/integrations')
    version.value++
    void loadAi()
  } catch (e) {
    error.value = (e as Error).message
  }
}

/** The form that adds a connection to an integration, or edits one. */
const form = ref<{
  integration: string
  id: Connection['id'] | null
  name: string
  values: Record<string, string>
} | null>(null)
const errors = ref<Record<string, string>>({})
const busy = ref(false)
/** The integration whose consent is shown before connecting. */
const consenting = ref<string | null>(null)
// The OAuth app's keys (client id and secret): open until set, then folded away.
const appForm = ref<Record<string, string>>({})
const appErrors = ref<Record<string, string>>({})
const appOpen = ref(false)
const appSaving = ref(false)
watch(
  () => openIntegration.value?.id,
  () => {
    const app = openIntegration.value?.app
    appForm.value = Object.fromEntries(
      (app?.fields ?? []).map((f) => [f.name, f.secret ? '' : (app?.values[f.name] ?? '')]),
    )
    appErrors.value = {}
    appOpen.value = !!app && !app.complete
  },
  { immediate: true },
)
async function saveApp(integration: Integration) {
  appSaving.value = true
  appErrors.value = {}
  try {
    await api('PUT', `/admin/integrations/${integration.id}/app`, { values: appForm.value })
    notify('success', t('integrations.appSaved'))
    appOpen.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.errors.length)
      for (const item of e.errors) appErrors.value[item.field ?? ''] = item.message
    else notify('error', (e as Error).message)
  } finally {
    appSaving.value = false
  }
}

async function accept(integration: Integration) {
  try {
    await api('POST', `/admin/integrations/${integration.id}/consent`)
    consenting.value = null
    await load()
    const fresh = data.value?.integrations.find((i) => i.id === integration.id)
    if (fresh) startAdding(fresh)
  } catch (e) {
    notify('error', (e as Error).message)
  }
}
function startAdding(integration: Integration) {
  if (integration.consent && !integration.consented) {
    consenting.value = integration.id
    return
  }
  errors.value = {}
  form.value = {
    integration: integration.id,
    id: null,
    name: integration.connections.length ? '' : label(integration.label, integration.id),
    values: {},
  }
}
function startEditing(integration: Integration, connection: Connection) {
  errors.value = {}
  const values: Record<string, string> = {}
  // Secrets stay as they are unless typed again.
  for (const field of integration.fields)
    if (!field.secret) values[field.name] = connection.values[field.name] ?? ''
  form.value = { integration: integration.id, id: connection.id, name: connection.name, values }
}
async function submit(integration: Integration) {
  const current = form.value
  if (!current) return
  busy.value = true
  errors.value = {}
  try {
    if (integration.kind === 'oauth' && current.id === null) {
      const { url } = await api<{ url: string }>(
        'POST',
        `/admin/integrations/${integration.id}/authorize`,
        { name: current.name },
      )
      window.location.assign(url)
      return
    }
    if (current.id === null)
      await api('POST', `/admin/integrations/${integration.id}/connections`, {
        name: current.name,
        values: current.values,
      })
    else
      await api('PATCH', `/admin/integrations/${integration.id}/connections/${current.id}`, {
        name: current.name,
        ...(integration.kind === 'fields' ? { values: current.values } : {}),
      })
    notify('success', t('integrations.saved', { name: current.name }))
    form.value = null
    await load()
  } catch (e) {
    if (e instanceof ApiError)
      for (const item of e.errors) errors.value[item.field ?? ''] = item.message
    else errors.value[''] = (e as Error).message
  }
  busy.value = false
}

async function run(action: () => Promise<unknown>, message?: string) {
  try {
    await action()
    if (message) notify('success', message)
    await load()
  } catch (e) {
    notify('error', (e as Error).message)
  }
}
const toggle = (integration: Integration) =>
  run(
    () => api('PUT', `/admin/integrations/${integration.id}`, { enabled: !integration.enabled }),
    t(integration.enabled ? 'integrations.disabled' : 'integrations.enabled', {
      name: label(integration.label, integration.id),
    }),
  )
async function test(integration: Integration, connection: Connection) {
  try {
    const result = await api<{ ok: boolean; account?: string; message?: string }>(
      'POST',
      `/admin/integrations/${integration.id}/connections/${connection.id}/test`,
    )
    if (result.ok)
      notify(
        'success',
        result.account
          ? t('integrations.testOkAccount', { account: result.account })
          : t('integrations.testOk'),
      )
    else notify('error', t('integrations.testFailed', { message: result.message ?? '' }))
    await load()
  } catch (e) {
    notify('error', (e as Error).message)
  }
}
const makeDefault = (integration: Integration, connection: Connection) =>
  run(
    () =>
      api('PATCH', `/admin/integrations/${integration.id}/connections/${connection.id}`, {
        isDefault: true,
      }),
    t('integrations.defaultSet', { name: connection.name }),
  )
function disconnect(integration: Integration, connection: Connection) {
  if (!window.confirm(t('integrations.confirmDisconnect', { name: connection.name }))) return
  void run(
    () => api('DELETE', `/admin/integrations/${integration.id}/connections/${connection.id}`),
    t('integrations.disconnected', { name: connection.name }),
  )
}

/** Back from a provider with several accounts: which one to connect. */
const choosing = ref<{
  integration: string
  pending: string
  name: string
  accounts: { id: string; name: string }[]
} | null>(null)
async function choose(account: string) {
  const current = choosing.value
  if (!current) return
  await run(
    () =>
      api('POST', `/admin/integrations/${current.integration}/pending/${current.pending}`, {
        account,
      }),
    t('integrations.saved', { name: current.name }),
  )
  choosing.value = null
}

onMounted(async () => {
  await load()
  // Back from a provider's sign-in page.
  const q = route.query
  const integration = typeof q.integration === 'string' ? q.integration : null
  if (integration && typeof q.error === 'string') notify('error', q.error)
  else if (integration && q.connected) notify('success', t('integrations.connected'))
  else if (integration && typeof q.pending === 'string') {
    try {
      const found = await api<{ name: string; accounts: { id: string; name: string }[] }>(
        'GET',
        `/admin/integrations/${integration}/pending/${q.pending}`,
      )
      choosing.value = { integration, pending: q.pending, ...found }
    } catch (e) {
      notify('error', (e as Error).message)
    }
  }
  if (integration)
    void router.replace({ query: category.value ? { category: category.value } : {} })
})

const optionValue = (o: string | { value: string }) => (typeof o === 'string' ? o : o.value)
const optionLabel = (o: string | { value: string; label: Label }) =>
  typeof o === 'string' ? o : label(o.label, o.value)
/** Ticked options of a `multiselect`, kept as `a,b,c`. */
function ticked(name: string): string[] {
  return (form.value?.values[name] ?? '').split(',').filter(Boolean)
}
function tick(name: string, value: string, on: boolean) {
  if (!form.value) return
  const next = new Set(ticked(name))
  if (on) next.add(value)
  else next.delete(value)
  form.value.values[name] = [...next].join(',')
}
/** Choices found for a field (its Find button), by field name. */
const found = ref<Record<string, { value: string; label: string }[]>>({})
async function find(integration: Integration, field: Field) {
  const current = form.value
  if (!current) return
  errors.value = { ...errors.value, [field.name]: '' }
  try {
    const result = await api<{ choices: { value: string; label: string }[] }>(
      'POST',
      `/admin/integrations/${integration.id}/lookup/${field.name}`,
      { values: current.values, connection: current.id },
    )
    found.value = { ...found.value, [field.name]: result.choices }
    if (result.choices.length === 0) errors.value[field.name] = t('integrations.foundNone')
  } catch (e) {
    if (e instanceof ApiError) errors.value[field.name] = e.errors[0]?.message ?? e.message
    else errors.value[field.name] = (e as Error).message
  }
}
function pick(field: Field, value: string) {
  if (form.value) form.value.values[field.name] = value
  found.value = { ...found.value, [field.name]: [] }
}

const categoryLabel = (value: string) => t(`integrations.category.${value}` as never)
const fieldLabel = (field: Field) => label(field.label, field.name)
</script>

<template>
  <section class="integrations">
    <header class="toolbar">
      <h1>{{ t('integrations.title') }}</h1>
    </header>
    <p class="muted intro">{{ t('integrations.intro') }}</p>
    <p v-if="error" class="notice notice-warning" role="alert">{{ error }}</p>
    <p v-if="data?.staleSecrets" class="notice notice-warning">{{ t('integrations.staleSecrets', { count: data.staleSecrets }) }}</p>

    <div class="filters">
      <label class="search">
        <Search :size="16" aria-hidden="true" />
        <span class="sr-only">{{ t('integrations.search') }}</span>
        <input v-model="query" type="search" class="input" autocomplete="off" :placeholder="t('integrations.searchPlaceholder')" />
      </label>
      <div class="categories" role="group" :aria-label="t('integrations.categories')">
        <button type="button" :class="['chip-btn', { on: category === null }]" :aria-pressed="category === null" @click="setCategory(null)">{{ t('integrations.all') }}</button>
        <button v-for="c in CATEGORIES.filter((c) => counts[c] || category === c)" :key="c" type="button" :class="['chip-btn', { on: category === c }]" :aria-pressed="category === c" @click="setCategory(c)">
          {{ categoryLabel(c) }} <span class="count">{{ counts[c] ?? 0 }}</span>
        </button>
      </div>
    </div>

    <template v-if="data">
      <section v-for="group in grouped ? groups : groups.length ? [{ category: null, rows: groups.flatMap((g) => g.rows) }] : []" :key="group.category ?? 'all'" class="group" :aria-labelledby="group.category ? `group-${group.category}` : undefined">
        <h2 v-if="group.category" :id="`group-${group.category}`">{{ categoryLabel(group.category) }}</h2>
        <ul class="list">
          <template v-for="row in group.rows" :key="row.key">
            <li v-if="row.kind === 'integration'" class="row">
              <IntegrationIcon :icon="row.integration.icon" :name="label(row.integration.label, row.integration.id)" />
              <div class="what">
                <strong>{{ label(row.integration.label, row.integration.id) }}</strong>
                <span class="desc">{{ label(row.integration.description ?? '', '') || row.integration.plugin }}</span>
              </div>
              <span :class="['status', `status-${statusOf(row.integration).kind}`]">
                <CheckCircle2 v-if="statusOf(row.integration).kind === 'ok'" :size="14" aria-hidden="true" />
                <CircleAlert v-else-if="statusOf(row.integration).kind === 'error'" :size="14" aria-hidden="true" />
                {{ statusOf(row.integration).text }}
              </span>
              <button
                type="button"
                :class="['btn', 'btn-sm', 'act', { 'btn-primary': row.integration.enabled && !row.integration.connections.length }]"
                :aria-label="t(row.integration.connections.length || !row.integration.enabled ? 'integrations.manageName' : 'integrations.connectName', { name: label(row.integration.label, row.integration.id) })"
                @click="open(row.integration.id)"
              >{{ row.integration.connections.length || !row.integration.enabled ? t('integrations.manage') : t('integrations.connect') }}</button>
            </li>
            <li v-else-if="row.kind === 'ai'" class="row">
              <span class="logo muted" aria-hidden="true"><Sparkles :size="18" /></span>
              <div class="what">
                <strong>{{ t('ai.row') }}</strong>
                <span class="desc">{{ aiSummary }}</span>
              </div>
              <span class="status status-ai">{{ t('ai.featuresOn', { on: ai?.features.filter((f) => f.enabled).length ?? 0, all: ai?.features.length ?? 0 }) }}</span>
              <button type="button" class="btn btn-sm act" :aria-label="t('integrations.manageName', { name: t('ai.row') })" @click="open('ai')">{{ t('integrations.manage') }}</button>
            </li>
            <li v-else class="row">
              <span class="logo muted" aria-hidden="true"><Code2 :size="18" /></span>
              <div class="what">
                <strong>{{ t(`integrations.kind.${row.service.kind}` as never) }}</strong>
                <span class="desc">{{ row.service.name }} · {{ t('integrations.inCode') }}</span>
              </div>
              <span class="status status-code">{{ t('integrations.statusCode') }}</span>
            </li>
          </template>
        </ul>
      </section>

      <section v-if="catalog.length" class="group" aria-labelledby="group-catalog">
        <h2 id="group-catalog">{{ t('integrations.catalog') }}</h2>
        <ul class="list">
          <li v-for="plugin in catalog" :key="plugin.name" class="row catalog">
            <span class="logo muted" aria-hidden="true"><Package :size="18" /></span>
            <div class="what">
              <strong>{{ plugin.name }}</strong>
              <span class="desc">{{ label(plugin.description, '') }} · <a :href="plugin.docs" target="_blank" rel="noopener">{{ t('integrations.guide') }}</a></span>
            </div>
            <span class="install">
              <code>npm install {{ plugin.name }}</code>
              <button type="button" class="btn btn-sm btn-icon" :aria-label="t('integrations.copy')" :title="t('integrations.copy')" @click="copy(`npm install ${plugin.name}`)"><Copy :size="14" aria-hidden="true" /></button>
            </span>
          </li>
        </ul>
      </section>

      <p v-if="!groups.length && !catalog.length" class="empty muted">{{ t('integrations.noMatch', { query }) }}</p>
    </template>

    <Teleport to="body">
      <dialog ref="drawer" class="drawer" :aria-labelledby="opened ? 'drawer-title' : undefined" @cancel.prevent="close" @click="onDrawerClick" @close="opened && close()">
        <div v-if="opened === 'ai'" class="panel">
          <header class="panel-header">
            <span class="logo muted" aria-hidden="true"><Sparkles :size="18" /></span>
            <div class="grow"><h2 id="drawer-title">{{ t('ai.row') }}</h2><p class="muted small">{{ categoryLabel('ai') }}</p></div>
            <button type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('integrations.close')" @click="close"><X :size="18" aria-hidden="true" /></button>
          </header>
          <div class="panel-body">
            <AiSettings :version="version" @changed="loadAi" />
          </div>
        </div>
        <div v-else-if="openIntegration" class="panel">
          <header class="panel-header">
            <IntegrationIcon :icon="openIntegration.icon" :name="label(openIntegration.label, openIntegration.id)" />
            <div class="grow">
              <h2 id="drawer-title">{{ label(openIntegration.label, openIntegration.id) }}</h2>
              <p class="muted small">{{ categoryLabel(openIntegration.category) }}<template v-if="openIntegration.plugin"> · {{ openIntegration.plugin }}</template></p>
            </div>
            <label class="switch">
              <input type="checkbox" role="switch" :checked="openIntegration.enabled" :aria-label="t('integrations.enable', { name: label(openIntegration.label, openIntegration.id) })" @change="toggle(openIntegration)" />
              <span>{{ t(openIntegration.enabled ? 'integrations.on' : 'integrations.off') }}</span>
            </label>
            <button type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('integrations.close')" @click="close"><X :size="18" aria-hidden="true" /></button>
          </header>
          <div v-for="integration in [openIntegration]" :key="integration.id" class="panel-body">
            <p v-if="integration.description || integration.docs" class="description">
              {{ label(integration.description ?? '', '') }}
              <a v-if="integration.docs" :href="integration.docs" target="_blank" rel="noopener" class="docs">{{ t('integrations.guide') }} <ExternalLink :size="13" aria-hidden="true" /></a>
            </p>
            <p v-if="integration.consented" class="muted small">{{ t('integrations.consentedBy', { who: integration.consented.by, date: formatDate(integration.consented.at) }) }}</p>

            <section v-if="integration.app" class="app-keys" :aria-labelledby="`app-${integration.id}`">
              <h3 :id="`app-${integration.id}`">{{ t('integrations.appKeys') }}</h3>
              <template v-if="!appOpen">
                <p class="muted small">
                  <CheckCircle2 v-if="integration.app.complete" :size="13" aria-hidden="true" />
                  {{ integration.app.complete ? t('integrations.appSet') : t('integrations.appMissing') }}
                  <button v-if="integration.app.envFields.length < integration.app.fields.length" type="button" class="btn btn-sm btn-ghost" @click="appOpen = true">{{ t('integrations.edit') }}</button>
                </p>
              </template>
              <form v-else class="connect" novalidate @submit.prevent="saveApp(integration)">
                <p class="muted small">{{ t('integrations.appHint') }}</p>
                <label class="field">
                  <span class="field-label">{{ t('integrations.redirectUri') }}</span>
                  <span class="copy-row">
                    <code>{{ integration.app.redirectUri }}</code>
                    <button type="button" class="btn btn-sm btn-icon" :aria-label="t('integrations.copy')" :title="t('integrations.copy')" @click="copy(integration.app.redirectUri)"><Copy :size="14" aria-hidden="true" /></button>
                  </span>
                </label>
                <label v-for="field in integration.app.fields" :key="field.name" class="field">
                  <span class="field-label">{{ label(field.label ?? field.name, field.name) }}<span v-if="field.required" class="field-required" aria-hidden="true">*</span></span>
                  <input
                    v-model="appForm[field.name]"
                    class="input"
                    :type="field.secret ? 'password' : 'text'"
                    autocomplete="off"
                    :disabled="integration.app.envFields.includes(field.name)"
                    :placeholder="integration.app.envFields.includes(field.name) ? t('integrations.fromEnv') : field.secret && integration.app.values[field.name] ? integration.app.values[field.name] : ''"
                  />
                  <span v-if="appErrors[field.name]" class="field-error" role="alert">{{ appErrors[field.name] }}</span>
                </label>
                <div class="actions end">
                  <button v-if="integration.app.complete" type="button" class="btn btn-ghost" @click="appOpen = false">{{ t('common.cancel') }}</button>
                  <button type="submit" class="btn btn-primary" :disabled="appSaving">{{ t('integrations.save') }}</button>
                </div>
              </form>
            </section>

            <section :aria-labelledby="`conn-${integration.id}`">
              <h3 :id="`conn-${integration.id}`">{{ t('integrations.connections') }}</h3>
              <ul v-if="integration.connections.length" class="connections">
                <li v-for="connection in integration.connections" :key="String(connection.id)" class="connection">
                  <div class="who">
                    <strong>{{ connection.name }}</strong>
                    <span v-if="connection.isDefault" class="badge"><Star :size="11" aria-hidden="true" /> {{ t('integrations.default') }}</span>
                    <span v-if="connection.env" class="badge">{{ t('integrations.fromEnv') }}</span>
                    <span v-if="connection.account" class="muted small">{{ connection.account }}</span>
                  </div>
                  <div class="meta small">
                    <span v-if="connection.lastError" class="error"><CircleAlert :size="13" aria-hidden="true" /> {{ connection.lastError }}</span>
                    <span v-else-if="connection.lastUsedAt" class="muted"><CheckCircle2 :size="13" aria-hidden="true" /> {{ t('integrations.lastUsed', { date: formatDate(connection.lastUsedAt) }) }}</span>
                    <span v-if="connection.usage" class="muted">{{ t('ai.usage', { requests: connection.usage.requests.toLocaleString(), tokens: (connection.usage.input + connection.usage.output).toLocaleString() }) }}</span>
                  </div>
                  <div class="actions">
                    <button v-if="integration.testable" type="button" class="btn btn-sm" @click="test(integration, connection)">{{ t('integrations.test') }}</button>
                    <template v-if="!connection.env">
                      <button v-if="!connection.isDefault" type="button" class="btn btn-sm btn-ghost" @click="makeDefault(integration, connection)">{{ t('integrations.makeDefault') }}</button>
                      <button type="button" class="btn btn-sm btn-ghost" @click="startEditing(integration, connection)">{{ t('integrations.edit') }}</button>
                      <button type="button" class="btn btn-sm btn-ghost danger" :aria-label="t('integrations.disconnectName', { name: connection.name })" @click="disconnect(integration, connection)"><Trash2 :size="14" aria-hidden="true" /> {{ t('integrations.disconnect') }}</button>
                    </template>
                  </div>
                </li>
              </ul>
              <p v-else class="muted small">{{ t('integrations.none') }}</p>
            </section>

            <div v-if="consenting === integration.id && integration.consent" class="consent" role="group" :aria-label="t('integrations.consentTitle')">
              <strong>{{ t('integrations.consentTitle') }}</strong>
              <p>{{ label(integration.consent.text, '') }}</p>
              <a v-if="integration.consent.policy" :href="integration.consent.policy" target="_blank" rel="noopener" class="docs">{{ t('integrations.policy') }} <ExternalLink :size="13" aria-hidden="true" /></a>
              <div class="actions end">
                <button type="button" class="btn btn-ghost" @click="consenting = null">{{ t('common.cancel') }}</button>
                <button type="button" class="btn btn-primary" @click="accept(integration)">{{ t('integrations.accept') }}</button>
              </div>
            </div>

            <form v-if="form?.integration === integration.id" class="connect" novalidate @submit.prevent="submit(integration)">
              <label class="field">
                <span class="field-label">{{ t('integrations.name') }}<span class="field-required" aria-hidden="true">*</span></span>
                <input v-model="form.name" class="input" maxlength="60" required />
                <span v-if="errors.name" class="field-error">{{ errors.name }}</span>
              </label>
              <template v-if="integration.kind === 'fields'">
                <template v-for="field in integration.fields" :key="field.name">
                  <fieldset v-if="field.type === 'multiselect'" class="field ticks">
                    <legend class="field-label">{{ fieldLabel(field) }}</legend>
                    <label v-for="o in field.options ?? []" :key="optionValue(o)" class="tick">
                      <input type="checkbox" :checked="ticked(field.name).includes(optionValue(o))" @change="tick(field.name, optionValue(o), ($event.target as HTMLInputElement).checked)" />
                      {{ optionLabel(o) }}
                    </label>
                    <span v-if="field.description" class="field-hint">{{ label(field.description, '') }}</span>
                  </fieldset>
                  <label v-else class="field">
                    <span class="field-label">{{ fieldLabel(field) }}<span v-if="field.required && form.id === null" class="field-required" aria-hidden="true">*</span></span>
                    <span v-if="integration.envFields.includes(field.name)" class="field-hint">{{ t('integrations.fieldFromEnv') }}</span>
                    <select v-if="field.type === 'select'" v-model="form.values[field.name]" class="input">
                      <option v-if="!field.required" value="">—</option>
                      <option v-for="o in field.options ?? []" :key="optionValue(o)" :value="optionValue(o)">{{ optionLabel(o) }}</option>
                    </select>
                    <textarea v-else-if="field.type === 'textarea'" v-model="form.values[field.name]" class="textarea" />
                    <span v-else class="with-find">
                      <input
                        v-model="form.values[field.name]"
                        class="input"
                        :type="field.secret ? 'password' : field.type === 'url' ? 'url' : 'text'"
                        :autocomplete="field.secret ? 'off' : undefined"
                        :placeholder="field.secret && form.id !== null ? t('integrations.keepSecret') : field.placeholder"
                      />
                      <button v-if="field.findable" type="button" class="btn find" @click="find(integration, field)">{{ t('integrations.find', { name: fieldLabel(field) }) }}</button>
                    </span>
                    <span v-if="found[field.name]?.length" class="choices" role="group" :aria-label="t('integrations.foundFor', { name: fieldLabel(field) })">
                      <button v-for="choice in found[field.name]" :key="choice.value" type="button" class="btn btn-sm btn-ghost" @click="pick(field, choice.value)">{{ choice.label }}</button>
                    </span>
                    <span v-if="field.description" class="field-hint">{{ label(field.description, '') }}</span>
                    <span v-if="errors[field.name]" class="field-error">{{ errors[field.name] }}</span>
                  </label>
                </template>
              </template>
              <p v-if="errors.values || errors['']" class="field-error" role="alert">{{ errors.values ?? errors[''] }}</p>
              <div class="actions end">
                <button type="button" class="btn btn-ghost" @click="form = null">{{ t('common.cancel') }}</button>
                <button type="submit" class="btn btn-primary" :disabled="busy">
                  {{ integration.kind === 'oauth' && form.id === null ? t('integrations.connectWith', { name: label(integration.label, integration.id) }) : t('integrations.save') }}
                </button>
              </div>
            </form>
            <button v-else-if="integration.enabled && consenting !== integration.id" type="button" class="btn add" :disabled="!!integration.app && !integration.app.complete" @click="startAdding(integration)">
              <Plus :size="14" aria-hidden="true" /> {{ t('integrations.add') }}
            </button>
          </div>
        </div>
      </dialog>
    </Teleport>

    <div v-if="choosing" class="choose card" role="dialog" aria-modal="false" :aria-label="t('integrations.chooseAccount')">
      <h2>{{ t('integrations.chooseAccount') }}</h2>
      <ul>
        <li v-for="account in choosing.accounts" :key="account.id">
          <button type="button" class="btn" @click="choose(account.id)">{{ account.name }}</button>
        </li>
      </ul>
      <button type="button" class="btn btn-ghost" @click="choosing = null">{{ t('common.cancel') }}</button>
    </div>
  </section>
</template>

<style scoped>
.app-keys {
  margin-bottom: 1rem;
}
.copy-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.copy-row code {
  overflow-wrap: anywhere;
  font-size: 0.8125rem;
}
.intro {
  margin: 0 0 1rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.filters {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.search {
  position: relative;
  max-width: 26rem;
}
.search :deep(svg) {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--faint);
}
.search .input {
  padding-left: 2.3rem;
}
.categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.25rem;
  padding: 0 0.85rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.chip-btn .count {
  color: var(--faint);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.chip-btn.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.chip-btn.on .count {
  color: inherit;
}
.group {
  margin-bottom: 1.5rem;
}
.group h2 {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--faint);
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.row {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr) auto auto;
  gap: 0.9rem;
  align-items: center;
  min-height: 4rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
}
.row:first-child {
  border-top: 0;
}
.logo {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 700;
}
.logo.muted {
  background: var(--surface-2);
  color: var(--text-muted);
  border: 1px solid var(--border);
}
.what {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.desc {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 0.875rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.status-ok {
  background: var(--success-soft);
  color: var(--ok);
}
.status-error {
  background: var(--danger-soft);
  color: var(--danger);
}
.status-off {
  background: var(--surface-2);
  color: var(--text-muted);
}
.status-none {
  color: var(--faint);
  font-weight: 500;
}
.status-code {
  background: var(--info-soft);
  color: var(--info);
}
.status-ai {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.install {
  display: flex;
  grid-column: 3 / span 2;
  align-items: center;
  gap: 0.4rem;
}
.install code {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 0.8rem;
  white-space: nowrap;
}
.empty {
  padding: 2rem 1rem;
  text-align: center;
}
@media (max-width: 640px) {
  .row {
    grid-template-columns: 2.5rem minmax(0, 1fr) auto;
    row-gap: 0.4rem;
  }
  .row .status {
    grid-column: 2;
    justify-self: start;
  }
  .row .act {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
  .desc {
    white-space: normal;
  }
  .install {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }
  .install code {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}

/* The drawer, like a small collection's (DocumentDrawer). */
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
  width: min(32rem, 100vw);
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
  gap: 0.75rem;
  padding: 0.85rem 1rem 0.85rem 1.25rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.panel-header h2 {
  margin: 0;
  overflow: hidden;
  font-size: 1.1rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.panel-header p {
  margin: 0;
}
.grow {
  flex: 1;
  min-width: 0;
}
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  flex-grow: 1;
  overflow-y: auto;
  padding: 1.25rem;
}
.panel-body p {
  margin: 0;
}
.panel-body h3 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
}
.small {
  font-size: 0.85rem;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
}
.docs {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.9rem;
}
.connections {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.connection {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.who,
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
}
.who {
  gap: 0.4rem;
}
.meta span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--accent-soft);
  font-size: 0.75rem;
}
.error {
  color: var(--danger);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.actions.end {
  justify-content: flex-end;
}
.danger {
  color: var(--danger);
}
.consent,
.connect {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.9rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.with-find {
  display: flex;
  gap: 0.4rem;
}
.with-find .input {
  flex: 1;
  min-width: 0;
}
.add {
  align-self: flex-start;
}
.ticks {
  margin: 0;
  padding: 0;
  border: 0;
}
.tick {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.choose {
  position: fixed;
  z-index: 40;
  right: 1.5rem;
  bottom: 1.5rem;
  width: min(22rem, calc(100vw - 2rem));
  padding: 1rem;
  box-shadow: var(--shadow);
}
.choose ul {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.5rem 0 1rem;
  padding: 0;
  list-style: none;
}
</style>
