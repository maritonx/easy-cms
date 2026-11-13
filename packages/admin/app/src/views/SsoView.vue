<script setup lang="ts">
import type { AdminSso } from '@easy-cms/core'
import { Check, ChevronRight, Copy, Lock, TriangleAlert } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import PanelSkeleton from '../components/PanelSkeleton.vue'
import ProviderIcon from '../components/ProviderIcon.vue'
import { ApiError, api } from '../lib/api'
import { locale, t } from '../lib/i18n'
import { useDelayedLoading } from '../lib/loading'
import { session } from '../lib/session'
import { notify } from '../lib/toast'

/** Settings → SSO (admins): the providers, the callback URLs to give them, who uses a password. */
const sso = ref<AdminSso | null>(null)
/** A skeleton while the page loads (only when it is slow). */
const showSkeleton = useDelayedLoading(() => !sso.value)
const failed = ref('')
const copied = ref('')

/** The forms of "Who can sign in" (#409), filled from what applies now. */
const password = ref<AdminSso['password']>('everyone')
const breakGlass = ref<string[]>([])
const signUpOn = ref(false)
const domains = ref('')
const role = ref('')
const saving = ref(false)

function fill(value: AdminSso) {
  sso.value = value
  password.value = value.password
  breakGlass.value = (value.breakGlassAccounts ?? []).map((a) => String(a.id))
  signUpOn.value = !!value.signUp
  domains.value = value.signUp?.domains.join(', ') ?? ''
  role.value = value.signUp?.role ?? value.signUpRoles[0]?.key ?? ''
}

async function load() {
  try {
    fill(await api<AdminSso>('GET', '/admin/ui/sso'))
  } catch (e) {
    failed.value = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
  }
}
onMounted(load)

const messageOf = (e: unknown) =>
  e instanceof ApiError ? e.errors.map((x) => x.message).join('; ') || e.message : String(e)

/** Saves one rule; a password change first says who it affects. */
async function save(change: Record<string, unknown>) {
  saving.value = true
  try {
    if (change.password !== undefined && change.password !== 'code') {
      const impact = await api<{ passwordLost: number; sessionsEnded: number }>(
        'PUT',
        '/admin/sign-in/rules?dryRun=1',
        change,
      )
      if (
        (impact.passwordLost > 0 || impact.sessionsEnded > 0) &&
        !window.confirm(
          t('sso.confirmPassword', { lost: impact.passwordLost, sessions: impact.sessionsEnded }),
        )
      )
        return
    }
    await api('PUT', '/admin/sign-in/rules', change)
    notify('success', t('sso.saved'))
    await load()
  } catch (e) {
    notify('error', messageOf(e))
  } finally {
    saving.value = false
  }
}

function savePassword() {
  void save({
    password: password.value === 'breakGlass' ? { breakGlass: breakGlass.value } : password.value,
  })
}
function saveSignUp() {
  const list = domains.value
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter(Boolean)
  void save({ signUp: signUpOn.value && list.length ? { domains: list, role: role.value } : null })
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => {
      if (copied.value === text) copied.value = ''
    }, 2000)
  } catch {
    // no clipboard: the URL is on screen to select
  }
}
const DETAILS: Record<string, Parameters<typeof t>[0]> = {
  issuer: 'sso.issuer',
  clientId: 'sso.clientId',
  server: 'sso.server',
}
const docs = computed(() => `https://easycms.dev${locale.value === 'th' ? '/th' : ''}/docs/sso`)
</script>

