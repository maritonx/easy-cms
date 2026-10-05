<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '../lib/i18n'
import { session } from '../lib/session'
import { settings } from '../lib/settings'
import ProviderIcon from './ProviderIcon.vue'

/** "Sign in with …" buttons for `auth.providers`: links that start at the server. */
const route = useRoute()
const redirect = computed(() => {
  const to =
    typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/'
  return `${settings.adminPath.replace(/\/+$/, '')}${to}`
})
const href = (id: string) =>
  `${settings.apiPath}/auth/${encodeURIComponent(id)}/login?redirect=${encodeURIComponent(redirect.value)}`
</script>

<template>
  <div v-if="session.providers.length" class="providers">
    <a v-for="p in session.providers" :key="p.id" :href="href(p.id)" class="btn provider">
      <ProviderIcon :icon="p.icon" />
      {{ t('sso.signInWith', { name: p.name }) }}
    </a>
  </div>
</template>

<style scoped>
.providers {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.provider {
  justify-content: center;
  gap: 0.6rem;
  min-height: 2.6rem;
  text-decoration: none;
}
</style>
