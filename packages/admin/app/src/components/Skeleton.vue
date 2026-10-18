<script setup lang="ts">
/**
 * A grey placeholder in the shape of content that is still loading. Hidden from assistive
 * technology: the region it sits in says "Loading…" once instead (see `LoadingStatus`).
 */
defineProps<{
  /** CSS width, e.g. `60%` or `8rem`. Default: the whole line. */
  width?: string | undefined
  /** CSS height. Default: one line of text. */
  height?: string | undefined
  /** `line` (default): text; `block`: an image or a control; `circle`: an avatar or icon. */
  shape?: 'line' | 'block' | 'circle'
}>()
</script>

<template>
  <span :class="['skeleton', shape ?? 'line']" :style="{ width, height }" aria-hidden="true" />
</template>
