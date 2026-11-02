// Blocks in rich text (#328): a node `{ type: 'block', attrs: { blockType, id, fields } }` between
// paragraphs, whose `fields` are those of one of the field's `blocks`.

import type { RichTextBlock, RichTextField } from './fields.js'

type Data = Record<string, unknown>

export const BLOCK_NODE = 'block'

/** A block node; `attrs` can be rewritten in place. */
export interface BlockNode {
  type: typeof BLOCK_NODE
  attrs: Data
}

/** The block nodes of a rich text document, in document order. */
export function blockNodes(doc: unknown): BlockNode[] {
  const found: BlockNode[] = []
  const walk = (node: unknown, depth: number) => {
    // Deeper than any real document: stop rather than overflow the stack.
    if (!node || typeof node !== 'object' || depth > 200) return
    const { type, content } = node as Data
    if (type === BLOCK_NODE) {
      const n = node as Data
      if (!n.attrs || typeof n.attrs !== 'object') n.attrs = {}
      found.push(n as unknown as BlockNode)
      return
    }
    if (Array.isArray(content)) for (const child of content) walk(child, depth + 1)
  }
  walk(doc, 0)
  return found
}

/** The field's block a node is, or `undefined` for one it doesn't have. */
export function blockOf(field: RichTextField, node: BlockNode): RichTextBlock | undefined {
  return field.blocks?.find((block) => block.slug === node.attrs.blockType)
}

/** A block node's field values (`{}` when it has none). */
export function blockFields(node: BlockNode): Data {
  const { fields } = node.attrs
  return fields && typeof fields === 'object' && !Array.isArray(fields) ? (fields as Data) : {}
}

/** Whether a value is a rich text document with blocks of `field` to look into. */
export const hasBlocks = (field: RichTextField, value: unknown): boolean =>
  (field.blocks?.length ?? 0) > 0 &&
  !!value &&
  typeof value === 'object' &&
  (value as Data).type === 'doc'
