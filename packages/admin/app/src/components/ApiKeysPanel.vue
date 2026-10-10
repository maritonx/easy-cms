<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, api } from '../lib/api'
import { formatDate, t } from '../lib/i18n'
import { findCollection, session } from '../lib/session'
import { notify } from '../lib/toast'
import ConfirmDialog from './ConfirmDialog.vue'

/**
 * Your own API keys (`apiKeys: true`), with a way to revoke them: on Account, and after a password
 * reset, since whoever had the old password may have made keys that a new password doesn't stop.
 */
const props = defineProps<{ afterReset?: boolean }>()
const emit = defineEmits<{ loaded: [count: number]; done: [] }>()

interface Key {
  id: number | string
  name: string
  prefix?: string | null
  lastUsedAt?: string | null
  expiresAt?: string | null
}

const enabled = computed(() => findCollection('api-keys') !== undefined)
const keys = ref<Key[] | null>(null)
const revoking = ref<Key | 'all' | null>(null)
const busy = ref(false)

async function load() {
  if (!enabled.value || !session.user) {
    keys.value = []
  } else {
    const where = `where[user][equals]=${encodeURIComponent(String(session.user.id))}`
    const page = await api<{ docs: Key[] }>('GET', `/api-keys?${where}&limit=100&depth=0`).catch(
      () => ({ docs: [] }),
    )
    keys.value = page.docs
  }
  emit('loaded', keys.value.length)
}
onMounted(load)

async function revoke() {
  const target = revoking.value
  revoking.value = null
  if (!target || !keys.value) return
  busy.value = true
  try {
    for (const key of target === 'all' ? keys.value : [target])
      await api('DELETE', `/api-keys/${encodeURIComponent(String(key.id))}`)
    notify(
      'success',
      target === 'all' ? t('apiKeys.revokedAll') : t('apiKeys.revoked', { name: target.name }),
    )
    await load()
    if (props.afterReset) emit('done')
  } catch (e) {
    notify('error', e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="enabled && keys && (keys.length || !afterReset)" class="card keys" aria-labelledby="api-keys-heading">
    <h2 id="api-keys-heading" class="section-title">{{ t('apiKeys.title') }}</h2>
    <p class="muted hint">
      {{ afterReset ? t('apiKeys.afterReset', { count: keys.length }) : t('apiKeys.hint') }}
    </p>
    <p v-if="!keys.length" class="muted">{{ t('apiKeys.none') }}</p>
    <ul v-else class="list">
      <li v-for="key in keys" :key="String(key.id)">
        <span class="who">
          <strong>{{ key.name }}</strong>
          <span class="muted small">
            <template v-if="key.prefix"><code>{{ key.prefix }}…</code> · </template>
            {{ key.lastUsedAt ? t('apiKeys.lastUsed', { date: formatDate(key.lastUsedAt) }) : t('apiKeys.neverUsed') }}
            <template v-if="key.expiresAt"> · {{ t('apiKeys.expires', { date: formatDate(key.expiresAt) }) }}</template>
          </span>
        </span>
        <button type="button" class="btn btn-sm btn-ghost" :disabled="busy" @click="revoking = key">
          {{ t('apiKeys.revoke') }}
        </button>
      </li>
    </ul>
    <div v-if="keys.length > 1 || afterReset" class="actions">
      <button v-if="afterReset" type="button" class="btn" :disabled="busy" @click="emit('done')">
        {{ t('apiKeys.keep') }}
      </button>
      <button v-if="keys.length" type="button" class="btn btn-danger" :disabled="busy" @click="revoking = 'all'">
        {{ t('apiKeys.revokeAll') }}
      </button>
    </div>
    <ConfirmDialog
      :open="revoking !== null"
      :message="
        revoking === 'all'
          ? t('apiKeys.confirmAll', { count: keys.length })
          : t('apiKeys.confirm', { name: revoking?.name ?? '' })
      "
      :confirm-label="t('apiKeys.revoke')"
      @confirm="revoke"
      @cancel="revoking = null"
    />
  </section>
</template>

<style scoped>
.keys {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.section-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
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
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
