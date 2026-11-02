<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import RelationshipField from '../fields/RelationshipField.vue'
import { label, t } from '../lib/i18n'
import { session } from '../lib/session'

/** A link in rich text: a web address, or a document kept by id (#326). */
export type LinkTarget = { href: string } | { doc: { relationTo: string; value: number | string } }

const props = defineProps<{ open: boolean; current: LinkTarget | null }>()
const emit = defineEmits<{ save: [LinkTarget]; remove: []; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
const urlInput = ref<HTMLInputElement>()
const id = useId()

/** Collections whose documents have a URL (their `preview`): the ones a link can point to. */
const linkable = computed(
  () => session.schema?.collections.filter((c) => c.preview && c.permissions.read) ?? [],
)
const mode = ref<'url' | 'doc'>('url')
const url = ref('')
const collection = ref('')
const docId = ref<number | string | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return dialog.value?.close()
    const current = props.current
    if (current && 'doc' in current) {
      mode.value = 'doc'
      collection.value = current.doc.relationTo
      docId.value = current.doc.value
      url.value = ''
    } else {
      mode.value = 'url'
      url.value = current?.href ?? 'https://'
      collection.value = linkable.value[0]?.slug ?? ''
      docId.value = null
    }
    dialog.value?.showModal()
    await nextTick()
    if (mode.value === 'url') urlInput.value?.select()
  },
)
watch(collection, (next, before) => {
  if (before && next !== before) docId.value = null
})

const ready = computed(() =>
  mode.value === 'url' ? url.value.trim() !== '' : !!collection.value && docId.value !== null,
)
function save() {
  if (!ready.value) return
  if (mode.value === 'url') emit('save', { href: url.value.trim() })
  else
    emit('save', { doc: { relationTo: collection.value, value: docId.value as number | string } })
}
</script>

<template>
  <dialog ref="dialog" class="dialog card" :aria-labelledby="`${id}-title`" @cancel.prevent="emit('cancel')">
    <form @submit.prevent="save">
      <h2 :id="`${id}-title`">{{ t('rte.link') }}</h2>
      <div v-if="linkable.length" class="modes" role="radiogroup" :aria-label="t('rte.linkTo')">
        <label class="mode"><input v-model="mode" type="radio" value="url" />{{ t('rte.linkWeb') }}</label>
        <label class="mode"><input v-model="mode" type="radio" value="doc" />{{ t('rte.linkDocument') }}</label>
      </div>
      <div v-if="mode === 'url'" class="field">
        <label class="field-label" :for="`${id}-url`">{{ t('rte.linkUrl') }}</label>
        <input :id="`${id}-url`" ref="urlInput" v-model="url" class="input" type="text" inputmode="url" autocomplete="off" />
      </div>
      <template v-else>
        <div class="field">
          <label class="field-label" :for="`${id}-collection`">{{ t('rte.linkCollection') }}</label>
          <select :id="`${id}-collection`" v-model="collection" class="input">
            <option v-for="c in linkable" :key="c.slug" :value="c.slug">{{ label(c.labels?.plural, c.slug) }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" :for="`${id}-doc`">{{ t('rte.linkDocumentField') }}</label>
          <RelationshipField
            :id="`${id}-doc`"
            :key="collection"
            :to="collection"
            :has-many="false"
            :no-create="true"
            :model-value="docId"
            :read-only="false"
            :invalid="false"
            @update:model-value="(value) => (docId = value as number | string | null)"
          />
          <p class="hint">{{ t('rte.linkDocumentHint') }}</p>
        </div>
      </template>
      <div class="actions">
        <button v-if="current" type="button" class="btn btn-ghost remove" @click="emit('remove')">{{ t('rte.linkRemove') }}</button>
        <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn btn-primary" :disabled="!ready">{{ t('rte.linkApply') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(28rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
  overflow: visible;
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
h2 {
  margin: 0 0 1rem;
  font-size: 1.05rem;
}
.modes {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.9rem;
}
.mode {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.field {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.9rem;
}
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--faint);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.remove {
  margin-right: auto;
  color: var(--danger);
}
</style>
