<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, onBeforeUnmount, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import PluginElement from '../components/PluginElement.vue'
import { label, t } from '../lib/i18n'
import { crumbsFor } from '../lib/nav'
import { session } from '../lib/session'
import { brandName } from '../lib/theme'

/** A page of its own from `admin.pages`, e.g. a plugin's report: the admin's header, the plugin's body. */
const route = useRoute()
const page = computed(() => session.schema?.pages.find((p) => p.path === String(route.params.path)))
const title = computed(() => (page.value ? label(page.value.label, page.value.path) : ''))
/** What follows the page's own path, e.g. `contact` in `/p/forms-overview/contact`, and the query. */
const pageRoute = computed(() => {
  const rest = route.params.rest
  const subpath = Array.isArray(rest) ? rest.join('/') : (rest ?? '')
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first === 'string') query[key] = first
  }
  return { subpath, query }
})

watchEffect(() => {
  document.title = title.value ? `${title.value} · ${brandName()}` : brandName()
})
onBeforeUnmount(() => {
  document.title = brandName()
})
</script>

<template>
  <p v-if="!page" class="notice">{{ t('common.notFound') }} <RouterLink to="/">{{ t('common.back') }}</RouterLink></p>
  <template v-else>
    <nav v-if="crumbsFor(route.path).length" class="crumbs" :aria-label="t('list.breadcrumb')">
      <template v-for="crumb in crumbsFor(route.path)" :key="crumb">
        <span>{{ crumb }}</span>
        <ChevronRight :size="14" aria-hidden="true" />
      </template>
      <span class="current">{{ title }}</span>
    </nav>
    <header class="page-header">
      <h1>{{ title }}</h1>
    </header>
    <!-- A new element per page: one page's state never leaks into another's. -->
    <PluginElement :key="page.path" :component="page.component" :route="pageRoute" />
  </template>
</template>

<style scoped>
.crumbs {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
  color: var(--faint);
  font-size: 0.875rem;
}
.crumbs .current {
  color: var(--text-muted);
}
.page-header {
  margin-bottom: 1.25rem;
}
</style>
