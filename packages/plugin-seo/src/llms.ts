import { renderMarkdown } from '@easy-cms/richtext'
import { META_FIELD } from './shared.js'
import {
  absolute,
  type Doc,
  type FieldLike,
  findSource,
  labelText,
  type SeoCMS,
  type SeoSource,
  siteOf,
  type VisiblePage,
  visiblePages,
  visitor,
} from './source.js'

export interface LlmsTxtOptions {
  /** The site's public address, to make links absolute. Default `admin.siteUrl`, then `serverURL`. */
  readonly siteUrl?: string
}

export interface LlmsFullTxtOptions extends LlmsTxtOptions {
  /** Stop adding pages after this many bytes. Default about 5 MB. */
  readonly maxBytes?: number
}

export interface DocMarkdownOptions {
  readonly collection?: string
  readonly global?: string
  /** The document, as read for visitors (fetch with `depth` 1 for image URLs). */
  readonly doc: Doc
  /** The page's address, shown under the title. */
  readonly url?: string
}

const DEFAULT_LIMIT = 100
const DEFAULT_MAX_BYTES = 5_000_000

/**
 * `llms.txt` (llmstxt.org): a short Markdown index of the site for AI assistants: its title and
 * summary, then the newest pages of each collection with their descriptions. Lists the same
 * pages as the sitemap: published, visible to visitors, not marked "noindex".
 */
export async function llmsTxt(cms: SeoCMS, options: LlmsTxtOptions = {}): Promise<string> {
  const source = findSource(cms, 'llmsTxt')
  const locale = localeOf(cms, source)
  const site = siteOf(cms, options.siteUrl)
  const sections = new Map<string, string[]>()
  await visiblePages(cms, source, {
    locale,
    site,
    sort: '-createdAt',
    limit: source.llms.limit ?? DEFAULT_LIMIT,
    each: (page) => {
      const heading = page.collection
        ? labelText(collectionOf(cms, page.collection)?.labels?.plural, locale, page.collection)
        : 'Pages'
      const title = titleOf(cms, page)
      const description = text((page.doc[META_FIELD] as Doc | undefined)?.description)
      const href = linkOf(source, page, locale, site)
      const line = `- [${inline(title)}](${href})${description ? `: ${inline(description)}` : ''}`
      sections.set(heading, [...(sections.get(heading) ?? []), line])
    },
  })
  const lines = [`# ${inline(await siteTitle(cms, source, locale))}`]
  if (source.llms.description) lines.push('', `> ${inline(source.llms.description)}`)
  for (const [heading, items] of sections) lines.push('', `## ${inline(heading)}`, '', ...items)
  return `${lines.join('\n')}\n`
}

/**
 * `llms-full.txt`: the Markdown of every page `llms.txt` would list (without its limit), newest
 * first, in one file for assistants that read a whole site at once. Stops at `maxBytes`.
 */
export async function llmsFullTxt(cms: SeoCMS, options: LlmsFullTxtOptions = {}): Promise<string> {
  const source = findSource(cms, 'llmsFullTxt')
  const locale = localeOf(cms, source)
  const site = siteOf(cms, options.siteUrl)
  const max = options.maxBytes ?? DEFAULT_MAX_BYTES
  const header = [`# ${inline(await siteTitle(cms, source, locale))}`]
  if (source.llms.description) header.push('', `> ${inline(source.llms.description)}`)
  const parts: string[] = []
  let bytes = byteLength(header.join('\n'))
  let full = false
  await visiblePages(cms, source, {
    locale,
    site,
    sort: '-createdAt',
    depth: 1,
    each: (page) => {
      if (full) return
      const markdown = pageMarkdown(cms, source, page)
      const size = byteLength(markdown) + 7
      if (bytes + size > max) {
        full = true
        return
      }
      bytes += size
      parts.push(markdown)
    },
  })
  const body = [header.join('\n'), ...parts].join('\n\n---\n\n')
  return `${body}${full ? '\n\n---\n\n(More pages are listed in /llms.txt and /sitemap.xml.)' : ''}\n`
}

/**
 * The Markdown version of one page, e.g. for `/posts/hello.md`: its title, description and
 * dates, then its rich text, long text and the text in its blocks, in the order of the fields.
 * The plugin's `markdown` option replaces this for a collection or global.
 */
export function docMarkdown(cms: SeoCMS, options: DocMarkdownOptions): string {
  const source = findSource(cms, 'docMarkdown')
  const page: VisiblePage = {
    key: '',
    doc: options.doc,
    url: options.url ?? '',
    ...(options.collection ? { collection: options.collection } : {}),
    ...(options.global ? { global: options.global } : {}),
  }
  return `${pageMarkdown(cms, source, page)}\n`
}

