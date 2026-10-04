<script setup lang="ts">
import type { AdminEmail, EmailCheck } from '@easy-cms/core'
import { ChevronRight, PlugZap, Send } from '@lucide/vue'
import { computed, onMounted, ref, useId } from 'vue'
import { ApiError, api } from '../lib/api'
import { locale, t } from '../lib/i18n'
import { session } from '../lib/session'

/** Settings → Email (admins): the settings in use, a connection check and a test email. */
const email = ref<AdminEmail | null>(null)
const failed = ref('')
const to = ref(session.user?.email ?? '')
const toId = useId()
const busy = ref<'verify' | 'test' | null>(null)
const verifyResult = ref<EmailCheck | null>(null)
const testResult = ref<(EmailCheck & { to: string }) | null>(null)

onMounted(async () => {
  try {
    email.value = await api<AdminEmail>('GET', '/admin/email')
  } catch (e) {
    failed.value = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
  }
})

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

const docs = computed(
  () => `https://maritonx.github.io/easy-cms${locale.value === 'th' ? '/th' : ''}/guide/email`,
)
</script>

<template>
  <p v-if="session.user?.role !== 'admin'" class="notice">{{ t('common.notFound') }}</p>
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
    <p v-else-if="!email" class="muted">{{ t('common.loading') }}</p>

    <section v-else-if="!email.configured" class="card panel">
      <h2>{{ t('email.notSetUp') }}</h2>
      <p>{{ t('email.notSetUpText') }}</p>
      <a :href="docs" target="_blank" rel="noopener">{{ t('email.howToSetUp') }}</a>
    </section>

    <div v-else class="grid">
      <section class="card panel" aria-labelledby="settings-heading">
        <h2 id="settings-heading">{{ t('email.settings') }}</h2>
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
        <p class="note muted">
          {{ t('email.change') }}
          <a :href="docs" target="_blank" rel="noopener">{{ t('email.howToSetUp') }}</a>
        </p>
      </section>

      <section class="card panel" aria-labelledby="test-heading">
        <h2 id="test-heading">{{ t('email.test') }}</h2>
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

        <form class="block" @submit.prevent="sendTest">
          <label :for="toId" class="field-label">{{ t('email.sendTo') }}</label>
          <div class="row">
            <input :id="toId" v-model="to" class="input" type="email" autocomplete="email" required />
            <button type="submit" class="btn btn-primary" :disabled="!!busy || !to.trim()">
              <Send :size="16" aria-hidden="true" />
              {{ busy === 'test' ? t('email.sending') : t('email.sendTest') }}
            </button>
          </div>
          <p class="muted hint">{{ t('email.testText') }}</p>
          <div v-if="testResult" class="result" :class="testResult.ok ? 'ok' : 'bad'" role="status">
            <strong>{{ testResult.ok ? t('email.sentTo', { to: testResult.to }) : t('email.sendFailed') }}</strong>
            <span v-if="testResult.ok">{{ email.name === 'console' ? t('email.sentConsole') : t('email.sentCheck') }}</span>
            <template v-else>
              <code>{{ testResult.error }}</code>
              <span v-if="hintFor(testResult.error)">{{ hintFor(testResult.error) }}</span>
            </template>
          </div>
        </form>

        <RouterLink v-if="session.schema?.deliveries?.email" to="/deliveries?kind=email" class="more">
          {{ t('email.deliveries') }} →
        </RouterLink>
      </section>
    </div>
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
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}
.panel {
  padding: 1rem 1.1rem 1.1rem;
  min-width: 0;
}
.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.45rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}
dt {
  color: var(--faint);
}
dd {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
  margin: 0;
  overflow-wrap: anywhere;
}
.source {
  color: var(--faint);
  font-size: 0.75rem;
}
.note {
  margin: 0.9rem 0 0;
  font-size: 0.85rem;
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
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
