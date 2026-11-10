<script setup lang="ts">
import type { AdminEmail, EmailCheck } from '@easy-cms/core'
import {
  ChevronDown,
  ChevronRight,
  Mail,
  PlugZap,
  RotateCcw,
  Send,
  TriangleAlert,
  X,
} from '@lucide/vue'
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmailLog from '../components/EmailLog.vue'
import EmailSuppressions from '../components/EmailSuppressions.vue'
import PanelSkeleton from '../components/PanelSkeleton.vue'
import { ApiError, api } from '../lib/api'
import { locale, t } from '../lib/i18n'
import { useDelayedLoading } from '../lib/loading'
import { session } from '../lib/session'
import { notify } from '../lib/toast'

/**
 * Settings → Email (admins): what sends, in one line, with a test in a dialog; then the emails
 * sent and the blocked addresses in tabs (`?tab=blocked`).
 */
const email = ref<AdminEmail | null>(null)
/** A skeleton while the page loads (only when it is slow). */
const showSkeleton = useDelayedLoading(() => !email.value)
const failed = ref('')
const to = ref(session.user?.email ?? '')
const toId = useId()
const busy = ref<'verify' | 'test' | null>(null)
const verifyResult = ref<EmailCheck | null>(null)
const testResult = ref<(EmailCheck & { to: string }) | null>(null)

async function load() {
  try {
    email.value = await api<AdminEmail>('GET', '/admin/email')
  } catch (e) {
    failed.value = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
  }
}
onMounted(load)

/** Back to the config's `email` from the provider chosen on the Integrations page (#404). */
const reverting = ref(false)
async function useCode() {
  const code = email.value?.providers?.code
  if (!window.confirm(code ? t('email.confirmUseCode', { name: code }) : t('email.confirmUseNone')))
    return
  reverting.value = true
  try {
    await api('PUT', '/admin/email/provider', {})
    notify('success', t('email.usingCode'))
    await load()
  } catch (e) {
    notify('error', e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e))
  } finally {
    reverting.value = false
  }
}

const KEYS: Record<string, Parameters<typeof t>[0]> = {
  host: 'email.host',
  port: 'email.port',
  secure: 'email.secure',
  user: 'email.user',
  password: 'email.password',
  from: 'email.from',
  delivery: 'email.delivery',
}
const labelOf = (key: string) => (KEYS[key] ? t(KEYS[key]) : key)
const shown = (key: string, value: string | null) => {
  if (value === null) return t('email.notSet')
  if (key === 'password' && value === 'set') return t('email.passwordSet')
  if (key === 'delivery' && value === 'log') return t('email.deliveryLog')
  if (key === 'secure') return value === 'true' ? t('email.secureTls') : t('email.secureStarttls')
  return value
}

/** A hint for the errors SMTP servers give most often. */
function hintFor(error: string): string | null {
  if (/535|EAUTH|auth|invalid login|username and password/i.test(error)) return t('email.hintAuth')
  if (/wrong version number|ssl|tls|EPROTO|certificate/i.test(error)) return t('email.hintTls')
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|getaddrinfo|timeout|timed out/i.test(error))
    return t('email.hintConnect')
  if (/\b55[0-4]\b|sender|not allowed to send|from address/i.test(error))
    return t('email.hintSender')
  if (/set `host`|SMTP_HOST/.test(error)) return t('email.hintHost')
  return null
}

async function verify() {
  busy.value = 'verify'
  verifyResult.value = null
  try {
    verifyResult.value = await api<EmailCheck>('POST', '/admin/email/verify')
  } catch (e) {
    verifyResult.value = { ok: false, error: e instanceof ApiError ? e.message : String(e) }
  } finally {
    busy.value = null
  }
}
async function sendTest() {
  busy.value = 'test'
  testResult.value = null
  const address = to.value.trim()
  try {
    const result = await api<EmailCheck>('POST', '/admin/email/test', {
      to: address,
      locale: locale.value,
    })
    testResult.value = { ...result, to: address }
  } catch (e) {
    const message = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
    testResult.value = { ok: false, error: message, to: address }
  } finally {
    busy.value = null
  }
}

/** The adapter prints emails to the server log, as `consoleEmail()` does: nothing is sent. */
const logsOnly = computed(
  () => !!email.value?.settings.some((s) => s.key === 'delivery' && s.value === 'log'),
)

