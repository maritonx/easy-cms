<script setup lang="ts">
import { CircleAlert, CircleCheck, X } from '@lucide/vue'
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '../lib/i18n'
import { clearToast, toast } from '../lib/toast'

const route = useRoute()
// An error belongs to the page it happened on.
watch(
  () => route.path,
  () => {
    if (toast.value?.kind === 'error') clearToast()
  },
)
</script>

<template>
  <div class="toast-region" aria-live="polite">
    <!-- out-in: never two messages (two status regions) at once. -->
    <Transition name="toast" mode="out-in">
      <div v-if="toast" :key="toast.id" :class="['toast', toast.kind]" role="status">
        <component :is="toast.kind === 'success' ? CircleCheck : CircleAlert" :size="18" aria-hidden="true" class="icon" />
        <span class="text">{{ toast.text }}</span>
        <button type="button" class="close" :aria-label="t('toast.dismiss')" @click="clearToast">
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-region {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: min(26rem, calc(100vw - 2rem));
  padding: 0.6rem 0.6rem 0.6rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  font-size: 0.9rem;
  pointer-events: auto;
}
.toast.success .icon {
  color: var(--ok);
}
.toast.error {
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
}
.toast.error .icon {
  color: var(--danger);
}
.icon {
  flex-shrink: 0;
}
.text {
  flex-grow: 1;
}
.close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--faint);
  cursor: pointer;
}
.close:hover {
  background: var(--surface-2);
  color: var(--text);
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