function pageMarkdown(cms: SeoCMS, source: SeoSource, page: VisiblePage) {
  const slug = page.collection ?? page.global ?? ''
  const custom = source.markdown[slug]
  if (custom) return custom(page.doc).trim()

  const { doc } = page
  const meta = (doc[META_FIELD] ?? {}) as Doc
  const title = titleOf(cms, page)
  const lines = [`# ${inline(title)}`]
  const description = text(meta.description) ?? text(doc.excerpt)
  if (description) lines.push('', `> ${inline(description)}`)
  const facts = [
    page.url ? `URL: ${page.url}` : '',
    dateOf(doc.publishedAt ?? doc.createdAt)
      ? `Published: ${dateOf(doc.publishedAt ?? doc.createdAt)}`
      : '',
    dateOf(doc.updatedAt) ? `Updated: ${dateOf(doc.updatedAt)}` : '',
  ].filter(Boolean)
  if (facts.length > 0) lines.push('', facts.join('  \n'))

  const titleField = page.collection ? collectionOf(cms, page.collection)?.useAsTitle : undefined
  const fields = page.collection
    ? (collectionOf(cms, page.collection)?.fields ?? [])
    : (cms.config.globals?.find((g) => g.slug === page.global)?.fields ?? [])
  const skip = new Set([META_FIELD, 'excerpt', titleField ?? 'title'])
  const body = fieldsMarkdown(
    fields.filter((f) => !skip.has(f.name)),
    doc,
    false,
  )
  if (body) lines.push('', body)
  return lines.join('\n')
}

/** Rich text and long text at the top level; any text inside blocks and arrays. */
function fieldsMarkdown(fields: readonly FieldLike[], data: Doc, nested: boolean): string {
  const out: string[] = []
  for (const field of fields) {
    const value = data[field.name]
    if (value === null || value === undefined) continue
    switch (field.type) {
      case 'richText':
        out.push(renderMarkdown(value as Parameters<typeof renderMarkdown>[0]))
        break
      case 'textarea':
        out.push(plain(String(value)))
        break
      case 'text':
        if (nested) out.push(plain(String(value)))
        break
      case 'group':
        out.push(fieldsMarkdown(field.fields ?? [], value as Doc, nested))
        break
      case 'array':
        for (const row of Array.isArray(value) ? (value as Doc[]) : [])
          out.push(fieldsMarkdown(field.fields ?? [], row, true))
        break
      case 'blocks':
        for (const row of Array.isArray(value) ? (value as Doc[]) : []) {
          const block = field.blocks?.find((b) => b.slug === row.blockType)
          if (block) out.push(fieldsMarkdown(block.fields, row, true))
        }
        break
    }
  }
  return out.filter((part) => part.trim() !== '').join('\n\n')
}

/** Plain text as Markdown paragraphs, escaped. */
function plain(value: string): string {
  return renderMarkdown({
    type: 'doc',
    content: value
      .split(/\n{2,}/)
      .filter((p) => p.trim() !== '')
      .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p.trim() }] })),
  })
}

/** Escaped text for a heading or list item: one line. */
function inline(value: string): string {
  return plain(value.replace(/\s+/g, ' ')) || value
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const dateOf = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined

const byteLength = (value: string) => new TextEncoder().encode(value).length

const collectionOf = (cms: SeoCMS, slug: string) =>
  cms.config.collections?.find((c) => c.slug === slug)

function localeOf(cms: SeoCMS, source: SeoSource): string | null {
  const localization = cms.config.localization
  if (!localization) return null
  return source.llms.locale ?? localization.defaultLocale
}

/** `llms.title`, else the name in a global with SEO fields (e.g. `site.siteName`). */
async function siteTitle(cms: SeoCMS, source: SeoSource, locale: string | null) {
  if (source.llms.title) return source.llms.title
  for (const global of source.globals) {
    const doc = await visitor(() =>
      cms.findGlobal(global, { overrideAccess: false, user: null, ...(locale ? { locale } : {}) }),
    )
    const name = text(doc?.siteName) ?? text(doc?.name) ?? text(doc?.title)
    if (name) return name
  }
  return 'Site'
}

function titleOf(cms: SeoCMS, page: VisiblePage): string {
  const { doc } = page
  const field = page.collection ? collectionOf(cms, page.collection)?.useAsTitle : undefined
  return (
    text((doc[META_FIELD] as Doc | undefined)?.title) ??
    text(field ? doc[field] : undefined) ??
    text(doc.title) ??
    text(doc.siteName) ??
    text(doc.name) ??
    page.url
  )
}

function linkOf(
  source: SeoSource,
  page: VisiblePage,
  locale: string | null,
  site: string | undefined,
): string {
  const markdown = source.llms.markdownURL?.({
    doc: page.doc,
    locale,
    ...(page.collection ? { collection: page.collection } : {}),
    ...(page.global ? { global: page.global } : {}),
  })
  const href = text(markdown) ? absolute(text(markdown) as string, site) : page.url
  // A URL inside Markdown link syntax: spaces and parentheses would end it.
  return href.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}
