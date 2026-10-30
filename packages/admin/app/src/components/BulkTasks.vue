<script setup lang="ts">
import { X } from '@lucide/vue'
import { onMounted, watch } from 'vue'
import {
  type BulkOperation,
  bulkTasks,
  cancelBulk,
  dismissBulk,
  isActive,
  resumeBulk,
} from '../lib/bulk-tasks'
import { label, t } from '../lib/i18n'
import { findCollection, session } from '../lib/session'

// Operations still running after a reload, once signed in.
onMounted(() => {
  if (session.schema) void resumeBulk()
})
watch(
  () => session.schema,
  (schema, before) => {
    if (schema && !before) void resumeBulk()
  },
)

const name = (op: BulkOperation) => {
  const collection = findCollection(op.collection)
  return collection ? label(collection.labels?.plural, collection.slug) : op.collection
}
const n = (value: number) => value.toLocaleString()
const percent = (op: BulkOperation) =>
  op.total ? Math.round(((op.done + op.skipped + op.failed) / op.total) * 100) : 100

function outcome(op: BulkOperation): string {
  if (op.state === 'cancelled') return t('bulk.cancelled')
  if (op.state === 'failed') return t('bulk.stopped', { error: op.error ?? '' })
  return ''
}
function reason(problem: BulkOperation['problems'][number]): string {
  if (problem.reason === 'forbidden') return t('bulk.forbidden')
  if (problem.reason === 'not-found') return t('bulk.notFound')
  return problem.message ?? ''
}
</script>

<template>
  <section v-if="bulkTasks.length" class="bulk-tasks" :aria-label="t('bulk.panel')">
    <article v-for="op in bulkTasks" :key="op.id" class="task card">
      <header>
        <strong>{{ t(isActive(op) ? `bulk.${op.action}` : `bulk.${op.action}Done`, { label: name(op) }) }}</strong>
        <button v-if="!isActive(op)" type="button" class="btn btn-ghost btn-icon btn-sm" :aria-label="t('toast.dismiss')" @click="dismissBulk(op)">
          <X :size="14" aria-hidden="true" />
        </button>
      </header>
      <progress :value="percent(op)" max="100" :aria-label="t('bulk.progress', { done: n(op.done + op.skipped + op.failed), total: n(op.total) })" />
      <p class="numbers" role="status">
        <template v-if="isActive(op)">{{ t('bulk.progress', { done: n(op.done + op.skipped + op.failed), total: n(op.total) }) }}</template>
        <template v-else>{{ t('bulk.summary', { done: n(op.done), skipped: n(op.skipped), failed: n(op.failed) }) }}</template>
        <span v-if="outcome(op)"> · {{ outcome(op) }}</span>
      </p>
      <details v-if="!isActive(op) && op.problems.length" class="problems">
        <summary>{{ t('bulk.details') }}</summary>
        <ul>
          <li v-for="problem in op.problems" :key="String(problem.id)">#{{ problem.id }}: {{ reason(problem) }}</li>
          <li v-if="op.skipped + op.failed > op.problems.length">{{ t('bulk.more', { count: n(op.skipped + op.failed - op.problems.length) }) }}</li>
        </ul>
      </details>
      <button v-if="isActive(op) && op.state !== 'cancelling'" type="button" class="btn btn-sm" @click="cancelBulk(op)">{{ t('common.cancel') }}</button>
    </article>
  </section>
</template>

<style scoped>
.bulk-tasks {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 55;
  display: grid;
  gap: 0.5rem;
  width: min(22rem, calc(100vw - 2rem));
}
.task {
  display: grid;
  gap: 0.4rem;
  padding: 0.75rem 0.9rem;
  box-shadow: var(--shadow);
  font-size: 0.85rem;
}
.task header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.task progress {
  width: 100%;
  height: 0.4rem;
  accent-color: var(--accent);
}
.numbers {
  margin: 0;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.problems ul {
  max-height: 8rem;
  overflow: auto;
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
  color: var(--text-muted);
}
.task > .btn {
  justify-self: start;
}
</style>
