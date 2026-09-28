<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { onMounted, ref, useId } from 'vue'
import { t } from '../lib/i18n'

/** Shows a new API key once, right after it was created; only a hash is stored. */
defineProps<{ apiKey: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const headingId = useId()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(input.value?.value ?? '')
    copied.value = true
  } catch {
    // Clipboard blocked: the key is selected, so Ctrl/⌘+C works.
    input.value?.select()
  }
}

onMounted(() => {
  dialog.value?.showModal()
  input.value?.select()
})
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="key-dialog" :aria-labelledby="headingId" @cancel.prevent>
      <h2 :id="headingId">{{ t('apiKey.createdTitle') }}</h2>
      <p>{{ t('apiKey.createdText') }}</p>
      <div class="key-row">
        <input ref="input" class="input mono" :value="apiKey" readonly :aria-label="t('apiKey.key')" />
        <button type="button" class="btn" @click="copy">
          <component :is="copied ? Check : Copy" :size="16" aria-hidden="true" />
          {{ copied ? t('apiKey.copied') : t('apiKey.copy') }}
        </button>
      </div>
      <pre class="example"><code>curl -H "Authorization: Bearer {{ apiKey.slice(0, 14) }}…" …</code></pre>
      <div class="actions">
        <button type="button" class="btn btn-primary" @click="emit('close')">{{ t('apiKey.done') }}</button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.key-dialog {
  width: min(34rem, calc(100vw - 2rem));
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.key-dialog::backdrop {
  background: rgb(0 0 0 / 40%);
}
h2 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
p {
  margin: 0 0 1rem;
  color: var(--text-muted);
  line-height: 1.5;
}
.key-row {
  display: flex;
  gap: 0.5rem;
}
.key-row .input {
  flex: 1;
  min-width: 0;
}
.mono {
  font-family: var(--mono);
  font-size: 0.85rem;
}
.example {
  margin: 1rem 0 0;
  padding: 0.6rem 0.8rem;
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 0.8rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.25rem;
}
</style>
