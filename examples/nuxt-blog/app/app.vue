<script setup lang="ts">
import { jsonLdScript, siteJsonLd } from '@easy-cms/plugin-seo'

const route = useRoute()
const { data: site } = await useFetch('/api/site', {
  query: { locale: computed(() => (route.query.locale === 'en' ? 'en' : 'th')) },
})
// Pages and the pages under them, from the nested docs plugin.
const { data: menu } = await useFetch('/api/menu', {
  query: { locale: computed(() => (route.query.locale === 'en' ? 'en' : 'th')) },
})
const pageLink = (path: string | null) =>
  path ? `/p${path}${route.query.locale === 'en' ? '?locale=en' : ''}` : '/'
const origin = useRequestURL().origin
useHead({
  title: () => site.value?.siteName ?? 'Blog',
  // Who publishes the site, for search engines: Organization and WebSite JSON-LD.
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () =>
        jsonLdScript(siteJsonLd({ name: site.value?.siteName ?? 'Blog', url: origin })),
    },
  ],
})
</script>

<template>
  <div class="page">
    <header>
      <NuxtLink to="/" class="brand">{{ site?.siteName }}</NuxtLink>
      <p v-if="site?.tagline">{{ site.tagline }}</p>
      <nav v-if="menu?.length" aria-label="Pages" class="menu">
        <ul>
          <li v-for="item in menu" :key="item.id">
            <NuxtLink :to="pageLink(item.path)">{{ item.title }}</NuxtLink>
            <ul v-if="item.children.length">
              <li v-for="child in item.children" :key="child.id">
                <NuxtLink :to="pageLink(child.path)">{{ child.title }}</NuxtLink>
              </li>
            </ul>
          </li>
        </ul>
      </nav>
    </header>
    <main><NuxtPage /></main>
    <footer>Powered by Easy CMS · <a href="/api/cms/posts">REST API</a> · <NuxtLink to="/contact">Contact</NuxtLink></footer>
  </div>
</template>

<style>
body { margin: 0; font-family: system-ui, sans-serif; color: #1f2328; background: #fff; }
.page { max-width: 42rem; margin: 0 auto; padding: 2rem 1rem; }
.brand { font-size: 1.5rem; font-weight: 700; color: inherit; text-decoration: none; }
footer { margin-top: 4rem; color: #656d76; font-size: 0.875rem; }
a { color: #0969da; }
.menu ul { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0.5rem 0 0; padding: 0; list-style: none; }
.menu li ul { display: inline-flex; margin: 0 0 0 0.5rem; font-size: 0.875rem; }
</style>
