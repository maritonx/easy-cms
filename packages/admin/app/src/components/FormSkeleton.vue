<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import { computed } from 'vue'
import LoadingStatus from './LoadingStatus.vue'
import Skeleton from './Skeleton.vue'

/** A form that is still loading, shaped by the fields it will show (the first few). */
const props = defineProps<{
  fields: readonly Pick<AdminField, 'name' | 'type'>[]
  /** A heading line above, as the edit and global pages have. */
  header?: boolean
}>()

const TALL = new Set(['richText', 'textarea', 'json', 'blocks', 'array', 'group'])
const shown = computed(() =>
  props.fields.slice(0, 8).map((f) => ({
    name: f.name,
    control: f.type === 'boolean' ? '1.25rem' : TALL.has(f.type) ? '7rem' : undefined,
  })),
)
</script>

<template>
  <div class="form-skeleton" aria-busy="true">
    <LoadingStatus />
    <div v-if="header" class="form-skeleton-header">
      <Skeleton width="6rem" height="0.7em" />
      <Skeleton width="16rem" height="1.6rem" />
    </div>
    <div class="card form-skeleton-body">
      <div v-for="field in shown" :key="field.name" class="form-skeleton-field">
        <Skeleton width="7rem" height="0.75em" />
        <Skeleton shape="block" :height="field.control" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-skeleton {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.form-skeleton-header {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.form-skeleton-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.25rem;
}
.form-skeleton-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
