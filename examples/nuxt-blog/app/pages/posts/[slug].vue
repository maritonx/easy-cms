<script setup lang="ts">
import { renderRichText } from '@easy-cms/richtext'

const route = useRoute()
const { data: post, error } = await useFetch(`/api/posts/${route.params.slug}`, {
  headers: useRequestHeaders(['cookie']),
})
// In the admin's live preview the post follows the form as you type, unsaved.
useLivePreview(post)

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
  </article>
</template>

<style scoped>
.cover {
  width: 100%;
  border-radius: 8px;
}
</style>
