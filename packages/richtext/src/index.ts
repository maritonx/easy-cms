/** A Tiptap / ProseMirror JSON node. */
export interface RichTextNode {
  readonly type: string
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly RichTextNode[]
  readonly text?: string
  readonly marks?: readonly {
    readonly type: string
    readonly attrs?: Readonly<Record<string, unknown>>
  }[]
}

/** What rich text fields hold: `@easy-cms/core`'s `RichTextDocument` fits. */
export type RichTextInput =
  | RichTextNode
  | { readonly type: string; readonly content?: readonly unknown[] }

export interface RenderOptions {
  /** Override or add node renderers. Receives the node and its rendered children. */
  nodes?: Record<string, (node: RichTextNode, children: string) => string>
  /** Attributes added to every link. Default adds `rel="noopener noreferrer"` to external links. */
  linkAttributes?: (href: string) => Record<string, string>
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escapes text for use in HTML content and quoted attributes. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] as string)
}

/** Allows http(s), mailto, tel, relative URLs and fragments. Everything else (javascript:, data:, …) is dropped. */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const url = value.trim()
  // Strip characters browsers ignore inside schemes, e.g. "java\tscript:".
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  const compact = url.replace(/[\u0000-\u001F\u007F\s]/g, '').toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)?.[1]
  if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme)) return undefined
  return url
}

function attributes(attrs: Record<string, string | undefined>): string {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeHtml(v as string)}"`)
    .join('')
}

const defaultLinkAttributes = (href: string): Record<string, string> =>
  /^https?:\/\//i.test(href) ? { rel: 'noopener noreferrer' } : {}

function renderMarks(text: string, marks: RichTextNode['marks'], options: RenderOptions): string {
  let html = escapeHtml(text)
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`
        break
      case 'italic':
        html = `<em>${html}</em>`
        break
      case 'underline':
        html = `<u>${html}</u>`
        break
      case 'strike':
        html = `<s>${html}</s>`
        break
      case 'code':
        html = `<code>${html}</code>`
        break
      case 'link': {
        const href = safeUrl(mark.attrs?.href)
        if (!href) break
        const extra = (options.linkAttributes ?? defaultLinkAttributes)(href)
        const target = mark.attrs?.target === '_blank' ? '_blank' : undefined
        html = `<a${attributes({ href, target, ...extra })}>${html}</a>`
        break
      }
    }
  }
  return html
}

function renderNode(node: RichTextNode, options: RenderOptions): string {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return renderMarks(String(node.text ?? ''), node.marks, options)

  const children = (Array.isArray(node.content) ? node.content : [])
    .map((c) => renderNode(c, options))
    .join('')
  const custom = options.nodes?.[node.type]
  if (custom) return custom(node, children)

  switch (node.type) {
    case 'doc':
      return children
    case 'paragraph':
      return `<p>${children}</p>`
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))
      return `<h${level}>${children}</h${level}>`
    }
    case 'bulletList':
      return `<ul>${children}</ul>`
    case 'orderedList': {
      const start = Number(node.attrs?.start)
      return `<ol${Number.isInteger(start) && start !== 1 ? ` start="${start}"` : ''}>${children}</ol>`
    }
    case 'listItem':
      return `<li>${children}</li>`
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : undefined
      return `<pre><code${attributes({ class: language ? `language-${language}` : undefined })}>${children}</code></pre>`
    }
    case 'hardBreak':
      return '<br>'
    case 'horizontalRule':
      return '<hr>'
    case 'image': {
      const src = safeUrl(node.attrs?.src)
      if (!src) return ''
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : undefined
      return `<img${attributes({ src, alt, title })}>`
    }
    default:
      // Unknown nodes keep their text but no markup.
      return children
  }
}

/** Renders a rich text document to HTML. Text is escaped and unsafe URLs are removed. */
export function renderRichText(
  doc: RichTextInput | null | undefined,
  options: RenderOptions = {},
): string {
  if (!doc) return ''
  return renderNode(doc as RichTextNode, options)
}

/** Plain text of a document, e.g. for excerpts or search. Blocks are separated by newlines. */
export function richTextToPlainText(doc: RichTextInput | null | undefined): string {
  if (!doc) return ''
  const blocks = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'])
  const walk = (node: RichTextNode): string => {
    if (node.type === 'text') return String(node.text ?? '')
    if (node.type === 'hardBreak') return '\n'
    const inner = (node.content ?? []).map(walk).join('')
    return blocks.has(node.type) ? `${inner}\n` : inner
  }
  return walk(doc as RichTextNode)
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export interface MarkdownOptions {
  /** Override or add node renderers. Receives the node and its rendered children. */
  nodes?: Record<string, (node: RichTextNode, children: string) => string>
}

/** Escapes characters Markdown would read as formatting. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/g, (c) => `\\${c}`)
}

/** Keeps a line that starts like a heading, quote or list item as plain text. */
function escapeLineStart(text: string): string {
  return text.replace(
    /^(\s*)(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/gm,
    (_, space: string, start: string) => `${space}\\${start}`,
  )
}

function markdownMarks(text: string, marks: RichTextNode['marks']): string {
  let md = escapeMarkdown(text)
  if (md.trim() === '') return md
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        md = `**${md}**`
        break
      case 'italic':
        md = `*${md}*`
        break
      case 'strike':
        md = `~~${md}~~`
        break
      case 'code':
        md = `\`${text.replace(/`/g, "'")}\``
        break
      case 'link': {
        const href = safeUrl(mark.attrs?.href)
        if (href) md = `[${md}](${href.replace(/[()\s]/g, urlChar)})`
        break
      }
    }
  }
  return md
}

