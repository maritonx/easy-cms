<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '../lib/api'
import { t } from '../lib/i18n'

const props = defineProps<{
  /** The preview endpoint, e.g. `/posts/3/preview`, `/posts/preview` or `/globals/site/preview`. */
  path: string
  /** The unsaved form values. */
  data: Record<string, unknown>
  collection?: string
  global?: string
  /** Extra query, e.g. the content locale (`&locale=en`). */
  query?: string
}>()

const frame = ref<HTMLIFrameElement>()
const src = ref<string | null>(null)
const noPage = ref(false)
const error = ref('')
let latest: Record<string, unknown> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let request = 0

/** The page's site, named in the header (e.g. `localhost:5173`). */
const site = computed(() => (src.value ? new URL(src.value).host : ''))
/**
 * The page said it is ready (live preview on the site). Without it after a while, a hint: the
 * browser doesn't tell the admin whether a page of another site loaded, so the site may be down
 * (an empty panel) or up without live preview (a page that doesn't follow the form).
 */
const ready = ref(false)
const quiet = ref(false)
const QUIET_AFTER = 10_000
let quietTimer: ReturnType<typeof setTimeout> | undefined
function listen() {
  ready.value = false
  quiet.value = false
  clearTimeout(quietTimer)
  quietTimer = setTimeout(() => {
    if (!ready.value) quiet.value = true
  }, QUIET_AFTER)
}
watch(src, (value) => {
  if (value) listen()
})

/** Sends the current document to the page (after it said it is ready, or on every change). */
function send() {
  const target = frame.value?.contentWindow
  if (!target || !latest || !src.value) return
  target.postMessage(
    { type: 'easy-cms:preview', collection: props.collection, global: props.global, doc: latest },
    new URL(src.value).origin,
  )
}

async function refresh() {
  const current = ++request
  try {
    const result = await api<{ doc: Record<string, unknown>; url: string | null }>(
      'POST',
      `${props.path}?depth=2${props.query ?? ''}`,
      props.data,
    )
    if (current !== request) return // a newer change is on its way
    error.value = ''
    latest = result.doc
    if (!result.url) {
      noPage.value = true
      return
    }
    // The page loads once; later changes arrive as messages, so typing never reloads it.
    src.value ??= new URL(result.url, window.location.origin).href
    send()
  } catch (e) {
    if (current === request) error.value = (e as Error).message
  }
}

function onMessage(event: MessageEvent) {
  if (
    event.source === frame.value?.contentWindow &&
    event.data?.type === 'easy-cms:preview-ready'
  ) {
    ready.value = true
    quiet.value = false
    send()
  }
}

function reload() {
  if (frame.value && src.value) {
    frame.value.src = src.value
    listen()
  }
}

// Another content locale: load that locale's page (its URL may differ).
watch(
  () => props.query,
  () => {
    src.value = null
    void refresh()
  },
)
watch(
  () => props.data,
  () => {
    clearTimeout(timer)
    timer = setTimeout(refresh, 300)
  },
  { deep: true },
)
onMounted(() => {
  window.addEventListener('message', onMessage)
  void refresh()
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  clearTimeout(timer)
  clearTimeout(quietTimer)
})
</script>

<template>
  <section class="card preview" :aria-label="t('preview.title')">
    <header>
      <h2>
        {{ t('preview.title') }}
        <span v-if="site" class="site">{{ site }}</span>
      </h2>
      <div v-if="src" class="tools">
        <button type="button" class="btn btn-small" @click="reload">{{ t('preview.reload') }}</button>
        <a :href="src" target="_blank" rel="noopener" class="btn btn-small">{{ t('preview.open') }}</a>
      </div>
    </header>
    <p v-if="error" class="field-error">{{ error }}</p>
    <p v-else-if="noPage" class="muted">{{ t('preview.none') }}</p>
    <p v-if="quiet && src && !error" class="quiet" role="status">{{ t('preview.quiet', { site }) }}</p>
    <iframe v-else-if="src" ref="frame" :src="src" :title="t('preview.title')" />
    <p v-else class="muted loading-line" aria-live="polite"><span class="spinner" aria-hidden="true" />{{ t('common.loading') }}</p>
  </section>
</template>

<style scoped>
.preview {
  position: sticky;
  top: 5rem;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 6rem);
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
h2 {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  min-width: 0;
  margin: 0;
  font-size: 0.95rem;
}
.site {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quiet {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 0.8125rem;
}
.tools {
  display: flex;
  gap: 0.35rem;
}
.btn-small {
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  text-decoration: none;
}
iframe {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}
p {
  padding: 1rem;
}
</style>
