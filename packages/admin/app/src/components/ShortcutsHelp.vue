<script setup lang="ts">
import { X } from '@lucide/vue'
import { nextTick, ref, watch } from 'vue'
import { t } from '../lib/i18n'
import { modKey, overlays } from '../lib/shortcuts'

/** `?`: the admin's keyboard shortcuts. */
const dialog = ref<HTMLElement>()
const rows = () => [
  { keys: [modKey(), 'K'], what: t('shortcuts.palette') },
  { keys: ['/'], what: t('shortcuts.palette') },
  { keys: [modKey(), 'S'], what: t('shortcuts.save') },
  { keys: [modKey(), '⇧', 'P'], what: t('shortcuts.publish') },
  { keys: ['['], what: t('shortcuts.rail') },
  { keys: ['g', 'd'], what: t('shortcuts.dashboard') },
  { keys: ['?'], what: t('shortcuts.help') },
  { keys: ['Esc'], what: t('shortcuts.close') },
]
watch(
  () => overlays.help,
  async (open) => {
    if (!open) return
    await nextTick()
    dialog.value?.focus()
  },
)
</script>

<template>
  <div v-if="overlays.help" class="help-layer" @pointerdown.self="overlays.help = false">
    <div
      ref="dialog"
      class="help"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      tabindex="-1"
      @keydown.esc="overlays.help = false"
    >
      <div class="help-head">
        <h2 id="shortcuts-title">{{ t('shortcuts.title') }}</h2>
        <button type="button" class="btn btn-ghost btn-icon" :aria-label="t('nav.close')" @click="overlays.help = false">
          <X :size="18" aria-hidden="true" />
        </button>
      </div>
      <dl>
        <template v-for="row in rows()" :key="row.keys.join('+') + row.what">
          <dt><kbd v-for="k in row.keys" :key="k">{{ k }}</kbd></dt>
          <dd>{{ row.what }}</dd>
        </template>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.help-layer {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(24 24 27 / 45%);
}
.help {
  width: min(28rem, 100%);
  padding: 1rem 1.25rem 1.25rem;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
  outline: none;
}
.help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  margin: 0;
  font-size: 1.1rem;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.6rem 1rem;
  margin: 1rem 0 0;
}
dt {
  display: flex;
  gap: 0.25rem;
}
dd {
  margin: 0;
  color: var(--text-muted);
}
kbd {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-2);
}
</style>
