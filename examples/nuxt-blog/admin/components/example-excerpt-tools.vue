<!--
  Below the excerpt: how long it is, and a button that fills it with the title.
  Built into admin/dist/components.js by `easy-cms build:admin` (see easy-cms.config.ts).
-->
<script setup lang="ts">
import type { AdminComponentProps } from '@easy-cms/core'

const props = defineProps<AdminComponentProps<string | null, { max: number }>>()

const th = () => props.uiLocale === 'th'
const useTitle = () => props.setField('excerpt', String(props.doc.title ?? ''))
</script>

<template>
  <div class="tools">
    <span>{{ (props.value ?? '').length }} / {{ props.options.max }}</span>
    <button type="button" :disabled="props.readOnly || !props.doc.title" @click="useTitle">
      {{ th() ? 'ใช้ชื่อเรื่อง' : 'Use the title' }}
    </button>
  </div>
</template>

<style scoped>
.tools {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}
button {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  padding: 0.15rem 0.6rem;
  cursor: pointer;
}
</style>
