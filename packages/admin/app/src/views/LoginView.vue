<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import ProviderButtons from '../components/ProviderButtons.vue'
import { ApiError } from '../lib/api'
import { t } from '../lib/i18n'
import { login, session } from '../lib/session'

const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

/** Back from a provider without signing in (`?sso=<outcome>`). */
const SSO_ERRORS = [
  'no-account',
  'unverified',
  'inactive',
  'failed',
  'expired',
  'cancelled',
] as const
const ssoError = computed(() => {
  const code = route.query.sso
  return SSO_ERRORS.find((c) => c === code)
})
/** Without passwords (`auth.password: false`), the password form is for admins, folded away. */
const showPassword = ref(session.password)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await login(email.value, password.value)
    const redirect =
      typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
        ? route.query.redirect
        : '/'
    await router.replace(redirect)
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 429
        ? t('login.locked')
        : // `auth.password: false`: the password was right, but only admins use one.
          e instanceof ApiError && e.status === 401 && e.message.startsWith('Sign in with')
          ? t('sso.useProvider')
          : t('login.failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthCard :title="t('login.title')">
    <p v-if="ssoError" class="notice notice-error sso-error" role="alert">{{ t(`sso.error.${ssoError}`) }}</p>
    <template v-if="session.providers.length">
      <ProviderButtons />
      <p v-if="showPassword" class="or"><span>{{ t('sso.or') }}</span></p>
      <button v-else type="button" class="btn btn-ghost btn-sm admins" @click="showPassword = true">
        {{ t('sso.passwordAdmins') }}
      </button>
    </template>
    <form v-if="showPassword" class="form" @submit.prevent="submit">
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <label class="field">
        <span class="field-label">{{ t('login.email') }}</span>
        <input v-model="email" class="input" type="email" autocomplete="username" required :autofocus="!session.providers.length" />
      </label>
      <label class="field">
        <span class="field-label">{{ t('login.password') }}</span>
        <input v-model="password" class="input" type="password" autocomplete="current-password" required />
      </label>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ t('login.submit') }}</button>
      <RouterLink v-if="session.passwordReset && session.password" :to="{ name: 'forgot-password' }" class="forgot">
        {{ t('login.forgot') }}
      </RouterLink>
    </form>
  </AuthCard>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.sso-error {
  margin: 0 0 1rem;
}
.or {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.1rem 0;
  color: var(--faint);
  font-size: 0.8rem;
}
.or::before,
.or::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border);
}
.admins {
  display: block;
  margin: 1rem auto 0;
}
.forgot {
  align-self: center;
  font-size: 0.875rem;
}
</style>
