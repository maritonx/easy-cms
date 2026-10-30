<script setup lang="ts">
import { locale, t } from '../lib/i18n'
import { zoneDiffers, zoneName } from '../lib/time-zone'

/** Names the admin's time zone next to dates, only for someone whose browser is in another one. */
defineProps<{ id?: string }>()
</script>

<template>
  <span v-if="zoneDiffers" :id="id" class="zone-note">{{ t('time.zone', { zone: zoneName(locale === 'th' ? 'th-TH' : 'en-GB') }) }}</span>
</template>

<style scoped>
.zone-note {
  color: var(--text-muted);
  font-size: 0.8125rem;
}
</style>
