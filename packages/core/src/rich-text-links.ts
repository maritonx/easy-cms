// Links in rich text to another document (#326): a link mark whose `attrs.doc` is
// `{ relationTo, value }`. The id is what is stored; reads at `depth ≥ 1` add the document's URL
// as `href` (its collection's `preview`), so a link follows the document when its slug changes.

type Node = Record<string, unknown>

/** A link mark that points at a document; `attrs` can be rewritten in place. */
export interface DocLinkMark {
  attrs: Record<string, unknown> & { doc: unknown }
}

/** The link marks in a rich text document that carry `attrs.doc`. */
export function docLinkMarks(doc: unknown): DocLinkMark[] {
  const found: DocLinkMark[] = []
  const walk = (node: unknown, depth: number) => {
    // Deeper than any real document: stop rather than overflow the stack.
    if (!node || typeof node !== 'object' || depth > 200) return
    const { marks, content } = node as Node
    if (Array.isArray(marks))
      for (const mark of marks) {
        const m = mark as Node
        const attrs = m?.attrs as Record<string, unknown> | undefined
        if (m?.type === 'link' && attrs && attrs.doc !== undefined && attrs.doc !== null)
          found.push(m as unknown as DocLinkMark)
      }
    if (Array.isArray(content)) for (const child of content) walk(child, depth + 1)
  }
  walk(doc, 0)
  return found
}

/** The collection and id a link points at, or `undefined` when `doc` isn't one. */
export function linkTarget(doc: unknown): { relationTo: string; value: unknown } | undefined {
  if (!doc || typeof doc !== 'object') return undefined
  const { relationTo, value } = doc as Node
  return typeof relationTo === 'string' &&
    relationTo !== '' &&
    value !== undefined &&
    value !== null
    ? { relationTo, value }
    : undefined
}
