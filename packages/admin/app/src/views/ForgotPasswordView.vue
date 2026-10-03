<script setup lang="ts">
import { ref } from 'vue'
import AuthCard from '../components/AuthCard.vue'
import { locale, t } from '../lib/i18n'
import { forgotPassword } from '../lib/session'

const email = ref('')
const busy = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await forgotPassword(email.value, locale.value)
    // The same answer whether or not the email has an account.
    sent.value = true
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthCard :title="t('forgot.title')">
    <div v-if="sent" class="form">
      <p class="notice" role="status">{{ t('forgot.sent', { email }) }}</p>
      <RouterLink :to="{ name: 'login' }" class="back">{{ t('forgot.back') }}</RouterLink>
    </div>
    <form v-else class="form" @submit.prevent="submit">
      <p class="muted">{{ t('forgot.intro') }}</p>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <label class="field">
        <span class="field-label">{{ t('login.email') }}</span>
        <input v-model="email" class="input" type="email" autocomplete="username" required autofocus />
      </label>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ t('forgot.submit') }}</button>
      <RouterLink :to="{ name: 'login' }" class="back">{{ t('forgot.back') }}</RouterLink>
    </form>
  </AuthCard>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.back {
  align-self: center;
  font-size: 0.875rem;
}
</style>
