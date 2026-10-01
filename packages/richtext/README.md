# @easy-cms/richtext

Renders Easy CMS rich text (Tiptap JSON) to safe HTML, plain text or Markdown. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/richtext
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { renderMarkdown, renderRichText, richTextToPlainText } from '@easy-cms/richtext'

const html = renderRichText(post.body) // escaped, unsafe URLs removed
const text = richTextToPlainText(post.body)
const markdown = renderMarkdown(post.body) // e.g. for llms.txt or AI assistants
```

Supports headings, paragraphs, bold, italic, underline, strike, code, links, lists, quotes, code
blocks, hard breaks, rules and images. Pass `{ nodes: { image: (node, children) => '…' } }` to
customize a node. No dependencies; works in Node and browsers.

## Links

[Rich text](https://maritonx.github.io/easy-cms/guide/rich-text) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
