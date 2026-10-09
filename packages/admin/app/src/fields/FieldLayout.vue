<script setup lang="ts">
import type { AdminField, AdminLayoutNode } from '@easy-cms/core'
import { computed, nextTick, reactive, ref } from 'vue'
import { label, t } from '../lib/i18n'
import LayoutNodes from './LayoutNodes.vue'

/**
 * The edit form laid out by `admin.layout`: tabs at the top, then sections and rows. A tab shows
 * how many of its fields have errors; `reveal(path)` opens the tab and section of a field.
 */
const props = defineProps<{
  layout: readonly AdminLayoutNode[]
  fields: readonly AdminField[]
  modelValue: Record<string, unknown>
  errors: Record<string, string[]>
  readOnly?: boolean
  /** Remembers the open tab per collection or global, for this browser tab. */
  storageKey: string
}>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, unknown>] }>()

const tabs = computed(() =>
  props.layout.every((n) => n.type === 'tab')
    ? (props.layout as Extract<AdminLayoutNode, { type: 'tab' }>[])
    : null,
)

function storedTab(): number {
  try {
    return Number(sessionStorage.getItem(`easy-cms-tab:${props.storageKey}`) ?? 0) || 0
  } catch {
    return 0
  }
}
const active = ref(Math.min(storedTab(), Math.max(0, (tabs.value?.length ?? 1) - 1)))
function select(i: number) {
  active.value = i
  try {
    sessionStorage.setItem(`easy-cms-tab:${props.storageKey}`, String(i))
  } catch {
    // Forgotten on reload.
  }
}

/** Sections folded, by key; those set `collapsed` start folded. */
const folded = reactive<Record<string, boolean>>({})
const initFold = (nodes: readonly AdminLayoutNode[], at: string) => {
  nodes.forEach((n, i) => {
    const key = `${at}${i}`
    if (n.type === 'collapsible') {
      folded[key] = n.collapsed === true
      initFold(n.nodes, `${key}.`)
    }
  })
}
if (tabs.value)
  tabs.value.forEach((tab, i) => {
    initFold(tab.nodes, `${i}:`)
  })
else initFold(props.layout, '')

/** The field names under some nodes. */
function names(nodes: readonly AdminLayoutNode[]): string[] {
  return nodes.flatMap((n) =>
    n.type === 'field' ? [n.name] : n.type === 'row' ? n.fields : names(n.nodes),
  )
}
const owns = (fieldNames: readonly string[], path: string) =>
  fieldNames.some((n) => path === n || path.startsWith(`${n}.`) || path.startsWith(`${n}[`))
const errorCount = (tab: Extract<AdminLayoutNode, { type: 'tab' }>) => {
  const fieldNames = names(tab.nodes)
  return Object.keys(props.errors).filter((p) => owns(fieldNames, p)).length
}

/** Opens the tab and sections holding a field, so the field can be focused. */
async function reveal(path: string) {
  const open = (nodes: readonly AdminLayoutNode[], at: string): boolean =>
    nodes.some((n, i) => {
      const key = `${at}${i}`
      if (n.type === 'field') return owns([n.name], path)
      if (n.type === 'row') return owns(n.fields, path)
      if (n.type === 'collapsible' && open(n.nodes, `${key}.`)) {
        folded[key] = false
        return true
      }
      return false
    })
  if (tabs.value) {
    const at = tabs.value.findIndex((tab, i) => open(tab.nodes, `${i}:`))
    if (at !== -1) select(at)
  } else open(props.layout, '')
  await nextTick()
}
defineExpose({ reveal })

function onTabKey(event: KeyboardEvent, i: number) {
  const count = tabs.value?.length ?? 0
  let next = -1
  if (event.key === 'ArrowRight') next = (i + 1) % count
  else if (event.key === 'ArrowLeft') next = (i - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === -1) return
  event.preventDefault()
  select(next)
  void nextTick(() => document.getElementById(`tab-${props.storageKey}-${next}`)?.focus())
}
</script>

<template>
  <div class="field-layout">
    <template v-if="tabs">
      <div class="tablist" role="tablist" :aria-label="t('edit.sections')">
        <button
          v-for="(tab, i) in tabs"
          :id="`tab-${storageKey}-${i}`"
          :key="i"
          type="button"
          role="tab"
          class="tab"
          :class="{ on: i === active }"
          :aria-selected="i === active"
          :aria-controls="`panel-${storageKey}-${i}`"
          :tabindex="i === active ? 0 : -1"
          @click="select(i)"
          @keydown="onTabKey($event, i)"
        >
          {{ label(tab.label, `${i + 1}`) }}
          <span v-if="errorCount(tab)" class="tab-errors" :aria-label="t('edit.tabErrors', { n: errorCount(tab) })">{{ errorCount(tab) }}</span>
        </button>
      </div>
      <div
        v-for="(tab, i) in tabs"
        v-show="i === active"
        :id="`panel-${storageKey}-${i}`"
        :key="i"
        role="tabpanel"
        :aria-labelledby="`tab-${storageKey}-${i}`"
        class="tabpanel"
      >
        <p v-if="tab.description" class="field-hint">{{ label(tab.description, '') }}</p>
        <LayoutNodes
          :nodes="tab.nodes"
          :fields="fields"
          :model-value="modelValue"
          :errors="errors"
          :read-only="readOnly"
          :folded="folded"
          :at="`${i}:`"
          @update:model-value="emit('update:modelValue', $event)"
          @toggle="folded[$event] = !folded[$event]"
        />
      </div>
    </template>
    <LayoutNodes
      v-else
      :nodes="layout"
      :fields="fields"
      :model-value="modelValue"
      :errors="errors"
      :read-only="readOnly"
      :folded="folded"
      @update:model-value="emit('update:modelValue', $event)"
      @toggle="folded[$event] = !folded[$event]"
    />
  </div>
</template>

<style scoped>
.tablist {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--border);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  padding: 0 0.15rem;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.tab:hover {
  color: var(--text);
}
.tab.on {
  color: var(--accent-ink);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.tab-errors {
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.3rem;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
}
.tabpanel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
