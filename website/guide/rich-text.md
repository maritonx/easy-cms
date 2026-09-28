# Rich text

::: info What you'll learn
What editors can do in a rich text field, how it is stored, and how to show it safely on your
pages with Nuxt, Next.js or any frontend.

**Before this page:** [Fields](./fields).
:::

## The field

```ts
{ name: 'body', type: 'richText', localized: true }
```

In the admin, `richText` fields are edited with [Tiptap](https://tiptap.dev): headings (H2–H4),
bold, italic, underline, inline code, links, bullet and numbered lists, quotes, images from the
media library (or a URL), undo and redo. Keyboard shortcuts work as in other editors
(<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>B</kbd>, <kbd>I</kbd>, <kbd>U</kbd>, <kbd>Z</kbd>).

The value is stored as Tiptap JSON, a tree of nodes, not HTML:

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Hello" }] },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Read the " },
        { "type": "text", "text": "guide", "marks": [{ "type": "link", "attrs": { "href": "/guide" } }] }
      ]
    }
  ]
}
```

JSON keeps content independent of how you show it: the same document can become HTML, plain
text for a search index, or your own components.

## Showing it on a page

Install the renderer:

```bash
npm install @easy-cms/richtext
```

::: code-group

```vue [Nuxt]
<script setup lang="ts">
import { renderRichText } from '@easy-cms/richtext'

const { data: post } = await useFetch(`/api/posts/${useRoute().params.slug}`)
const html = computed(() => renderRichText(post.value?.body))
</script>

<template>
  <!-- Safe: renderRichText escapes text and drops unsafe URLs -->
  <div class="prose" v-html="html" />
</template>
```

```tsx [Next.js]
import { renderRichText } from '@easy-cms/richtext'

export function PostBody({ body }: { body: unknown }) {
  // Safe: renderRichText escapes text and drops unsafe URLs
  return <div className="prose" dangerouslySetInnerHTML={{ __html: renderRichText(body) }} />
}
```

```ts [Any frontend]
import { renderRichText } from '@easy-cms/richtext'

const post = await fetch('/api/cms/posts/1').then((r) => r.json())
document.querySelector('#body')!.innerHTML = renderRichText(post.body)
```

:::

It renders these nodes: paragraphs, headings, bullet and numbered lists, quotes, code blocks,
line breaks, horizontal rules and images; and these marks: bold, italic, underline,
strikethrough, code and links. Unknown nodes keep their text without markup, so newer content never
breaks a page.

### Safety

`renderRichText` escapes all text and attributes and drops unsafe URLs (`javascript:`, `data:`
and anything other than http(s), mailto, tel and relative links), so its output is safe for
`v-html` or `dangerouslySetInnerHTML`. External links get `rel="noopener noreferrer"`.

## Plain text

```ts
import { richTextToPlainText } from '@easy-cms/richtext'

const excerpt = richTextToPlainText(post.body).slice(0, 160) // meta descriptions, search
```

## Markdown

`renderMarkdown(doc)` turns rich text into Markdown, e.g. for AI assistants
([AI search](./ai-search)), emails or exports. Text that looks like Markdown is escaped and
unsafe URLs are dropped, as with HTML. Pass `nodes` to render your own node types.

```ts
import { renderMarkdown } from '@easy-cms/richtext'

const markdown = renderMarkdown(post.body) // "## Heading\n\nA paragraph with **bold** text."
```

## Customizing the output

Replace or add the renderer of any node. It receives the node and its rendered children:

```ts
import { slugify } from '@easy-cms/core'
import { escapeHtml, renderRichText, safeUrl } from '@easy-cms/richtext'

renderRichText(post.body, {
  nodes: {
    // Wrap images in a figure with a caption from the alt text.
    image: (node) => {
      const src = safeUrl(node.attrs?.src)
      const alt = escapeHtml(String(node.attrs?.alt ?? ''))
      return src ? `<figure><img src="${escapeHtml(src)}" alt="${alt}"><figcaption>${alt}</figcaption></figure>` : ''
    },
    // Add ids to headings for a table of contents.
    heading: (node, children) => {
      const level = Number(node.attrs?.level ?? 2)
      return `<h${level} id="${escapeHtml(slugify(children))}">${children}</h${level}>`
    },
  },
  // Attributes for every link, e.g. open external ones in a new tab.
  linkAttributes: (href) => (href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
})
```

Custom renderers receive raw attributes: escape them yourself with the exported `escapeHtml`
and `safeUrl` (children are already escaped).

## Next steps

- [Uploads & media](./uploads): the images editors insert.
- [Localization](./localization): a rich text field per language.
