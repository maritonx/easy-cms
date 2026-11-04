<script setup lang="ts">
import { Sparkles } from '@lucide/vue'
import { aiSpent } from '../lib/ai'
import { t } from '../lib/i18n'

/** The ✨ button of an AI feature (#358): busy while it asks; says so when today's requests are used up. */
defineProps<{ label: string; busy: boolean }>()
const emit = defineEmits<{ run: [] }>()
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost btn-sm ai-button"
    :disabled="busy || aiSpent()"
    :aria-busy="busy"
    :title="aiSpent() ? t('ai.spent') : undefined"
    @click="emit('run')"
  >
    <span v-if="busy" class="spinner" aria-hidden="true" />
    <Sparkles v-else :size="14" aria-hidden="true" />
    {{ busy ? t('ai.working') : aiSpent() ? t('ai.spent') : label }}
  </button>
</template>

<style scoped>
.ai-button {
  gap: 0.3rem;
  color: var(--accent-ink);
  font-weight: 600;
}
</style>
