<script setup lang="ts">
import type { AdminComponentProps } from '@easy-cms/core'

const props = defineProps<AdminComponentProps<string, { max?: number }>>()
</script>

<template>
  <label class="count">
    <input :value="props.value ?? ''" :disabled="props.readOnly" @input="props.change(($event.target as HTMLInputElement).value)" />
    <span>{{ (props.value ?? '').length }}/{{ props.options.max ?? 0 }}</span>
  </label>
</template>

<style scoped>
.count { color: var(--brand); }
</style>
