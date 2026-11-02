<script setup lang="ts">
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Redo2,
  Table,
  TextQuote,
  Trash2,
  Underline,
  Undo2,
} from '@lucide/vue'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, Extension, useEditor } from '@tiptap/vue-3'
import { type Component, onBeforeUnmount, ref, watch } from 'vue'
import LinkDialog, { type LinkTarget } from '../components/LinkDialog.vue'
import MediaPicker from '../components/MediaPicker.vue'
import { api } from '../lib/api'
import { titleOf } from '../lib/fields'
import { t } from '../lib/i18n'
import { findCollection } from '../lib/session'

type Doc = Record<string, unknown>

const props = defineProps<{
  id: string
  modelValue: Doc | null
  readOnly: boolean
  invalid: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Doc | null] }>()

/**
 * Links to a document (#326): the link mark's `doc`, `{ relationTo, value }`. The server keeps
 * the id and works out the URL when the document is read.
 */
const DocLink = Extension.create({
  name: 'docLink',
  addGlobalAttributes() {
    return [
      {
        types: ['link'],
        attributes: {
          doc: {
            default: null,
            parseHTML: (element) => {
              try {
                return JSON.parse(element.getAttribute('data-doc') ?? 'null')
              } catch {
                return null
              }
            },
            renderHTML: (attributes) =>
              attributes.doc ? { 'data-doc': JSON.stringify(attributes.doc) } : {},
          },
        },
      },
    ]
  },
})

const editor = useEditor({
  content: props.modelValue ?? '',
  editable: !props.readOnly,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'] },
    }),
    Image,
    DocLink,
    // Tables without merged cells: what HTML, Markdown and the API's readers all handle.
    TableKit.configure({ table: { resizable: false } }),
  ],
  editorProps: {
    attributes: {
      id: props.id,
      class: 'rte-content',
      role: 'textbox',
      'aria-multiline': 'true',
      ...(props.invalid ? { 'aria-invalid': 'true' } : {}),
    },
  },
  onUpdate({ editor }) {
    emit('update:modelValue', editor.isEmpty ? null : (editor.getJSON() as Doc))
  },
})

// Keep in sync when the document is replaced from outside (e.g. after save).
watch(
  () => props.modelValue,
  (value) => {
    const current = editor.value
    if (!current) return
    if (
      JSON.stringify(value ?? null) !== JSON.stringify(current.isEmpty ? null : current.getJSON())
    ) {
      current.commands.setContent(value ?? '', { emitUpdate: false })
    }
  },
)
watch(
  () => props.readOnly,
  (readOnly) => editor.value?.setEditable(!readOnly),
)
onBeforeUnmount(() => editor.value?.destroy())

/** The link being edited: a web address or a document; `null` for a new one. */
const linking = ref<LinkTarget | null | false>(false)
function setLink() {
  const attrs = editor.value?.getAttributes('link') ?? {}
  const doc = attrs.doc as { relationTo: string; value: number | string } | null | undefined
  linking.value = doc?.relationTo
    ? { doc }
    : typeof attrs.href === 'string'
      ? { href: attrs.href }
      : null
}
async function applyLink(target: LinkTarget) {
  linking.value = false
  const e = editor.value
  if (!e) return
  if ('href' in target) {
    // A web address replaces a link to a document, if it was one.
    const attrs = { href: target.href, doc: null } as { href: string }
    e.chain().focus().extendMarkRange('link').setLink(attrs).run()
    return
  }
  // The server replaces the href with the document's URL when it is read.
  const attrs = { href: '#', doc: target.doc } as { href: string }
  if (!e.state.selection.empty || e.isActive('link')) {
    e.chain().focus().extendMarkRange('link').setLink(attrs).run()
    return
  }
  // Nothing selected: the document's title becomes the link's text.
  let text = String(target.doc.value)
  try {
    const doc = await api<Record<string, unknown>>(
      'GET',
      `/${target.doc.relationTo}/${target.doc.value}?depth=0&draft=true`,
    )
    text = titleOf(findCollection(target.doc.relationTo), doc) || text
  } catch {
    // The id stands in for the title.
  }
  e.chain()
    .focus()
    .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs }] })
    .run()
}
function removeLink() {
  linking.value = false
  editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
}
const pickingImage = ref(false)
function addImage() {
  pickingImage.value = true
}
function insertImage(src: string, alt = '') {
  pickingImage.value = false
  editor.value?.chain().focus().setImage({ src, alt }).run()
}

