<script setup lang="ts">
import { seoMeta } from '@easy-cms/plugin-seo'
import { renderRichText } from '@easy-cms/richtext'

const route = useRoute()
const locale = computed(() => (route.query.locale === 'en' ? 'en' : 'th'))
const path = computed(() => `/${([] as string[]).concat(route.params.path ?? []).join('/')}`)
const { data: page, error } = await useFetch('/api/page', {
  query: { path, locale },
  headers: useRequestHeaders(['cookie']),
})

// A page's address on this site: /p and its path, English at ?locale=en (like pageURL in
// easy-cms.config.ts).
const href = (p: string) => `/p${p}${locale.value === 'en' ? '?locale=en' : ''}`
const breadcrumbs = computed(() => page.value?.breadcrumbs ?? [])

// Metadata, with BreadcrumbList JSON-LD so search results can show where the page sits.
const seo = seoMeta(page.value ?? {}, {
  siteUrl: useRequestURL().origin,
  locale: locale.value,
  url: (p) => (typeof p.path === 'string' ? href(p.path) : null),
  breadcrumbs: breadcrumbs.value.map((b) => ({ name: b.label ?? '', url: href(b.url ?? '') })),
})
useSeoMeta(seo.nuxt)
useHead(seo.head)

// renderRichText escapes text and drops unsafe URLs, so the HTML is safe for v-html.
const html = computed(() => renderRichText(page.value?.body))
</script>

<template>
  <p v-if="error && !page">Page not found. <NuxtLink to="/">Back</NuxtLink></p>
  <article v-else-if="page">
    <nav v-if="breadcrumbs.length > 1" aria-label="Breadcrumb" class="breadcrumbs">
      <ol>
        <li v-for="(crumb, i) in breadcrumbs" :key="crumb.id">
          <NuxtLink v-if="i < breadcrumbs.length - 1" :to="href(crumb.url ?? '')">{{ crumb.label }}</NuxtLink>
          <span v-else aria-current="page">{{ crumb.label }}</span>
        </li>
      </ol>
    </nav>
    <p v-if="page.status === 'draft'"><strong>Draft preview</strong></p>
    <h1>{{ page.title }}</h1>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized by renderRichText -->
    <div class="body" v-html="html" />
  </article>
</template>

<style scoped>
.breadcrumbs ol {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
  color: #656d76;
}
.breadcrumbs li + li::before {
  content: '›';
  margin-right: 0.4rem;
}
</style>
