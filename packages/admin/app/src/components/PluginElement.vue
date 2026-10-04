<script setup lang="ts">
import type { AdminComponentRef, AdminField } from '@easy-cms/core'
import { inject, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { contentLocale } from '../lib/content-locale'
import { t, locale as uiLocale } from '../lib/i18n'
import {
  API_VERSION,
  type ElementContext,
  FORM,
  modulesLoaded,
  type PageRoute,
} from '../lib/plugins'
import { session } from '../lib/session'

/**
 * Shows a Web Component from an admin module and passes it the edit page's state (see
 * `ElementContext`). Waits for the module to define the element before creating it, so the
 * properties set here are never shadowed by an element that is not upgraded yet.
 */
const props = defineProps<{
  component: AdminComponentRef
  value?: unknown
  path?: string
  field?: AdminField
  label?: string
  readOnly?: boolean
  /** On a page of its own (`admin.pages`): the rest of its path and the query. */
  route?: PageRoute
}>()
const emit = defineEmits<{ change: [unknown] }>()

const form = inject(FORM, null)
const router = useRouter()
const host = ref<HTMLElement>()
const missing = ref(false)
let element: HTMLElement | undefined

function onChange(event: Event) {
  // Native `change` events from inputs inside the element bubble too; only ours carry detail.
  if (event instanceof CustomEvent && event.target === element) emit('change', event.detail)
}
/** `navigate` with a path inside the admin as `detail`, e.g. `/p/forms-overview/contact?range=30`. */
function onNavigate(event: Event) {
  if (!(event instanceof CustomEvent) || event.target !== element) return
  const to = event.detail
  if (typeof to === 'string' && to.startsWith('/') && !to.startsWith('//')) void router.push(to)
}
function onSetField(event: Event) {
  if (!(event instanceof CustomEvent) || props.readOnly) return
  const { path, value } = (event.detail ?? {}) as { path?: unknown; value?: unknown }
  if (typeof path === 'string' && path !== '') form?.setField(path, value)
}

function context(): ElementContext {
  return {
    apiVersion: API_VERSION,
    value: props.value === undefined ? undefined : JSON.parse(JSON.stringify(props.value ?? null)),
    path: props.path,
    field: props.field,
    label: props.label,
    doc: JSON.parse(JSON.stringify(form?.doc.value ?? {})),
    collection: form?.collection,
    global: form?.global,
    id: form?.id.value ?? null,
    locale: contentLocale(),
    uiLocale: uiLocale.value,
    readOnly: props.readOnly === true,
    options: props.component.props ?? {},
    user: session.user
      ? { id: session.user.id, email: session.user.email, role: session.user.role }
      : null,
    route: props.route
      ? { subpath: props.route.subpath, query: { ...props.route.query } }
      : undefined,
    api,
  }
}

onMounted(async () => {
  const tag = props.component.tag
  const defined = customElements.whenDefined(tag).then(() => true)
  // Modules that failed, or never define the tag, would leave an empty space: say so instead.
  const ready = await Promise.race([
    defined,
    modulesLoaded().then(() => customElements.get(tag) !== undefined),
  ])
  if (!ready) {
    missing.value = true
    console.error(`Easy CMS: no admin module defines <${tag}>`)
    return
  }
  if (!host.value) return
  element = document.createElement(tag)
  element.addEventListener('change', onChange)
  element.addEventListener('set-field', onSetField)
  element.addEventListener('navigate', onNavigate)
  Object.assign(element, context())
  host.value.append(element)
})

// Every change to the form or the value is passed on; `context()` reads all of it.
watchEffect(() => {
  const next = context()
  if (element) Object.assign(element, next)
})

onBeforeUnmount(() => {
  element?.removeEventListener('change', onChange)
  element?.removeEventListener('set-field', onSetField)
  element?.removeEventListener('navigate', onNavigate)
})
</script>

<template>
  <div ref="host" class="plugin-element" :data-component="component.tag">
    <p v-if="missing" class="field-hint">{{ t('plugin.missing', { tag: component.tag }) }}</p>
  </div>
</template>

<style scoped>
.plugin-element {
  min-width: 0;
}
</style>
