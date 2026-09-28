<script setup lang="ts">
import { seoMeta } from '@easy-cms/plugin-seo'
import { renderRichText } from '@easy-cms/richtext'

const route = useRoute()
const locale = computed(() => (route.query.locale === 'en' ? 'en' : 'th'))
const { data: post, error } = await useFetch(`/api/posts/${route.params.slug}`, {
  query: { locale },
  headers: useRequestHeaders(['cookie']),
})
// In the admin's live preview the post follows the form as you type, unsaved.
useLivePreview(post)

// Search and share metadata from the post's SEO fields, rendered on the server: title,
// description, Open Graph, "noindex", the canonical and hreflang links, and JSON-LD.
const seo = seoMeta(post.value ?? {}, {
  siteUrl: useRequestURL().origin,
  locale: locale.value,
  locales: ['th', 'en'],
  defaultLocale: 'th',
  // The same address as generateURL in easy-cms.config.ts.
  url: (p, l) => `/posts/${p.slug}${l === 'en' ? '?locale=en' : ''}`,
  type: 'article',
})
useSeoMeta(seo.nuxt)
useHead(seo.head)

const cover = computed(() => {
  const c = post.value?.cover
  return c && typeof c === 'object' ? { url: String(c.url), alt: String(c.alt ?? '') } : null
})
// renderRichText escapes text and drops unsafe URLs, so the HTML is safe for v-html.
const html = computed(() => renderRichText(post.value?.body))
</script>

<template>
  <p v-if="error && !post">Post not found. <NuxtLink to="/">Back</NuxtLink></p>
  <article v-else-if="post">
    <p v-if="post.status === 'draft'"><strong>Draft preview</strong></p>
    <img v-if="cover" :src="cover.url" :alt="cover.alt" class="cover" />
    <h1>{{ post.title }}</h1>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized by renderRichText -->
    <div class="body" v-html="html" />
    <template v-for="section in post.sections" :key="section.id">
      <blockquote v-if="section.blockType === 'quote'" class="quote">
        {{ section.text }}<footer v-if="section.author">— {{ section.author }}</footer>
      </blockquote>
      <aside v-else-if="section.blockType === 'callout'" :class="['callout', section.tone]">{{ section.text }}</aside>
    </template>
  </article>
</template>

<style scoped>
.cover {
  width: 100%;
  border-radius: 8px;
}
.quote {
  margin: 1.5rem 0;
  padding-left: 1rem;
  border-left: 4px solid #2f6f5e;
  font-style: italic;
}
.callout {
  margin: 1.5rem 0;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  background: #e3efe9;
}
.callout.warning {
  background: #fdf1d8;
}
</style>
