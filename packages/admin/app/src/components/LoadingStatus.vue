<script setup lang="ts">
import { t } from '../lib/i18n'
</script>

<!--
  Says "Loading…" to screen readers, once, beside skeletons that are hidden from them. A polite
  live region rather than role="status", which is the toasts' (saved, deleted…).
-->
<template>
  <span class="visually-hidden" aria-live="polite">{{ t('common.loading') }}</span>
</template>