const docs = computed(() => `https://easycms.dev${locale.value === 'th' ? '/th' : ''}/docs/email`)

/** The adapter's name, or the provider an admin chose. */
const sender = computed(() => {
  const value = email.value
  if (!value) return ''
  if (value.providers?.active) return value.providers.active.label
  return value.name ?? value.providers?.code ?? ''
})
const fromAddress = computed(
  () => email.value?.settings.find((s) => s.key === 'from')?.value ?? email.value?.from ?? null,
)
const details = ref(false)

// Tabs: the emails sent, and the addresses that get none.
const route = useRoute()
const router = useRouter()
type Tab = 'sent' | 'blocked'
const tab = computed<Tab>(() =>
  route.query.tab === 'blocked' && email.value?.suppressions ? 'blocked' : 'sent',
)
const blockedQuery = ref(typeof route.query.q === 'string' ? route.query.q : '')
function setTab(value: Tab) {
  void router.replace({ query: value === 'blocked' ? { tab: 'blocked' } : {} })
}
/** A bounced or skipped email's address, found in the blocked list. */
function showBlocked(address: string) {
  blockedQuery.value = address
  setTab('blocked')
}
function onTabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next: Tab =
    event.key === 'Home'
      ? 'sent'
      : event.key === 'End'
        ? 'blocked'
        : tab.value === 'sent'
          ? 'blocked'
          : 'sent'
  setTab(next)
  void nextTick(() => document.getElementById(`tab-${next}`)?.focus())
}

// The test, in a dialog.
const testDialog = ref<HTMLDialogElement>()
function openTest() {
  verifyResult.value = null
  testResult.value = null
  testDialog.value?.showModal()
  // Straight to the address.
  void nextTick(() => document.getElementById(toId)?.focus())
}
watch(
  () => route.query.tab,
  () => {
    if (route.query.tab !== 'blocked') blockedQuery.value = ''
  },
)
</script>

