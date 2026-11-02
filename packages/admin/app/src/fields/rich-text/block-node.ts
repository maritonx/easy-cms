import type { AdminField } from '@easy-cms/core'
import { Node, VueNodeViewRenderer } from '@tiptap/vue-3'
import BlockCard from './BlockCard.vue'

/**
 * The node's name in the editor. Stored documents call it `block`, which in the editor would hide
 * ProseMirror's `block` group (the document's content): `toEditor` and `fromEditor` convert.
 */
export const EDITOR_NODE = 'easyCmsBlock'

type Json = { type?: unknown; content?: unknown; [key: string]: unknown }
const rename = (doc: unknown, from: string, to: string): unknown => {
  if (!doc || typeof doc !== 'object') return doc
  const node = doc as Json
  const content = Array.isArray(node.content)
    ? node.content.map((child) => rename(child, from, to))
    : node.content
  return {
    ...node,
    ...(node.type === from ? { type: to } : {}),
    ...(content !== undefined ? { content } : {}),
  }
}
/** A stored document, for the editor. */
export const toEditor = <T>(doc: T): T => rename(doc, 'block', EDITOR_NODE) as T
/** The editor's document, as it is stored. */
export const fromEditor = <T>(doc: T): T => rename(doc, EDITOR_NODE, 'block') as T

/** A block of a rich text field (#328), as the admin's schema gives it. */
export type AdminBlock = NonNullable<AdminField['blocks']>[number]

/** What the cards share with their field: its blocks, errors and summaries, and the editor's actions. */
export interface BlockEditor {
  readonly blocks: readonly AdminBlock[]
  /** The field's path, for errors (`body.<id>.<field>`). */
  readonly path: string
  readonly errors: () => Record<string, string[]>
  readonly readOnly: () => boolean
  /** Card texts from `admin.summary` functions, by block id. */
  readonly summaries: Record<string, string>
  /** Opens the panel that edits the block at this position. */
  edit(position: number): void
  /** Opens the list of blocks at this point of the viewport (`/` on an empty line). */
  menu(at: { left: number; top: number }): void
}

/**
 * A block between paragraphs: `{ type: 'block', attrs: { blockType, id, fields } }`, shown as a
 * card. Copied blocks get new ids; pasted ones the field doesn't have are dropped.
 */
export function blockNode(editor: BlockEditor, onRefused: (blockType: string) => void) {
  const allowed = new Set(editor.blocks.map((b) => b.slug))
  return Node.create({
    name: EDITOR_NODE,
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        blockType: { default: null, parseHTML: (el) => el.getAttribute('data-block') },
        // A pasted copy is another block.
        id: { default: null, parseHTML: () => crypto.randomUUID() },
        fields: {
          default: {},
          parseHTML: (el) => {
            try {
              return JSON.parse(el.getAttribute('data-fields') ?? '{}')
            } catch {
              return {}
            }
          },
        },
      }
    },
    parseHTML() {
      return [
        {
          tag: 'div[data-block]',
          getAttrs: (el) => {
            const type = (el as HTMLElement).getAttribute('data-block') ?? ''
            if (allowed.has(type)) return null
            onRefused(type)
            return false
          },
        },
      ]
    },
    renderHTML({ node }) {
      return [
        'div',
        {
          'data-block': node.attrs.blockType,
          'data-fields': JSON.stringify(node.attrs.fields ?? {}),
        },
      ]
    },
    addOptions() {
      return { editor }
    },
    addKeyboardShortcuts() {
      return {
        // `/` at the start of an empty line lists the field's blocks.
        '/': ({ editor: tiptap }) => {
          const { $from, empty } = tiptap.state.selection
          if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0)
            return false
          const coords = tiptap.view.coordsAtPos($from.pos)
          editor.menu({ left: coords.left, top: coords.bottom + 4 })
          return true
        },
      }
    },
    addNodeView() {
      return VueNodeViewRenderer(BlockCard)
    },
  })
}
