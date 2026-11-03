<script setup lang="ts">
import { Check, ChevronDown, MoreHorizontal, Star, Users } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../lib/i18n'
import type { ViewTab } from '../lib/saved-views'

/**
 * Views of a list as tabs above it (#87): All, the config's, shared ones and the user's own; Save
 * when the list differs from the view shown, and a menu for the view shown.
 */
const props = defineProps<{
  tabs: readonly ViewTab[]
  /** The view shown; `null` for All. */
  active: string | null
  /** The list differs from the view shown (or All has filters). */
  dirty: boolean
  /** The view the list opens with. */
  defaultKey: string | null
  busy: boolean
}>()
const emit = defineEmits<{
  select: [key: string | null]
  save: [name: string, shared: boolean]
  update: []
  rename: [key: string, name: string]
  share: [key: string, shared: boolean]
  remove: [key: string]
  setDefault: [key: string | null]
}>()

/** Tabs shown in a row; the others are under More. */
const SHOWN = 6
const shown = computed(() => {
  const first = props.tabs.slice(0, SHOWN)
  // The view shown is always visible.
  const active = props.tabs.find((tab) => tab.key === props.active)
  return active && !first.includes(active) ? [...first.slice(0, SHOWN - 1), active] : first
})
const more = computed(() => props.tabs.filter((tab) => !shown.value.includes(tab)))
const activeTab = computed(() => props.tabs.find((tab) => tab.key === props.active) ?? null)

const menu = ref<'more' | 'actions' | null>(null)
const root = ref<HTMLElement>()
function onDocumentClick(event: MouseEvent) {
  if (menu.value && !root.value?.contains(event.target as Node)) menu.value = null
}
onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

/** The form that names a view: a new one, or the one shown (renaming). */
const naming = ref<{ mode: 'new' | 'rename'; name: string; shared: boolean } | null>(null)
const nameInput = ref<HTMLInputElement>()
async function startNaming(mode: 'new' | 'rename') {
  menu.value = null
  naming.value = {
    mode,
    name: mode === 'rename' ? (activeTab.value?.name ?? '') : '',
    shared: false,
  }
  await nextTick()
  nameInput.value?.focus()
}
function submitName() {
  const form = naming.value
  if (!form || form.name.trim() === '') return
  if (form.mode === 'new') emit('save', form.name.trim(), form.shared)
  else if (props.active) emit('rename', props.active, form.name.trim())
  naming.value = null
}
function choose(key: string | null) {
  menu.value = null
  emit('select', key)
}
function act(run: () => void) {
  menu.value = null
  run()
}
</script>

<template>
  <div ref="root" class="view-tabs">
    <div class="tabs" role="group" :aria-label="t('views.label')">
      <button type="button" class="tab" :aria-pressed="active === null" @click="choose(null)">
        {{ t('views.all') }}
        <Star v-if="defaultKey === null" :size="12" class="hidden-star" aria-hidden="true" />
      </button>
      <button
        v-for="tab in shown"
        :key="tab.key"
        type="button"
        class="tab"
        :aria-pressed="active === tab.key"
        @click="choose(tab.key)"
      >
        <Users v-if="tab.kind === 'shared'" :size="13" :aria-label="t('views.shared')" />
        {{ tab.name }}
        <Star v-if="defaultKey === tab.key" :size="12" :aria-label="t('views.isDefault')" />
      </button>
      <div v-if="more.length" class="menu-wrap">
        <button type="button" class="tab" :aria-expanded="menu === 'more'" aria-haspopup="true" @click.stop="menu = menu === 'more' ? null : 'more'">
          {{ t('views.more', { count: more.length }) }}
          <ChevronDown :size="14" aria-hidden="true" />
        </button>
        <ul v-if="menu === 'more'" class="menu card">
          <li v-for="tab in more" :key="tab.key">
            <button type="button" class="menu-item" @click="choose(tab.key)">{{ tab.name }}</button>
          </li>
        </ul>
      </div>
    </div>

    <div class="actions">
      <template v-if="dirty && !naming">
        <button v-if="activeTab?.editable" type="button" class="btn btn-sm" :disabled="busy" @click="emit('update')">
          <Check :size="14" aria-hidden="true" />
          {{ t('views.update') }}
        </button>
        <button type="button" class="btn btn-sm" :class="{ 'btn-primary': !activeTab?.editable }" :disabled="busy" @click="startNaming('new')">
          {{ t(activeTab ? 'views.saveAsNew' : 'views.save') }}
        </button>
      </template>
      <form v-if="naming" class="name-form" @submit.prevent="submitName">
        <label>
          <span class="visually-hidden">{{ t('views.name') }}</span>
          <input ref="nameInput" v-model="naming.name" class="input input-sm" maxlength="60" :placeholder="t('views.name')" @keydown.esc="naming = null" />
        </label>
        <label v-if="naming.mode === 'new'" class="share">
          <input v-model="naming.shared" type="checkbox" />
          {{ t('views.shareWithEveryone') }}
        </label>
        <button type="submit" class="btn btn-sm btn-primary" :disabled="busy || naming.name.trim() === ''">{{ t('views.saveName') }}</button>
        <button type="button" class="btn btn-sm btn-ghost" @click="naming = null">{{ t('common.cancel') }}</button>
      </form>
      <div v-if="activeTab" class="menu-wrap">
        <button type="button" class="btn btn-sm btn-ghost btn-icon" :aria-label="t('views.actions', { name: activeTab.name })" :title="t('views.actions', { name: activeTab.name })" :aria-expanded="menu === 'actions'" aria-haspopup="true" @click.stop="menu = menu === 'actions' ? null : 'actions'">
          <MoreHorizontal :size="16" aria-hidden="true" />
        </button>
        <ul v-if="menu === 'actions'" class="menu card end">
          <li>
            <button type="button" class="menu-item" @click="act(() => emit('setDefault', defaultKey === activeTab?.key ? null : (activeTab?.key ?? null)))">
              {{ t(defaultKey === activeTab.key ? 'views.unsetDefault' : 'views.setDefault') }}
            </button>
          </li>
          <template v-if="activeTab.editable">
            <li><button type="button" class="menu-item" @click="startNaming('rename')">{{ t('views.rename') }}</button></li>
            <li>
              <button type="button" class="menu-item" @click="act(() => activeTab && emit('share', activeTab.key, !activeTab.shared))">
                {{ t(activeTab.shared ? 'views.stopSharing' : 'views.share') }}
              </button>
            </li>
            <li><button type="button" class="menu-item danger" @click="act(() => activeTab && emit('remove', activeTab.key))">{{ t('views.delete') }}</button></li>
          </template>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.15rem;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-weight: 550;
  cursor: pointer;
}
.tab:hover {
  color: var(--text);
}
.tab[aria-pressed='true'] {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.hidden-star {
  display: none;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding-bottom: 0.35rem;
}
.name-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.input-sm {
  height: 2rem;
  padding: 0 0.5rem;
  min-width: 12rem;
}
.share {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.9rem;
}
.menu-wrap {
  position: relative;
}
.menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  min-width: 12rem;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  box-shadow: var(--shadow);
}
.menu.end {
  left: auto;
  right: 0;
}
.menu-item {
  display: block;
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.menu-item:hover {
  background: var(--surface-2);
}
.menu-item.danger {
  color: var(--danger);
}
</style>
