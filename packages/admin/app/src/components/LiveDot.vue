<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../lib/i18n'
import type { LiveStatus } from '../lib/realtime'

/** "Live" beside a list's heading (`realtime: true`): grey while the stream is down. */
const props = defineProps<{ status: LiveStatus }>()
const hint = computed(() =>
  props.status === 'live'
    ? t('live.onHint')
    : props.status === 'down'
      ? t('live.reconnecting')
      : props.status === 'connecting'
        ? t('live.connecting')
        : t('live.off'),
)
</script>

<template>
  <span :class="['live-dot', { on: status === 'live' }]" :title="hint" data-testid="live-dot" :data-status="status">
    <span class="dot" aria-hidden="true" />
    {{ t('live.label') }}
    <span class="visually-hidden">: {{ hint }}</span>
  </span>
</template>

<style scoped>
.live-dot {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--faint);
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
}
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}
.on {
  color: var(--ok);
}
.on .dot {
  animation: live-pulse 2s ease-in-out infinite;
}
@keyframes live-pulse {
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .on .dot {
    animation: none;
  }
}
</style>