type Action = { key: string; label: string; text: string; run: () => void; active?: () => boolean }
const ICONS: Record<string, Component> = {
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  b: Bold,
  i: Italic,
  u: Underline,
  code: Code,
  link: Link,
  ul: List,
  ol: ListOrdered,
  quote: TextQuote,
  img: ImagePlus,
  table: Table,
  deleteTable: Trash2,
  undo: Undo2,
  redo: Redo2,
}
/** What can be done to the table the cursor is in, shown below the toolbar while it is in one. */
const tableActions = (): Action[] => {
  const e = editor.value
  if (!e?.isActive('table')) return []
  return [
    {
      key: 'rowAfter',
      label: t('rte.rowAfter'),
      text: '',
      run: () => e.chain().focus().addRowAfter().run(),
    },
    {
      key: 'columnAfter',
      label: t('rte.columnAfter'),
      text: '',
      run: () => e.chain().focus().addColumnAfter().run(),
    },
    {
      key: 'deleteRow',
      label: t('rte.deleteRow'),
      text: '',
      run: () => e.chain().focus().deleteRow().run(),
    },
    {
      key: 'deleteColumn',
      label: t('rte.deleteColumn'),
      text: '',
      run: () => e.chain().focus().deleteColumn().run(),
    },
    {
      key: 'deleteTable',
      label: t('rte.deleteTable'),
      text: '',
      run: () => e.chain().focus().deleteTable().run(),
    },
  ]
}
const actions = (): Action[] => {
  const e = editor.value
  if (!e) return []
  const heading = (level: 2 | 3 | 4): Action => ({
    key: `h${level}`,
    label: t('rte.heading', { level }),
    text: `H${level}`,
    run: () => e.chain().focus().toggleHeading({ level }).run(),
    active: () => e.isActive('heading', { level }),
  })
  return [
    heading(2),
    heading(3),
    heading(4),
    {
      key: 'b',
      label: t('rte.bold'),
      text: 'B',
      run: () => e.chain().focus().toggleBold().run(),
      active: () => e.isActive('bold'),
    },
    {
      key: 'i',
      label: t('rte.italic'),
      text: 'I',
      run: () => e.chain().focus().toggleItalic().run(),
      active: () => e.isActive('italic'),
    },
    {
      key: 'u',
      label: t('rte.underline'),
      text: 'U',
      run: () => e.chain().focus().toggleUnderline().run(),
      active: () => e.isActive('underline'),
    },
    {
      key: 'code',
      label: t('rte.code'),
      text: '</>',
      run: () => e.chain().focus().toggleCode().run(),
      active: () => e.isActive('code'),
    },
    {
      key: 'link',
      label: t('rte.link'),
      text: '🔗',
      run: setLink,
      active: () => e.isActive('link'),
    },
    {
      key: 'ul',
      label: t('rte.bulletList'),
      text: '•',
      run: () => e.chain().focus().toggleBulletList().run(),
      active: () => e.isActive('bulletList'),
    },
    {
      key: 'ol',
      label: t('rte.orderedList'),
      text: '1.',
      run: () => e.chain().focus().toggleOrderedList().run(),
      active: () => e.isActive('orderedList'),
    },
    {
      key: 'quote',
      label: t('rte.blockquote'),
      text: '❝',
      run: () => e.chain().focus().toggleBlockquote().run(),
      active: () => e.isActive('blockquote'),
    },
    { key: 'img', label: t('rte.image'), text: '🖼', run: addImage },
    {
      key: 'table',
      label: t('rte.table'),
      text: '▦',
      run: () => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      active: () => e.isActive('table'),
    },
    { key: 'undo', label: t('rte.undo'), text: '↶', run: () => e.chain().focus().undo().run() },
    { key: 'redo', label: t('rte.redo'), text: '↷', run: () => e.chain().focus().redo().run() },
  ]
}
</script>

