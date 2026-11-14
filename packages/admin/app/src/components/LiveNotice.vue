<script setup lang="ts">
import { t } from '../lib/i18n'
import type { LiveDocument } from '../lib/live-document'

/**
 * What the edit page or drawer says about other saves of its document (ADR-0070). Polite: read
 * out when it changes, without taking focus from the form.
 */
const props = defineProps<{ live: LiveDocument }>()
const { updated, conflict, gone } = props.live
</script>

<template>
  <div class="live-notice" aria-live="polite">
    <div v-if="gone" class="notice notice-error" data-testid="live-gone">
      <strong>{{ gone === 'deleted' ? t('live.deletedDoc') : t('live.hiddenDoc') }}</strong>
      <span>{{ t('live.goneHint') }}</span>
    </div>
    <div v-else-if="conflict" class="notice notice-warning" data-testid="live-conflict">
      <strong>{{ t('live.savedElsewhere') }}</strong>
      <span class="choices">
        <button type="button" class="btn btn-sm" @click="live.loadNewer()">{{ t('live.loadNewer') }}</button>
        <button type="button" class="btn btn-sm btn-ghost" @click="live.keepMine()">{{ t('live.keepMine') }}</button>
      </span>
    </div>
    <p v-else-if="updated" class="updated muted small">{{ t('live.updated') }}</p>
  </div>
</template>

<style scoped>
.live-notice:empty {
  display: none;
}
.notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.updated {
  margin: 0;
}
</style>
