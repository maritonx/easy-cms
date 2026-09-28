import { describe, expect, it } from 'vitest'
import {
  type RichTextNode,
  renderMarkdown,
  renderRichText,
  richTextToPlainText,
  safeUrl,
} from '../src/index.js'

const doc = (...content: RichTextNode[]): RichTextNode => ({ type: 'doc', content })
const p = (...content: RichTextNode[]): RichTextNode => ({ type: 'paragraph', content })
const text = (value: string, marks?: RichTextNode['marks']): RichTextNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
})

describe('renderRichText (FR-RTX-02/03)', () => {
  it('renders the supported nodes and marks', () => {
    const html = renderRichText(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
        p(
          text('a '),
          text('b', [{ type: 'bold' }]),
          text(' '),
          text('i', [{ type: 'italic' }, { type: 'underline' }]),
        ),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('one'))] }] },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [{ type: 'listItem', content: [p(text('three'))] }],
        },
        { type: 'blockquote', content: [p(text('q'))] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const x = 1 < 2')] },
        p(text('line'), { type: 'hardBreak' }, text('next'), text('code', [{ type: 'code' }])),
        { type: 'horizontalRule' },
        { type: 'image', attrs: { src: '/uploads/a.png', alt: 'An "image"' } },
      ),
    )
    expect(html).toBe(
      '<h2>Title</h2>' +
        '<p>a <strong>b</strong> <u><em>i</em></u></p>' +
        '<ul><li><p>one</p></li></ul>' +
        '<ol start="3"><li><p>three</p></li></ol>' +
        '<blockquote><p>q</p></blockquote>' +
        '<pre><code class="language-ts">const x = 1 &lt; 2</code></pre>' +
        '<p>line<br>next<code>code</code></p>' +
        '<hr>' +
        '<img src="/uploads/a.png" alt="An &quot;image&quot;">',
    )
  })

  it('escapes text and attributes', () => {
    expect(renderRichText(doc(p(text('<script>alert(1)</script> & "x"'))))).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</p>',
    )
    expect(
      renderRichText(doc({ type: 'codeBlock', attrs: { language: '"><img>' }, content: [] })),
    ).toBe('<pre><code class="language-&quot;&gt;&lt;img&gt;"></code></pre>')
  })

  it('drops dangerous URLs but keeps the text', () => {
    for (const href of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,x',
      'vbscript:x',
    ]) {
      expect(renderRichText(doc(p(text('click', [{ type: 'link', attrs: { href } }]))))).toBe(
        '<p>click</p>',
      )
    }
    expect(renderRichText(doc({ type: 'image', attrs: { src: 'javascript:x' } }))).toBe('')
  })

  it('renders safe links with rel on external ones', () => {
    const link = (href: string, target?: string) =>
      renderRichText(doc(p(text('x', [{ type: 'link', attrs: { href, target } }]))))
    expect(link('https://a.test/?q="1"')).toBe(
      '<p><a href="https://a.test/?q=&quot;1&quot;" rel="noopener noreferrer">x</a></p>',
    )
    expect(link('/about', '_blank')).toBe('<p><a href="/about" target="_blank">x</a></p>')
    expect(link('mailto:a@b.co')).toBe('<p><a href="mailto:a@b.co">x</a></p>')
  })

  it('clamps heading levels and ignores unknown nodes and marks', () => {
    expect(
      renderRichText(doc({ type: 'heading', attrs: { level: 9 }, content: [text('h')] })),
    ).toBe('<h6>h</h6>')
    expect(
      renderRichText(doc({ type: 'mystery', content: [text('kept', [{ type: 'glow' }])] })),
    ).toBe('kept')
    expect(renderRichText(null)).toBe('')
  })

  it('accepts custom node renderers', () => {
    const html = renderRichText(doc(p(text('x'))), {
      nodes: { paragraph: (_n, children) => `<div class="p">${children}</div>` },
    })
    expect(html).toBe('<div class="p">x</div>')
  })
})

describe('safeUrl', () => {
  it('allows web, mail, phone, relative and fragment URLs', () => {
    for (const url of [
      'https://x.test',
      'http://x.test',
      'mailto:a@b',
      'tel:+66',
      '/a',
      'a/b',
      '#top',
      '?q=1',
    ]) {
      expect(safeUrl(url)).toBe(url)
    }
    expect(safeUrl(42)).toBeUndefined()
  })
})

describe('richTextToPlainText', () => {
  it('joins blocks with newlines', () => {
    expect(
      richTextToPlainText(
        doc(
          p(text('สวัสดี')),
          { type: 'heading', content: [text('B')] },
          p(text('c'), { type: 'hardBreak' }, text('d')),
        ),
      ),
    ).toBe('สวัสดี\nB\nc\nd')
  })
})

describe('renderMarkdown', () => {
  const doc = (...content: unknown[]) => ({ type: 'doc', content })
  const p = (...content: unknown[]) => ({ type: 'paragraph', content })
  const t = (text: string, ...marks: string[]) => ({
    type: 'text',
    text,
    ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
  })

  it('renders blocks, marks and lists', () => {
    const md = renderMarkdown(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [t('สวัสดี')] },
        p(t('Plain, '), t('bold', 'bold'), t(' and '), t('code', 'code'), t('.')),
        p({
          type: 'text',
          text: 'a link',
          marks: [{ type: 'link', attrs: { href: 'https://x.test/a (b)' } }],
        }),
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                p(t('one')),
                { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('nested'))] }] },
              ],
            },
            { type: 'listItem', content: [p(t('two'))] },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [{ type: 'listItem', content: [p(t('three'))] }],
        },
        { type: 'blockquote', content: [p(t('quoted')), p(t('again'))] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1 * 2')] },
        { type: 'image', attrs: { src: '/cover.png', alt: 'A [cover]' } },
        { type: 'horizontalRule' },
      ),
    )
    expect(md).toBe(
      [
        '## สวัสดี',
        'Plain, **bold** and `code`.',
        '[a link](https://x.test/a%20%28b%29)',
        '- one\n  - nested\n- two',
        '3. three',
        '> quoted\n>\n> again',
        '```ts\nconst a = 1 * 2\n```',
        '![A \\[cover\\]](/cover.png)',
        '---',
      ].join('\n\n'),
    )
  })

  it('escapes text that looks like Markdown and drops unsafe URLs', () => {
    expect(renderMarkdown(doc(p(t('# not a heading *or* [link]'))))).toBe(
      '\\# not a heading \\*or\\* \\[link\\]',
    )
    expect(renderMarkdown(doc(p(t('1. not a list'))))).toBe('\\1. not a list')
    const bad = {
      type: 'text',
      text: 'x',
      marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
    }
    expect(renderMarkdown(doc(p(bad)))).toBe('x')
    expect(renderMarkdown(null)).toBe('')
  })
})
