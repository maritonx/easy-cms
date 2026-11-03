<script setup lang="ts">
import type { Label } from '@easy-cms/core'
import { CheckCircle2, CircleAlert, ExternalLink, Plug, Plus, Star, Trash2 } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '../lib/api'
import { formatDate, label, t } from '../lib/i18n'
import { notify } from '../lib/toast'

/** Settings → Integrations (#311): plugins' providers by category, and the accounts connected. */

type Category = 'social' | 'ai' | 'notifications' | 'automation'
interface Field {
  name: string
  label?: Label
  description?: Label
  type?: 'text' | 'url' | 'textarea' | 'select'
  options?: string[]
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
}
interface Integration {
  id: string
  label: Label
  category: Category
  description?: Label
  docs?: string
  plugin?: string
  kind: 'fields' | 'oauth'
  fields: Field[]
  enabled: boolean
  envFields: string[]
  testable: boolean
  connections: Connection[]
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
const CATEGORIES: (Category | 'code')[] = ['social', 'ai', 'notifications', 'automation', 'code']
const category = computed(() => {
  const value = route.query.category
  return typeof value === 'string' && (CATEGORIES as string[]).includes(value) ? value : null
})
function setCategory(value: string | null) {
  void router.replace({ query: value ? { category: value } : {} })
}
const shown = computed(() =>
  (data.value?.integrations ?? []).filter((i) => !category.value || i.category === category.value),
)
const catalog = computed(() =>
  (data.value?.catalog ?? []).filter((p) => !category.value || p.category === category.value),
)
const showCode = computed(() => !category.value || category.value === 'code')

async function load() {
  try {
    data.value = await api<Overview>('GET', '/admin/integrations')
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
function startAdding(integration: Integration) {
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

    <div class="categories" role="group" :aria-label="t('integrations.categories')">
      <button type="button" :class="['chip-btn', { on: category === null }]" :aria-pressed="category === null" @click="setCategory(null)">{{ t('integrations.all') }}</button>
      <button v-for="c in CATEGORIES" :key="c" type="button" :class="['chip-btn', { on: category === c }]" :aria-pressed="category === c" @click="setCategory(c)">{{ categoryLabel(c) }}</button>
    </div>

    <div v-if="data" class="grid">
      <article v-for="integration in shown" :key="integration.id" class="card integration" :aria-labelledby="`int-${integration.id}`">
        <header class="head">
          <div>
            <h2 :id="`int-${integration.id}`"><Plug :size="16" aria-hidden="true" /> {{ label(integration.label, integration.id) }}</h2>
            <p class="muted small">{{ categoryLabel(integration.category) }}<template v-if="integration.plugin"> · {{ integration.plugin }}</template></p>
          </div>
          <label class="switch">
            <input type="checkbox" role="switch" :checked="integration.enabled" :aria-label="t('integrations.enable', { name: label(integration.label, integration.id) })" @change="toggle(integration)" />
            <span>{{ t(integration.enabled ? 'integrations.on' : 'integrations.off') }}</span>
          </label>
        </header>
        <p v-if="integration.description" class="description">{{ label(integration.description, '') }}</p>
        <a v-if="integration.docs" :href="integration.docs" target="_blank" rel="noopener" class="docs">{{ t('integrations.guide') }} <ExternalLink :size="13" aria-hidden="true" /></a>

        <ul v-if="integration.connections.length" class="connections">
          <li v-for="connection in integration.connections" :key="String(connection.id)" class="connection">
            <div class="who">
              <strong>{{ connection.name }}</strong>
              <span v-if="connection.isDefault" class="badge"><Star :size="11" aria-hidden="true" /> {{ t('integrations.default') }}</span>
              <span v-if="connection.env" class="badge">{{ t('integrations.fromEnv') }}</span>
              <span v-if="connection.account" class="muted small">{{ connection.account }}</span>
              <span v-if="connection.lastError" class="error small"><CircleAlert :size="13" aria-hidden="true" /> {{ connection.lastError }}</span>
              <span v-else-if="connection.lastUsedAt" class="muted small"><CheckCircle2 :size="13" aria-hidden="true" /> {{ t('integrations.lastUsed', { date: formatDate(connection.lastUsedAt) }) }}</span>
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

        <form v-if="form?.integration === integration.id" class="connect" novalidate @submit.prevent="submit(integration)">
          <label class="field">
            <span class="field-label">{{ t('integrations.name') }}<span class="field-required" aria-hidden="true">*</span></span>
            <input v-model="form.name" class="input" maxlength="60" required />
            <span v-if="errors.name" class="field-error">{{ errors.name }}</span>
          </label>
          <template v-if="integration.kind === 'fields'">
            <label v-for="field in integration.fields" :key="field.name" class="field">
              <span class="field-label">{{ fieldLabel(field) }}<span v-if="field.required && form.id === null" class="field-required" aria-hidden="true">*</span></span>
              <span v-if="integration.envFields.includes(field.name)" class="field-hint">{{ t('integrations.fieldFromEnv') }}</span>
              <select v-if="field.type === 'select'" v-model="form.values[field.name]" class="input">
                <option v-for="o in field.options ?? []" :key="o" :value="o">{{ o }}</option>
              </select>
              <textarea v-else-if="field.type === 'textarea'" v-model="form.values[field.name]" class="textarea" />
              <input
                v-else
                v-model="form.values[field.name]"
                class="input"
                :type="field.secret ? 'password' : field.type === 'url' ? 'url' : 'text'"
                :autocomplete="field.secret ? 'off' : undefined"
                :placeholder="field.secret && form.id !== null ? t('integrations.keepSecret') : field.placeholder"
              />
              <span v-if="field.description" class="field-hint">{{ label(field.description, '') }}</span>
              <span v-if="errors[field.name]" class="field-error">{{ errors[field.name] }}</span>
            </label>
          </template>
          <p v-if="errors.values || errors['']" class="field-error" role="alert">{{ errors.values ?? errors[''] }}</p>
          <div class="actions">
            <button type="button" class="btn btn-ghost" @click="form = null">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="busy">
              {{ integration.kind === 'oauth' && form.id === null ? t('integrations.connectWith', { name: label(integration.label, integration.id) }) : t('integrations.save') }}
            </button>
          </div>
        </form>
        <button v-else-if="integration.enabled" type="button" class="btn btn-sm add" @click="startAdding(integration)">
          <Plus :size="14" aria-hidden="true" /> {{ t('integrations.add') }}
        </button>
      </article>

      <template v-if="showCode">
        <article v-for="service in data.configured" :key="service.id" class="card integration readonly">
          <h2><Plug :size="16" aria-hidden="true" /> {{ t(`integrations.kind.${service.kind}` as never) }}</h2>
          <p class="muted small">{{ categoryLabel('code') }}</p>
          <p>{{ service.name }}</p>
          <p class="muted small">{{ t('integrations.inCode') }}</p>
        </article>
      </template>

      <article v-for="plugin in catalog" :key="plugin.name" class="card integration readonly">
        <h2><Plug :size="16" aria-hidden="true" /> {{ plugin.name }}</h2>
        <p class="description">{{ label(plugin.description, '') }}</p>
        <p class="muted small">{{ t('integrations.install') }}</p>
        <code class="install">npm install {{ plugin.name }}</code>
        <a :href="plugin.docs" target="_blank" rel="noopener" class="docs">{{ t('integrations.guide') }} <ExternalLink :size="13" aria-hidden="true" /></a>
      </article>
    </div>

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
.intro {
  margin: 0 0 1rem;
}
.categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
}
.chip-btn {
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
.chip-btn.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
  gap: 1rem;
  align-items: start;
}
.integration {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.1rem;
}
.integration h2 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 1.05rem;
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}
.head p,
.integration p {
  margin: 0;
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
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.connection {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.who {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
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
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--danger);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.danger {
  color: var(--danger);
}
.connect {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.add {
  align-self: flex-start;
}
.readonly {
  background: var(--surface-2);
}
.install {
  font-family: var(--mono);
  font-size: 0.85rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow-wrap: anywhere;
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
  list-style: none;
  margin: 0.5rem 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
</style>
