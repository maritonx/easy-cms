<script setup lang="ts">
import { ref } from 'vue'
import ApiKeysPanel from '../components/ApiKeysPanel.vue'
import IdentitiesPanel from '../components/IdentitiesPanel.vue'
import { ApiError, api } from '../lib/api'
import { locale, setLocale, t } from '../lib/i18n'
import { loadSession, session } from '../lib/session'

const name = ref(session.user?.name ?? '')
const password = ref('')
const currentPassword = ref('')
const errors = ref<Record<string, string[]>>({})
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
const saving = ref(false)

async function save() {
  if (!session.user) return
  saving.value = true
  errors.value = {}
  message.value = null
  const body: Record<string, unknown> = { name: name.value || null }
  if (password.value) {
    body.password = password.value
    // The server asks for it when the account has a password.
    body.currentPassword = currentPassword.value
  }
  try {
    // Changing your own password ends other sessions; the server sends this browser a new cookie.
    await api('PATCH', `/users/${session.user.id}?depth=0`, body)
    message.value = {
      kind: 'success',
      text: password.value ? t('account.passwordChanged') : t('edit.saved'),
    }
    password.value = ''
    currentPassword.value = ''
    await loadSession()
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      message.value = {
        kind: 'error',
        text: Object.keys(errors.value).length ? t('edit.fixErrors') : e.message,
      }
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <h1>{{ t('account.title') }}</h1>
  <form class="card account" novalidate @submit.prevent="save">
    <p class="muted">{{ session.user?.email }} · {{ session.user?.role }}</p>
    <label class="field">
      <span class="field-label">{{ t('setup.name') }}</span>
      <input v-model="name" class="input" autocomplete="name" :aria-invalid="!!errors.name" />
      <span v-for="m in errors.name" :key="m" class="field-error">{{ m }}</span>
    </label>
    <label class="field">
      <span class="field-label">{{ t('account.changePassword') }}</span>
      <input
        v-model="password"
        class="input"
        type="password"
        autocomplete="new-password"
        :placeholder="t('edit.newPassword')"
        :aria-invalid="!!errors.password"
      />
      <span v-for="m in errors.password" :key="m" class="field-error">{{ m }}</span>
    </label>
    <label v-if="password" class="field">
      <span class="field-label">{{ t('account.currentPassword') }}</span>
      <input
        v-model="currentPassword"
        class="input"
        type="password"
        autocomplete="current-password"
        :aria-invalid="!!errors.currentPassword"
      />
      <span v-for="m in errors.currentPassword" :key="m" class="field-error">{{ m }}</span>
    </label>
    <div class="actions">
      <span v-if="message" :class="['status', message.kind]" role="status" aria-live="polite">{{ message.text }}</span>
      <button type="submit" class="btn btn-primary" :disabled="saving">{{ t('account.save') }}</button>
    </div>
  </form>

  <IdentitiesPanel class="account" />

  <ApiKeysPanel class="account" />

  <section class="card account" :aria-labelledby="'ui-language'">
    <h2 id="ui-language" class="section-title">{{ t('account.language') }}</h2>
    <p class="muted hint">{{ t('account.languageHint') }}</p>
    <div class="segmented" role="group" :aria-label="t('account.language')">
      <!-- Each language in its own words, so it can be found in either. -->
      <button type="button" lang="th" :class="{ on: locale === 'th' }" :aria-pressed="locale === 'th'" @click="setLocale('th')">ไทย</button>
      <button type="button" lang="en" :class="{ on: locale === 'en' }" :aria-pressed="locale === 'en'" @click="setLocale('en')">English</button>
    </div>
  </section>
</template>

<style scoped>
h1 {
  margin-bottom: 1rem;
}
.account + .account {
  margin-top: 1rem;
}
.account {
  max-width: 32rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.account p {
  margin: 0;
}
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}
.status {
  font-size: 0.875rem;
  font-weight: 550;
}
.status.success {
  color: var(--accent);
}
.status.error {
  color: var(--danger);
}
.section-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}
.hint {
  margin: -0.5rem 0 0;
  font-size: 0.9rem;
}
.segmented {
  display: inline-flex;
  align-self: flex-start;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: var(--surface-2);
}
.segmented button {
  min-height: 2.1rem;
  padding: 0 1rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  cursor: pointer;
}
.segmented button.on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}
</style>
