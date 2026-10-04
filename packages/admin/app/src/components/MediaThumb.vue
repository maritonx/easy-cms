<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../lib/i18n'

type Media = Record<string, unknown>

const props = withDefaults(defineProps<{ media: Media; size?: 'small' | 'large' }>(), {
  size: 'small',
})

const isImage = computed(
  () => typeof props.media.mimeType === 'string' && props.media.mimeType.startsWith('image/'),
)
const src = computed(() => {
  const sizes = (props.media.sizes ?? {}) as Record<string, { url?: string }>
  // Prefer a small resized copy for thumbnails.
  const small =
    props.size === 'small' ? (sizes.thumbnail?.url ?? Object.values(sizes)[0]?.url) : undefined
  return String(small ?? props.media.url ?? '')
})
/** The image's own size, so the page keeps its space while it loads. */
const dimension = (value: unknown) => (typeof value === 'number' && value > 0 ? value : undefined)
const extension = computed(
  () =>
    String(props.media.filename ?? '')
      .split('.')
      .pop()
      ?.toUpperCase() ?? '',
)
</script>

<template>
  <!-- Large: the whole image, as big as fits; a click opens the original. -->
  <div :class="['thumb', size]">
    <a
      v-if="size === 'large' && isImage && src"
      :href="src"
      target="_blank"
      rel="noopener"
      :title="t('media.openOriginal')"
    >
      <img
        :src="src"
        :alt="String(media.alt ?? '')"
        :width="dimension(media.width)"
        :height="dimension(media.height)"
      />
    </a>
    <img v-else-if="isImage && src" :src="src" :alt="String(media.alt ?? '')" loading="lazy" />
    <span v-else class="file" aria-hidden="true">{{ extension }}</span>
  </div>
</template>

<style scoped>
.thumb {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background:
    repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px;
  border: 1px solid var(--border);
}
.small {
  width: 3rem;
  height: 3rem;
}
.small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.large {
  width: 100%;
  min-height: 10rem;
  padding: 0.5rem;
}
.large a {
  display: block;
  max-width: 100%;
  line-height: 0;
  cursor: zoom-in;
}
.large a:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
/* Its own proportions, within the column's width and 70% of the screen's height. */
.large img {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 70vh;
}
.file {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}
</style>
