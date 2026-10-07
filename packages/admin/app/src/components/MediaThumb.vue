<script setup lang="ts">
import { EyeOff, Play } from '@lucide/vue'
import { computed } from 'vue'
import { extensionOf, fileKind, KIND_ICON } from '../lib/filetypes'
import { t } from '../lib/i18n'

type Media = Record<string, unknown>

const props = withDefaults(defineProps<{ media: Media; size?: 'small' | 'card' | 'large' }>(), {
  size: 'small',
})

const isImage = computed(
  () => typeof props.media.mimeType === 'string' && props.media.mimeType.startsWith('image/'),
)
const src = computed(() => {
  const sizes = (props.media.sizes ?? {}) as Record<string, { url?: string }>
  // Prefer a small resized copy for thumbnails.
  const small =
    props.size !== 'large' ? (sizes.thumbnail?.url ?? Object.values(sizes)[0]?.url) : undefined
  return String(small ?? props.media.url ?? '')
})
/** The image's own size, so the page keeps its space while it loads. */
const dimension = (value: unknown) => (typeof value === 'number' && value > 0 ? value : undefined)
const kind = computed(() => fileKind(props.media.mimeType))
const extension = computed(() => extensionOf(props.media.filename))
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
    <!-- Other files: their type's icon and color, with the extension. -->
    <span v-else :class="['file', `kind-${kind}`]" aria-hidden="true">
      <component :is="KIND_ICON[kind]" class="file-icon" :stroke-width="1.6" />
      <span v-if="extension" class="ext">{{ extension }}</span>
      <span v-if="kind === 'video' || kind === 'audio'" class="play"><Play :size="10" /></span>
    </span>
    <!-- In a private folder: only for who may see it. -->
    <span v-if="media.private && size !== 'large'" class="private" :title="t('media.private')">
      <EyeOff :size="size === 'small' ? 10 : 13" :aria-label="t('media.private')" />
    </span>
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
.thumb {
  position: relative;
}
.private {
  position: absolute;
  bottom: 0.25rem;
  left: 0.25rem;
  display: grid;
  place-items: center;
  padding: 0.2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--warning-text);
  line-height: 0;
}
.small .private {
  bottom: 0.1rem;
  left: 0.1rem;
  padding: 0.12rem;
}
.card {
  width: 100%;
  aspect-ratio: 4 / 3;
}
.card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* Files without a picture: a soft tint of their type's color behind the icon. */
.thumb:has(.file) {
  background: color-mix(in srgb, var(--kind) 9%, var(--surface));
  border-color: color-mix(in srgb, var(--kind) 22%, var(--border));
}
.thumb:has(.kind-pdf) { --kind: var(--kind-pdf); }
.thumb:has(.kind-word) { --kind: var(--kind-word); }
.thumb:has(.kind-sheet) { --kind: var(--kind-sheet); }
.thumb:has(.kind-slides) { --kind: var(--kind-slides); }
.thumb:has(.kind-archive) { --kind: var(--kind-archive); }
.thumb:has(.kind-audio) { --kind: var(--kind-audio); }
.thumb:has(.kind-video) { --kind: var(--kind-video); }
.thumb:has(.kind-text) { --kind: var(--kind-text); }
.thumb:has(.kind-image) { --kind: var(--kind-image); }
.thumb:has(.kind-file) { --kind: var(--kind-file); }
.file {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  color: var(--kind);
}
.file-icon {
  width: 1.5rem;
  height: 1.5rem;
}
.card .file-icon {
  width: 2.75rem;
  height: 2.75rem;
}
.large .file-icon {
  width: 4rem;
  height: 4rem;
}
.ext {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
}
.small .ext {
  display: none;
}
.card .ext,
.large .ext {
  font-size: 0.75rem;
}
.play {
  position: absolute;
  top: -0.2rem;
  right: -0.35rem;
  display: grid;
  place-items: center;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  background: var(--kind);
  color: var(--surface);
}
</style>
