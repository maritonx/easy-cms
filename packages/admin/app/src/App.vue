<script setup lang="ts">
import NavProgress from './components/NavProgress.vue'
import ToastHost from './components/ToastHost.vue'
</script>

<template>
  <NavProgress />
  <RouterView />
  <ToastHost />
</template>