<template>
  <p v-if="!session.schema?.views.email" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <nav class="crumbs" :aria-label="t('list.breadcrumb')">
      <span>{{ t('nav.globals') }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
      <span class="current">{{ t('email.title') }}</span>
    </nav>
    <header class="page-header">
      <h1>{{ t('email.title') }}</h1>
      <p class="muted">{{ t('email.lead') }}</p>
    </header>

    <p v-if="failed" class="field-error">{{ failed }}</p>
    <PanelSkeleton v-else-if="showSkeleton" />
    <template v-else-if="!email" />

    <section v-else-if="!email.configured" class="card panel">
      <h2>{{ t('email.notSetUp') }}</h2>
      <template v-if="email.providers">
        <p>{{ t('email.chooseProviderText') }}</p>
        <RouterLink to="/integrations?category=email" class="btn btn-primary">{{ t('email.chooseProvider') }}</RouterLink>
      </template>
      <template v-else>
        <p>{{ t('email.notSetUpText') }}</p>
        <a :href="docs" target="_blank" rel="noopener">{{ t('email.howToSetUp') }}</a>
      </template>
    </section>

    <template v-else>
      <section id="email-summary" class="card summary" :aria-label="t('email.settings')">
        <div class="line">
          <span class="icon" aria-hidden="true"><Mail :size="18" /></span>
          <div class="what">
            <span class="top">
              <span class="muted small">{{ t('email.sendsWith') }}</span>
              <strong class="name">{{ sender }}</strong>
              <span v-if="email.providers" :class="['chip', { admin: email.providers.active }]">{{ email.providers.active ? t('email.sourceAdmin') : t('email.sourceCode') }}</span>
            </span>
            <span v-if="fromAddress" class="muted small from">{{ t('email.fromShort', { from: fromAddress }) }}</span>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-sm btn-primary" @click="openTest"><Send :size="14" aria-hidden="true" /> {{ t('email.sendTest') }}</button>
            <RouterLink v-if="email.providers" to="/integrations?category=email" class="btn btn-sm">{{ t('email.changeShort') }}</RouterLink>
            <button v-if="email.providers?.active" type="button" class="btn btn-sm btn-ghost" :disabled="reverting" @click="useCode"><RotateCcw :size="14" aria-hidden="true" /> {{ email.providers.code ? t('email.useCode') : t('email.useNone') }}</button>
            <button type="button" class="btn btn-sm btn-ghost" :aria-expanded="details" aria-controls="email-details" @click="details = !details">{{ t('email.details') }} <ChevronDown :size="14" :class="{ flip: details }" aria-hidden="true" /></button>
          </div>
        </div>
        <p v-if="logsOnly" class="warning" role="note">
          <TriangleAlert :size="15" aria-hidden="true" />
          <span>{{ t('email.logOnly') }} · <a :href="docs" target="_blank" rel="noopener">{{ t('email.howToSetUp') }}</a></span>
        </p>
        <div v-show="details" id="email-details" class="details">
          <dl>
            <dt>{{ t('email.adapter') }}</dt>
            <dd>{{ email.name }}</dd>
            <template v-for="s in email.settings" :key="s.key">
              <dt>{{ labelOf(s.key) }}</dt>
              <dd>
                <span :class="{ muted: s.value === null }">{{ shown(s.key, s.value) }}</span>
                <code v-if="s.source" class="source">{{ s.source }}</code>
              </dd>
            </template>
            <template v-if="!email.settings.some((s) => s.key === 'from')">
              <dt>{{ t('email.from') }}</dt>
              <dd :class="{ muted: !email.from }">{{ email.from ?? t('email.notSet') }}</dd>
            </template>
          </dl>
          <p v-if="!email.providers" class="note muted">
            {{ t('email.change') }}
            <a :href="docs" target="_blank" rel="noopener">{{ t('email.howToSetUp') }}</a>
          </p>
        </div>
      </section>

      <div class="tabcard">
      <div v-if="email.suppressions" class="tabs" role="tablist" :aria-label="t('email.lists')" @keydown="onTabKey">
        <button id="tab-sent" type="button" role="tab" :aria-selected="tab === 'sent'" aria-controls="panel-sent" :tabindex="tab === 'sent' ? 0 : -1" :class="{ on: tab === 'sent' }" @click="setTab('sent')">
          {{ t('emailLog.title') }}
          <span v-if="email.counts.problems" class="count bad" :title="t('email.problems', { count: email.counts.problems })">{{ email.counts.problems }}<span class="sr-only"> {{ t('email.problems', { count: email.counts.problems }) }}</span></span>
        </button>
        <button id="tab-blocked" type="button" role="tab" :aria-selected="tab === 'blocked'" aria-controls="panel-blocked" :tabindex="tab === 'blocked' ? 0 : -1" :class="{ on: tab === 'blocked' }" @click="setTab('blocked')">
          {{ t('suppressions.title') }}
          <span v-if="email.counts.blocked" class="count">{{ email.counts.blocked }}</span>
        </button>
      </div>
      <div v-if="!email.suppressions || tab === 'sent'" id="panel-sent" :role="email.suppressions ? 'tabpanel' : undefined" aria-labelledby="tab-sent" class="panel-tab">
        <EmailLog :blocked="email.suppressions" @blocked="showBlocked" />
      </div>
      <div v-else id="panel-blocked" role="tabpanel" aria-labelledby="tab-blocked" class="panel-tab">
        <EmailSuppressions :query="blockedQuery" @changed="load" />
      </div>
      </div>

      <dialog ref="testDialog" class="dialog card" aria-labelledby="test-heading" @click="($event.target as HTMLElement) === testDialog && testDialog?.close()">
        <header class="dialog-head">
          <h2 id="test-heading">{{ t('email.testTitle') }}</h2>
          <button type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="t('integrations.close')" @click="testDialog?.close()"><X :size="18" aria-hidden="true" /></button>
        </header>
        <form class="block" @submit.prevent="sendTest">
          <label :for="toId" class="field-label">{{ t('email.sendTo') }}</label>
          <div class="row">
            <input :id="toId" v-model="to" class="input" type="email" autocomplete="email" required />
            <button type="submit" class="btn btn-primary" :disabled="!!busy || !to.trim()">
              <Send :size="16" aria-hidden="true" />
              {{ busy === 'test' ? t('email.sending') : t('email.send') }}
            </button>
          </div>
          <p class="muted hint">{{ t('email.testText') }}</p>
          <div v-if="testResult" class="result" :class="!testResult.ok ? 'bad' : testResult.logged ? 'warn' : 'ok'" role="status">
            <template v-if="testResult.ok && testResult.logged">
              <strong>{{ t('email.loggedTo', { to: testResult.to }) }}</strong>
              <span>{{ t('email.loggedHelp') }}</span>
            </template>
            <template v-else-if="testResult.ok">
              <strong>{{ t('email.sentTo', { to: testResult.to }) }}</strong>
              <span>{{ t('email.sentCheck') }}</span>
            </template>
            <template v-else>
              <strong>{{ t('email.sendFailed') }}</strong>
              <code>{{ testResult.error }}</code>
              <span v-if="hintFor(testResult.error)">{{ hintFor(testResult.error) }}</span>
            </template>
          </div>
        </form>
        <div v-if="email.canVerify" class="block">
          <p class="muted">{{ t('email.verifyText') }}</p>
          <button type="button" class="btn" :disabled="!!busy" @click="verify">
            <PlugZap :size="16" aria-hidden="true" />
            {{ busy === 'verify' ? t('email.checking') : t('email.verify') }}
          </button>
          <div v-if="verifyResult" class="result" :class="verifyResult.ok ? 'ok' : 'bad'" role="status">
            <strong>{{ verifyResult.ok ? t('email.verifyOk') : t('email.verifyFailed') }}</strong>
            <template v-if="!verifyResult.ok">
              <code>{{ verifyResult.error }}</code>
              <span v-if="hintFor(verifyResult.error)">{{ hintFor(verifyResult.error) }}</span>
            </template>
          </div>
        </div>
        <RouterLink v-if="session.schema?.deliveries?.email" to="/deliveries?kind=email" class="more">{{ t('email.deliveries') }} →</RouterLink>
      </dialog>
    </template>
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
  margin-bottom: 1.25rem;
}
.page-header p {
  margin: 0.3rem 0 0;
}
.panel {
  padding: 1rem 1.1rem 1.1rem;
}
.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
}
.summary {
  padding: 0.75rem 1rem;
}
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 0.9rem;
}
.icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--brand);
}
.what {
  display: flex;
  flex: 1 1 16rem;
  flex-direction: column;
  min-width: 0;
}
.what .top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.5rem;
}
.name {
  font-size: 1rem;
}
.chip {
  padding: 0 0.5rem;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1.25rem;
}
.chip.admin {
  background: var(--accent-soft);
  color: var(--brand);
}
.from {
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.flip {
  transform: rotate(180deg);
}
.warning {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.875rem;
}
.warning svg {
  margin-top: 0.15rem;
}
.details {
  margin-top: 0.8rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--border);
}
dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.45rem 1rem;
  margin: 0;
  font-size: 0.875rem;
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.source {
  margin-left: 0.4rem;
  color: var(--faint);
  font-size: 0.75rem;
}
.note {
  margin: 0.9rem 0 0;
  font-size: 0.85rem;
}
.tabcard {
  margin-top: 1.25rem;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: var(--surface);
}
.tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0 0.75rem;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: -1px;
  padding: 0.8rem 0.75rem 0.7rem;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.tabs button:hover {
  color: var(--text);
}
.tabs button.on {
  border-bottom-color: var(--brand);
  color: var(--text);
  font-weight: 600;
}
.tabs button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}
.count {
  min-width: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.25rem;
  text-align: center;
}
.count.bad {
  background: var(--danger-soft);
  color: var(--danger);
}
.panel-tab :deep(.list) {
  margin-top: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.dialog {
  width: min(32rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.dialog-head h2 {
  margin: 0;
  font-size: 1.05rem;
}
.block + .block {
  margin-top: 1.1rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--border);
}
.block p {
  margin: 0 0 0.6rem;
  font-size: 0.875rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.35rem;
}
.row .input {
  flex: 1;
  min-width: 12rem;
}
.hint {
  margin: 0.5rem 0 0 !important;
  font-size: 0.8rem !important;
}
.result {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.75rem;
  padding: 0.65rem 0.8rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
}
.result.ok {
  background: var(--success-soft);
  color: var(--ok);
}
.result.bad {
  background: var(--danger-soft);
  color: var(--danger);
}
.result.warn {
  background: var(--warning-soft);
  color: var(--warning-text);
}
.result code {
  color: var(--text);
  overflow-wrap: anywhere;
}
.result span {
  color: var(--text);
}
.more {
  display: inline-block;
  margin-top: 1rem;
  font-size: 0.875rem;
}
</style>
