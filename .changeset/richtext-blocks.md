---
"@easy-cms/core": minor
"@easy-cms/richtext": minor
"@easy-cms/admin": minor
"@easy-cms/plugin-mcp": patch
---

Blocks between paragraphs of rich text: `richText.blocks` (a card, a callout, a video) are stored as `{ type: 'block', attrs: { blockType, id, fields } }`. Their fields are validated with errors at `body.<id>.<field>`, field access applies, and relationships in them populate to `depth`. In the editor, "Insert block" or `/` on an empty line adds one; it shows as a card edited in a side panel, whose text `admin.summary` can set (a server function or a custom element). `renderRichText` and `renderMarkdown` take `blocks` renderers, typed with `RichTextBlocks<typeof config, 'posts', 'body'>`; `generate:types` writes `PostBodyBlock` (#328).
