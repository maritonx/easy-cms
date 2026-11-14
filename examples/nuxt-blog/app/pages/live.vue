<script setup lang="ts">
import { createClient } from '@easy-cms/core/client'
import type config from '~~/easy-cms.config'

// Posts as they are published, edited and removed, without reloading (realtime, ADR-0070).
useHead({ title: 'Live posts' })
// The REST API on this site; the browser's session cookie comes along, so editors who signed in
// read what they may read, visitors the published posts.
const cms = createClient<typeof config>({ url: '/api/cms' })
const { docs, ready, error } = useLive(cms, 'posts', { sort: '-createdAt', limit: 20, depth: 0 })
</script>

<template>
  <section>
    <h1>Live posts</h1>
    <p>This list follows the CMS: publish or edit a post in the admin and it changes here.</p>
    <p v-if="error" role="alert">Couldn’t load the posts: {{ error.message }}</p>
    <p v-else-if="!ready">Loading…</p>
    <p v-else-if="docs.length === 0">No posts yet.</p>
    <ul v-else data-testid="live-posts">
      <li v-for="post in docs" :key="String(post.id)">
        <NuxtLink :to="`/posts/${post.slug}`">{{ post.title }}</NuxtLink>
      </li>
    </ul>
  </section>
</template>
