<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import ProviderButtons from '../components/ProviderButtons.vue'
import { ApiError, api } from '../lib/api'
import { locale, t } from '../lib/i18n'
import { resetPassword, session } from '../lib/session'

/** The page behind a password link: a forgotten password, or an invitation. */
const route = useRoute()
const router = useRouter()
const token = typeof route.query.token === 'string' ? route.query.token : ''
const state = ref<'checking' | 'ready' | 'invalid'>('checking')
const purpose = ref<'reset' | 'invite'>('reset')
const email = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)

onMounted(async () => {
  try {
    const found = await api<{ email: string; purpose: 'reset' | 'invite' }>(
      'GET',
      `/users/reset-password?token=${encodeURIComponent(token)}`,
    )
    email.value = found.email
    purpose.value = found.purpose
    state.value = 'ready'
  } catch {
    state.value = 'invalid'
  }
})

async function submit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = t('reset.mismatch')
    return
  }
  busy.value = true
  try {
    await resetPassword(token, password.value, locale.value)
    await router.replace('/')
  } catch (e) {
    if (e instanceof ApiError && e.fieldErrors.token) state.value = 'invalid'
    else
      error.value = e instanceof ApiError ? (e.fieldErrors.password?.[0] ?? e.message) : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthCard :title="purpose === 'invite' ? t('reset.inviteTitle') : t('reset.title')">
    <p v-if="state === 'checking'" class="muted">…</p>
    <div v-else-if="state === 'invalid'" class="form">
      <p class="notice notice-error" role="alert">{{ t('reset.invalid') }}</p>
      <RouterLink v-if="!session.user" :to="{ name: 'forgot-password' }" class="link">{{ t('reset.again') }}</RouterLink>
    </div>
    <form v-else class="form" @submit.prevent="submit">
      <p class="muted">{{ t(purpose === 'invite' ? 'reset.inviteIntro' : 'reset.intro', { email }) }}</p>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <input type="email" class="visually-hidden" autocomplete="username" :value="email" readonly tabindex="-1" aria-hidden="true" />
      <label class="field">
        <span class="field-label">{{ t('reset.password') }}</span>
        <input v-model="password" class="input" type="password" autocomplete="new-password" minlength="8" required autofocus />
      </label>
      <label class="field">
        <span class="field-label">{{ t('reset.confirm') }}</span>
        <input v-model="confirm" class="input" type="password" autocomplete="new-password" minlength="8" required />
      </label>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ t(purpose === 'invite' ? 'reset.inviteSubmit' : 'reset.submit') }}</button>
      <!-- An invitation can be taken with an outside account instead of a password. -->
      <template v-if="purpose === 'invite' && session.providers.length">
        <p class="or"><span>{{ t('sso.orProvider') }}</span></p>
        <ProviderButtons />
      </template>
    </form>
  </AuthCard>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.or {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.25rem 0 0;
  color: var(--faint);
  font-size: 0.8rem;
}
.or::before,
.or::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border);
}
.link {
  align-self: center;
  font-size: 0.875rem;
}
</style>
