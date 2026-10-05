<script setup lang="ts">
import type { UserIdentity } from '@easy-cms/core'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '../lib/api'
import { formatDate, t } from '../lib/i18n'
import { session } from '../lib/session'
import { notify } from '../lib/toast'
import ConfirmDialog from './ConfirmDialog.vue'
import ProviderIcon from './ProviderIcon.vue'

/**
 * The outside accounts a user signs in with (`auth.providers`): on Account, your own (and
 * linking more); on a user's page, for admins.
 */
const props = defineProps<{ userId?: number | string | undefined }>()
const route = useRoute()
const router = useRouter()
const own = computed(() => props.userId === undefined)
const identities = ref<UserIdentity[] | null>(null)
const unlinking = ref<UserIdentity | null>(null)
const providers = computed(() => session.schema?.providers ?? [])
const icon = (id: string) => providers.value.find((p) => p.id === id)?.icon ?? 'key'
const unlinked = computed(() =>
  providers.value.filter((p) => !identities.value?.some((i) => i.provider === p.id)),
)

async function load() {
  const query = own.value ? '' : `?user=${encodeURIComponent(String(props.userId))}`
  identities.value = await api<UserIdentity[]>('GET', `/auth/identities${query}`).catch(() => [])
}
onMounted(async () => {
  await load()
  // Back from the provider after linking.
  const outcome = route.query.sso
  if (own.value && typeof outcome === 'string') {
    if (outcome === 'linked') notify('success', t('sso.linked'))
    else if (outcome === 'taken') notify('error', t('sso.error.taken'))
    else notify('error', t('sso.error.failed'))
    const { sso: _sso, ...rest } = route.query
    void router.replace({ query: rest })
  }
})

async function link(id: string) {
  try {
    const { url } = await api<{ url: string }>('POST', `/auth/${encodeURIComponent(id)}/link`)
    window.location.assign(url)
  } catch (e) {
    notify('error', e instanceof ApiError ? e.message : String(e))
  }
}
async function unlink() {
  const identity = unlinking.value
  unlinking.value = null
  if (!identity) return
  try {
    await api('DELETE', `/auth/identities/${identity.id}`)
    notify('success', t('sso.unlinked', { name: identity.name }))
    await load()
  } catch (e) {
    notify('error', e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e))
  }
}
</script>

<template>
  <section v-if="providers.length" class="card identities" aria-labelledby="identities-heading">
    <h2 id="identities-heading" class="section-title">{{ t('sso.accounts') }}</h2>
    <p class="muted hint">{{ own ? t('sso.accountsHint') : t('sso.accountsHintAdmin') }}</p>
    <p v-if="identities && !identities.length" class="muted">{{ t('sso.none') }}</p>
    <ul v-else-if="identities" class="list">
      <li v-for="identity in identities" :key="String(identity.id)">
        <ProviderIcon :icon="icon(identity.provider)" />
        <span class="who">
          <strong>{{ identity.name }}</strong>
          <span class="muted small">
            {{ identity.email ?? '—' }}
            <template v-if="identity.lastUsedAt"> · {{ t('sso.lastUsed', { date: formatDate(identity.lastUsedAt) }) }}</template>
          </span>
        </span>
        <button type="button" class="btn btn-sm btn-ghost" @click="unlinking = identity">
          {{ t('sso.unlink') }}
        </button>
      </li>
    </ul>
    <div v-if="own && unlinked.length" class="link">
      <button v-for="p in unlinked" :key="p.id" type="button" class="btn btn-sm" @click="link(p.id)">
        <ProviderIcon :icon="p.icon" :size="15" />
        {{ t('sso.link', { name: p.name }) }}
      </button>
    </div>
    <ConfirmDialog
      :open="unlinking !== null"
      :message="t('sso.confirmUnlink', { name: unlinking?.name ?? '' })"
      :confirm-label="t('sso.unlink')"
      @confirm="unlink"
      @cancel="unlinking = null"
    />
  </section>
</template>

<style scoped>
.identities {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.hint {
  margin: 0;
  font-size: 0.875rem;
}
.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
.list li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-top: 1px solid var(--border);
}
.who {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.small {
  font-size: 0.8rem;
}
.link {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.link .btn {
  gap: 0.45rem;
}
</style>
