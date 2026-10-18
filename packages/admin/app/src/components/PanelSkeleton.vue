<script setup lang="ts">
import LoadingStatus from './LoadingStatus.vue'
import Skeleton from './Skeleton.vue'

/** A settings page's card that is still loading: a heading and a few rows. */
withDefaults(defineProps<{ rows?: number }>(), { rows: 4 })
</script>

<template>
  <div aria-busy="true">
    <LoadingStatus />
    <section class="card panel-skeleton">
      <Skeleton width="10rem" height="1rem" />
      <div v-for="n in rows" :key="n" class="panel-skeleton-row">
        <span class="panel-skeleton-lines">
          <Skeleton :width="`${40 + ((n * 13) % 30)}%`" />
          <Skeleton width="25%" height="0.7em" />
        </span>
        <Skeleton shape="block" width="5rem" height="1.9rem" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel-skeleton {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1.25rem;
}
.panel-skeleton-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.panel-skeleton-lines {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0.45rem;
}
</style>