<template>
  <p v-if="!session.schema?.views.sso" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <nav class="crumbs" :aria-label="t('list.breadcrumb')">
      <span>{{ t('nav.globals') }}</span>
      <ChevronRight :size="14" aria-hidden="true" />
      <span class="current">{{ t('sso.title') }}</span>
    </nav>
    <header class="page-header">
      <h1>{{ t('sso.title') }}</h1>
      <p class="muted">{{ t('sso.lead') }}</p>
    </header>

    <p v-if="failed" class="field-error">{{ failed }}</p>
    <PanelSkeleton v-else-if="showSkeleton" />
    <template v-else-if="!sso" />
    <template v-else>
      <p v-if="!sso.serverURL" class="warning" role="alert">
        <TriangleAlert :size="16" aria-hidden="true" />
        <span>{{ t('sso.noServerUrl') }}</span>
      </p>

      <section v-for="p in sso.providers" :key="p.id" class="card panel" :aria-labelledby="`provider-${p.id}`">
        <h2 :id="`provider-${p.id}`">
          <ProviderIcon :icon="p.icon" />
          {{ p.name }}
          <code class="id">{{ p.id }}</code>
          <RouterLink v-if="p.source === 'admin'" class="badge" :to="{ path: '/integrations', query: { category: 'sign-in' } }">{{ t('sso.fromAdmin') }}</RouterLink>
        </h2>
        <dl>
          <dt>{{ t('sso.callback') }}</dt>
          <dd class="callback">
            <code>{{ p.callbackURL ?? '—' }}</code>
            <button
              v-if="p.callbackURL"
              type="button"
              class="btn btn-sm btn-ghost btn-icon"
              :aria-label="t('sso.copy')"
              :title="t('sso.copy')"
              @click="copy(p.callbackURL)"
            >
              <component :is="copied === p.callbackURL ? Check : Copy" :size="14" aria-hidden="true" />
            </button>
          </dd>
          <template v-for="(value, key) in p.details" :key="key">
            <dt>{{ DETAILS[key] ? t(DETAILS[key]) : key }}</dt>
            <dd><code>{{ value }}</code></dd>
          </template>
        </dl>
      </section>

      <section class="card panel" aria-labelledby="who-heading">
        <h2 id="who-heading">{{ t('sso.who') }}</h2>
        <p v-for="warning in sso.warnings" :key="warning" class="warning" role="alert">
          <TriangleAlert :size="16" aria-hidden="true" />
          <span>{{ warning }}</span>
        </p>

        <!-- auth.locked: as the code sets it, read only. -->
        <template v-if="sso.locked">
          <p class="locked muted"><Lock :size="14" aria-hidden="true" /> {{ t('sso.lockedRules') }}</p>
          <dl>
            <dt>{{ t('sso.passwords') }}</dt>
            <dd>{{ sso.password === 'everyone' ? t('sso.passwordEveryone') : sso.password === 'breakGlass' ? t('sso.passwordBreakGlassOnly', { emails: (sso.breakGlass ?? []).join(', ') }) : t('sso.passwordAdminsOnly') }}</dd>
            <dt>{{ t('sso.newPeople') }}</dt>
            <dd>
              <template v-if="sso.signUp">
                {{ t('sso.signUpDomains', { domains: sso.signUp.domains.join(', '), role: sso.signUp.role }) }}
              </template>
              <template v-else>{{ t('sso.signUpNone') }}</template>
            </dd>
          </dl>
        </template>

        <template v-else>
          <fieldset class="rule" :disabled="saving">
            <legend>
              {{ t('sso.passwords') }}
              <span class="badge">{{ t(sso.sources.password === 'admin' ? 'sso.changedInAdmin' : 'sso.fromCode') }}</span>
            </legend>
            <label class="choice"><input v-model="password" type="radio" name="password" value="everyone" /> {{ t('sso.passwordEveryone') }}</label>
            <label class="choice"><input v-model="password" type="radio" name="password" value="admins" /> {{ t('sso.passwordAdminsOnly') }}</label>
            <label class="choice"><input v-model="password" type="radio" name="password" value="breakGlass" /> {{ t('sso.passwordBreakGlassChoice') }}</label>
            <div v-if="password === 'breakGlass'" class="nested">
              <p v-if="sso.sources.password === 'code' && sso.code.password === 'breakGlass'" class="muted">{{ t('sso.breakGlassFromCode', { emails: (sso.code.breakGlass ?? []).join(', ') }) }}</p>
              <p class="muted">{{ t('sso.breakGlassPick') }}</p>
              <label v-for="u in sso.breakGlassCandidates" :key="String(u.id)" class="choice">
                <input v-model="breakGlass" type="checkbox" :value="String(u.id)" /> {{ u.email }}
              </label>
            </div>
            <div class="actions">
              <button type="button" class="btn btn-primary btn-sm" @click="savePassword">{{ t('sso.save') }}</button>
              <button v-if="sso.sources.password === 'admin'" type="button" class="btn btn-sm btn-ghost" @click="save({ password: 'code' })">{{ t('sso.useCode') }}</button>
            </div>
          </fieldset>

          <fieldset class="rule" :disabled="saving">
            <legend>
              {{ t('sso.newPeople') }}
              <span class="badge">{{ t(sso.sources.signUp === 'admin' ? 'sso.changedInAdmin' : 'sso.fromCode') }}</span>
            </legend>
            <label class="choice"><input v-model="signUpOn" type="radio" name="signup" :value="false" /> {{ t('sso.signUpNone') }}</label>
            <label class="choice"><input v-model="signUpOn" type="radio" name="signup" :value="true" /> {{ t('sso.signUpOn') }}</label>
            <div v-if="signUpOn" class="nested">
              <label class="field">
                <span>{{ t('sso.signUpDomainsLabel') }}</span>
                <input v-model="domains" type="text" placeholder="example.com" :aria-describedby="'signup-hint'" />
                <small id="signup-hint" class="muted">{{ t('sso.signUpDomainsHint') }}</small>
              </label>
              <label v-if="sso.signUpRoles.length" class="field">
                <span>{{ t('sso.signUpRole') }}</span>
                <select v-model="role">
                  <option v-for="r in sso.signUpRoles" :key="r.key" :value="r.key">{{ r.name || r.key }}</option>
                </select>
              </label>
              <p v-else class="warning" role="alert">
                <TriangleAlert :size="16" aria-hidden="true" />
                <span>{{ t('sso.signUpNoRole') }} <RouterLink to="/roles">{{ t('sso.signUpRolesLink') }}</RouterLink></span>
              </p>
              <p v-if="sso.providers.length === 0" class="muted">{{ t('sso.signUpNoEffect') }}</p>
            </div>
            <div class="actions">
              <button type="button" class="btn btn-primary btn-sm" :disabled="signUpOn && !sso.signUpRoles.length" @click="saveSignUp">{{ t('sso.save') }}</button>
              <button v-if="sso.sources.signUp === 'admin'" type="button" class="btn btn-sm btn-ghost" @click="save({ signUp: 'code' })">{{ t('sso.useCode') }}</button>
            </div>
          </fieldset>
        </template>
        <p class="note muted">
          {{ t('sso.configNote') }}
          <a :href="docs" target="_blank" rel="noopener">{{ t('sso.howTo') }}</a>
        </p>
      </section>
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
.warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.875rem;
}
.warning svg {
  flex: none;
  margin-top: 0.1rem;
}
.panel {
  max-width: 48rem;
  margin-bottom: 1rem;
  padding: 1rem 1.1rem 1.1rem;
}
.panel h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
}
.id {
  color: var(--faint);
  font-size: 0.75rem;
  font-weight: 400;
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
  margin: 0;
  overflow-wrap: anywhere;
}
.callback {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
code {
  font-size: 0.8rem;
}
.note {
  margin: 0.9rem 0 0;
  font-size: 0.85rem;
}
.locked {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
}
.rule {
  margin: 0 0 1rem;
  padding: 0;
  border: 0;
}
.rule legend {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
}
.choice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.9rem;
}
.choice input {
  margin-top: 0.2rem;
}
.nested {
  margin: 0.25rem 0 0.25rem 1.5rem;
  font-size: 0.9rem;
}
.nested p {
  margin: 0.25rem 0;
}
.field {
  display: grid;
  gap: 0.25rem;
  margin: 0.5rem 0;
  max-width: 24rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
@media (max-width: 640px) {
  dl {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