/** Percent-encodes characters that would end a Markdown link's URL. */
const urlChar = (c: string) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`

/** Indents every line after the first, for nested list items. */
const indent = (text: string, by: string) => text.replace(/\n(?!\n|$)/g, `\n${by}`)

function markdownNode(node: RichTextNode, options: MarkdownOptions): string {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return markdownMarks(String(node.text ?? ''), node.marks)
  const content = Array.isArray(node.content) ? node.content : []
  const inline = () => content.map((c) => markdownNode(c, options)).join('')
  const blocks = () =>
    content
      .map((c) => markdownNode(c, options))
      .filter((b) => b.trim() !== '')
      .join('\n\n')

  const custom = options.nodes?.[node.type]
  if (custom) return custom(node, blocks())

  switch (node.type) {
    case 'doc':
      return blocks()
    case 'paragraph':
      return escapeLineStart(inline())
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))
      return `${'#'.repeat(level)} ${inline().replace(/\n/g, ' ')}`
    }
    case 'bulletList':
    case 'orderedList': {
      const start = Number(node.attrs?.start)
      let n = Number.isInteger(start) ? start : 1
      return content
        .map((item) => {
          const marker = node.type === 'orderedList' ? `${n++}.` : '-'
          const body = markdownNode(item, options)
          return `${marker} ${indent(body, ' '.repeat(marker.length + 1))}`
        })
        .join('\n')
    }
    case 'listItem':
      return content
        .map((c) => markdownNode(c, options))
        .filter((b) => b.trim() !== '')
        .join('\n')
    case 'blockquote':
      return blocks()
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      const code = content.map((c) => String(c.text ?? '')).join('')
      const fence = code.includes('```') ? '~~~~' : '```'
      return `${fence}${language}\n${code}\n${fence}`
    }
    case 'hardBreak':
      return '  \n'
    case 'horizontalRule':
      return '---'
    case 'image': {
      const src = safeUrl(node.attrs?.src)
      if (!src) return ''
      const alt = typeof node.attrs?.alt === 'string' ? escapeMarkdown(node.attrs.alt) : ''
      return `![${alt}](${src.replace(/[()\s]/g, urlChar)})`
    }
    default:
      // Unknown nodes keep their content but no markup.
      return content.some((c) => c.type === 'text') ? inline() : blocks()
  }
}

/**
 * Renders a rich text document to Markdown, e.g. for `llms.txt` or `.md` versions of pages.
 * Text that looks like Markdown is escaped, and unsafe URLs are removed.
 */
export function renderMarkdown(
  doc: RichTextInput | null | undefined,
  options: MarkdownOptions = {},
): string {
  if (!doc) return ''
  return markdownNode(doc as RichTextNode, options).trim()
}
