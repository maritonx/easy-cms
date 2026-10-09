<script setup lang="ts">
import type { AdminSso } from '@easy-cms/core'
import { Check, ChevronRight, Copy, TriangleAlert } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import ProviderIcon from '../components/ProviderIcon.vue'
import { ApiError, api } from '../lib/api'
import { locale, t } from '../lib/i18n'
import { session } from '../lib/session'

/** Settings → SSO (admins): the providers, the callback URLs to give them, who uses a password. */
const sso = ref<AdminSso | null>(null)
const failed = ref('')
const copied = ref('')

onMounted(async () => {
  try {
    sso.value = await api<AdminSso>('GET', '/admin/ui/sso')
  } catch (e) {
    failed.value = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
  }
})

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
const docs = computed(
  () => `https://maritonx.github.io/easy-cms${locale.value === 'th' ? '/th' : ''}/guide/sso`,
)
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
    <p v-else-if="!sso" class="muted">{{ t('common.loading') }}</p>
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
        <dl>
          <dt>{{ t('sso.passwords') }}</dt>
          <dd>{{ sso.password === 'everyone' ? t('sso.passwordEveryone') : t('sso.passwordAdminsOnly') }}</dd>
          <dt>{{ t('sso.newPeople') }}</dt>
          <dd>
            <template v-if="sso.signUp">
              {{ t('sso.signUpDomains', { domains: sso.signUp.domains.join(', '), role: sso.signUp.role }) }}
            </template>
            <template v-else>{{ t('sso.signUpNone') }}</template>
          </dd>
        </dl>
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
@media (max-width: 640px) {
  dl {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
