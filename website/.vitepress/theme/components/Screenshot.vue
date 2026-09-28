<script setup lang="ts">
import { useData, withBase } from 'vitepress'
import { computed } from 'vue'

/**
 * A screenshot of the admin in the page's language and the reader's theme, from
 * public/screenshots (made with `pnpm docs:screenshots`).
 */
const props = defineProps<{ name: string; alt: string; caption?: string }>()
const { isDark, lang } = useData()
const src = computed(() =>
  withBase(
    `/screenshots/${props.name}-${lang.value === 'th' ? 'th' : 'en'}-${isDark.value ? 'dark' : 'light'}.webp`,
  ),
)
</script>

<template>
  <figure class="screenshot">
    <img :src="src" :alt="alt" width="1440" height="900" loading="lazy" />
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.screenshot {
  margin: 24px 0;
}
.screenshot img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}
figcaption {
  margin-top: 8px;
  font-size: 14px;
  color: var(--vp-c-text-2);
  text-align: center;
}
</style>