<template>
  <div :class="['rte', { invalid, readonly: readOnly }]">
    <div v-if="!readOnly && editor" class="rte-toolbar" role="toolbar" :aria-controls="id">
      <button
        v-for="action in actions()"
        :key="action.key"
        type="button"
        class="rte-button"
        :class="{ active: action.active?.() }"
        :aria-label="action.label"
        :aria-pressed="action.active ? action.active() : undefined"
        :title="action.label"
        @mousedown.prevent
        @click="action.run"
      >
        <component :is="ICONS[action.key]" v-if="ICONS[action.key]" :size="16" aria-hidden="true" />
        <template v-else>{{ action.text }}</template>
      </button>
    </div>
    <div
      v-if="!readOnly && editor && tableActions().length"
      class="rte-toolbar rte-table-toolbar"
      role="toolbar"
      :aria-label="t('rte.table')"
    >
      <button
        v-for="action in tableActions()"
        :key="action.key"
        type="button"
        class="rte-button rte-text-button"
        @mousedown.prevent
        @click="action.run"
      >
        <component :is="ICONS[action.key]" v-if="ICONS[action.key]" :size="14" aria-hidden="true" />
        {{ action.label }}
      </button>
    </div>
    <EditorContent v-if="editor" :editor="editor" />
    <LinkDialog
      :open="linking !== false"
      :current="linking === false ? null : linking"
      @save="applyLink"
      @remove="removeLink"
      @cancel="linking = false"
    />
    <MediaPicker
      :open="pickingImage"
      images-only
      allow-url
      @select="insertImage(String($event.url), String($event.alt ?? ''))"
      @url="insertImage($event)"
      @close="pickingImage = false"
    />
  </div>
</template>

<style scoped>
.rte {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.rte.invalid {
  border-color: var(--danger);
}
.rte:focus-within {
  border-color: var(--focus);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.rte-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.2rem;
  height: 2.2rem;
  padding: 0 0.4rem;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.rte-button:hover {
  background: var(--surface-2);
  color: var(--text);
}
.rte-button.active {
  background: var(--surface-2);
  color: var(--text);
}
.rte :deep(.rte-content) {
  min-height: 10rem;
  padding: 0.75rem 0.9rem;
  outline: none;
}
.rte :deep(.rte-content > :first-child) {
  margin-top: 0;
}
.rte :deep(.rte-content img) {
  max-width: 100%;
  height: auto;
}
.rte :deep(.rte-content blockquote) {
  margin-left: 0;
  padding-left: 1rem;
  border-left: 3px solid var(--border-strong);
  color: var(--text-muted);
}
.rte-table-toolbar {
  border-radius: 0;
  background: var(--surface-2);
}
.rte-text-button {
  gap: 0.3rem;
  font-weight: 500;
}
.rte :deep(.rte-content table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
  table-layout: fixed;
}
.rte :deep(.rte-content th),
.rte :deep(.rte-content td) {
  border: 1px solid var(--border-strong);
  padding: 0.35rem 0.5rem;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.rte :deep(.rte-content th) {
  background: var(--surface-2);
  font-weight: 600;
  text-align: left;
}
.rte :deep(.rte-content th p),
.rte :deep(.rte-content td p) {
  margin: 0;
}
.rte :deep(.rte-content .selectedCell) {
  background: var(--accent-soft);
}
.rte :deep(.rte-content code) {
  font-family: var(--mono);
  background: var(--surface-2);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}
</style>
