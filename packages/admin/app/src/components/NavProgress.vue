<script setup lang="ts">
import { navigating, useDelayedLoading } from '../lib/loading'

// Only for route changes: the next page's own skeleton takes over once it is shown.
const shown = useDelayedLoading(navigating)
</script>

<template>
  <div v-if="shown" class="progress-line nav-progress" aria-hidden="true"><span /></div>
</template>

<style scoped>
.nav-progress {
  position: fixed;
  inset: 0 0 auto;
  z-index: 1000;
}
</style>
