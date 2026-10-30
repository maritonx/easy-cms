<script setup lang="ts">
import { Clock } from '@lucide/vue'
import { formatDate, t } from '../lib/i18n'
import type { ShownStatus } from '../lib/status'

/**
 * A document's status as people read it (#303): Draft, Scheduled (with when), Published, and
 * what is pending on a published one. With `editable`, a scheduled date is a button that opens
 * the schedule dialog (`schedule`).
 */
defineProps<{ status: ShownStatus; editable?: boolean }>()
const emit = defineEmits<{ schedule: [] }>()
</script>

<template>
  <span class="status-badges">
    <template v-if="status.kind === 'draft'">
      <span class="badge badge-draft">{{ t('status.draft') }}</span>
    </template>
    <template v-else-if="status.kind === 'scheduled'">
      <component
        :is="editable ? 'button' : 'span'"
        :type="editable ? 'button' : undefined"
        :class="['badge', 'badge-when', { action: editable }]"
        @click="editable && emit('schedule')"
      >
        <Clock :size="13" aria-hidden="true" />
        {{ t('status.scheduledAt', { date: formatDate(status.at) }) }}
      </component>
    </template>
    <template v-else>
      <span class="badge badge-published">{{ t('status.published') }}</span>
      <span v-if="status.changed" class="badge badge-changed">{{ t('status.changed') }}</span>
      <component
        :is="editable ? 'button' : 'span'"
        v-if="status.publishAt"
        :type="editable ? 'button' : undefined"
        :class="['badge', 'badge-when', { action: editable }]"
        @click="editable && emit('schedule')"
      >
        <Clock :size="13" aria-hidden="true" />
        {{ t('status.publishesAt', { date: formatDate(status.publishAt) }) }}
      </component>
      <component
        :is="editable ? 'button' : 'span'"
        v-if="status.unpublishAt"
        :type="editable ? 'button' : undefined"
        :class="['badge', 'badge-when', { action: editable }]"
        @click="editable && emit('schedule')"
      >
        <Clock :size="13" aria-hidden="true" />
        {{ t('status.unpublishesAt', { date: formatDate(status.unpublishAt) }) }}
      </component>
    </template>
  </span>
</template>

<style scoped>
.status-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
/* A date something will happen: the accent, a clock instead of the status dot. */
.badge-when {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.action {
  border: 0;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
}
.action:hover {
  box-shadow: inset 0 0 0 1px currentColor;
}
</style>
