<script setup lang="ts">
import { t } from '../lib/i18n'
</script>

<!-- Says "Loading…" to screen readers, once, beside skeletons that are hidden from them. -->
<template>
  <span class="visually-hidden" role="status">{{ t('common.loading') }}</span>
</template>
