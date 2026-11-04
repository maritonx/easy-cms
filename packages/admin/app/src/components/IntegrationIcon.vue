<script setup lang="ts">
import type { IntegrationLogo } from '@easy-cms/core'
import { computed } from 'vue'
import { collectionIcon, ICON_NAMES } from '../lib/icons'

/**
 * An integration's logo (#363): its SVG paths, an admin icon by name, or its first letter. A
 * one-color logo takes the brand's color unless it would all but vanish on the tile (a black logo in
 * dark mode), then the text color. Logos are exempt from WCAG's 3:1, and the name stands beside it.
 */
const props = defineProps<{ icon?: string | IntegrationLogo | undefined; name: string }>()

const logo = computed(() => (typeof props.icon === 'object' ? props.icon : null))
const named = computed(() =>
  typeof props.icon === 'string' && ICON_NAMES.includes(props.icon)
    ? collectionIcon(props.icon)
    : null,
)

/** WCAG contrast of two `#rrggbb` colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
// The tile's background in each theme (`--surface-2` in styles.css).
const TILE = { light: '#f2f2f4', dark: '#1d1d21' }
/** Below this the logo is hard to make out at all: black on dark is 1.1, Telegram's blue on light 2.5. */
const VISIBLE = 1.6
const colors = computed(() => {
  const color = logo.value?.color
  if (!color) return {}
  return {
    '--logo-light': contrast(color, TILE.light) >= VISIBLE ? color : 'var(--text)',
    '--logo-dark': contrast(color, TILE.dark) >= VISIBLE ? color : 'var(--text)',
  }
})
</script>

<template>
  <span :class="['logo', { 'integration-logo': logo }]" :style="colors" aria-hidden="true">
    <svg v-if="logo" :viewBox="logo.viewBox ?? '0 0 24 24'" width="22" height="22" focusable="false">
      <path v-for="(path, i) in logo.paths" :key="i" :d="path.d" :fill="path.fill ?? 'currentColor'" />
    </svg>
    <component :is="named" v-else-if="named" :size="18" />
    <template v-else>{{ name.charAt(0).toUpperCase() }}</template>
  </span>
</template>

<style scoped>
.logo {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 700;
}
/* Over `.logo`, here and in the page that holds it, whatever order the rules end up in. */
.logo.integration-logo {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--logo-light, var(--text));
}
/* Whole selectors: Vue keeps only what is inside :global(). */
:global(:root[data-theme='dark'] .logo.integration-logo) {
  color: var(--logo-dark, var(--text));
}
@media (prefers-color-scheme: dark) {
  :global(:root:not([data-theme='light']) .logo.integration-logo) {
    color: var(--logo-dark, var(--text));
  }
}
</style>
