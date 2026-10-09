<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import { computed, nextTick, ref } from 'vue'
import { label, t } from '../lib/i18n'

/**
 * After a save that failed: every field to fix, each a link to it. Takes focus, so screen readers
 * read it and keyboard users start from it.
 */
const props = defineProps<{
  errors: Record<string, string[]>
  fields: readonly AdminField[]
}>()
const emit = defineEmits<{ go: [path: string] }>()
const root = ref<HTMLElement>()

function fieldLabel(path: string): string {
  const parts = path.split('.')
  let fields = props.fields
  const names: string[] = []
  for (const part of parts) {
    const field = fields.find((f) => f.name === part)
    if (!field) {
      if (/^\d+$/.test(part)) names.push(`#${Number(part) + 1}`)
      continue
    }
    names.push(label(field.label, field.name))
    fields = field.fields ?? []
  }
  return names.join(' › ') || path
}

const items = computed(() =>
  Object.entries(props.errors).map(([path, messages]) => ({
    path,
    label: fieldLabel(path),
    message: messages.join(' '),
  })),
)

async function focus() {
  await nextTick()
  root.value?.focus()
}
defineExpose({ focus })
</script>

<template>
  <div v-if="items.length" ref="root" class="error-summary" role="alert" tabindex="-1">
    <strong>{{ t('form.errorSummary', { n: items.length }) }}</strong>
    <ul>
      <li v-for="item in items" :key="item.path">
        <a :href="`#field-${item.path.replace(/[^\w-]/g, '-')}`" @click.prevent="emit('go', item.path)">{{ item.label }}</a>:
        {{ item.message }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.error-summary {
  padding: 0.85rem 1rem;
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--text);
}
.error-summary:focus {
  outline: 2px solid var(--danger);
  outline-offset: 2px;
}
ul {
  margin: 0.4rem 0 0;
  padding-left: 1.2rem;
}
a {
  color: var(--danger);
  font-weight: 600;
}
</style>
