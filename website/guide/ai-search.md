# AI search

::: info What you'll learn
How AI search and assistants (ChatGPT, Claude, Perplexity, Google's AI answers…) find and read
your content, and what the SEO plugin gives them: crawler rules, `llms.txt`, Markdown versions of
pages and IndexNow.

**Before this page:** [SEO](./seo).
:::

AI answers start from the same things as search: pages a crawler can read, clear titles and
descriptions, dates and authors, structured data. The [SEO plugin](./seo) already covers those.
On top, AI tools read Markdown more easily than HTML, and some sites want to choose which AI
crawlers may use their content.

::: warning Render on the server
AI crawlers generally don't run JavaScript. Pages that load their content in the browser, like
the [standalone](./standalone) example's frontend, look empty to them. Render on the server
(Nuxt, Next.js, Astro…) or prerender the pages. The admin's own pages don't matter: they are
kept out of search.
:::

## Choose which AI crawlers may read

AI crawlers come in three kinds, and `robotsTxt()` sets each as a group. All are allowed by
default.

| Group | What it does | Crawlers |
|---|---|---|
| `training` | Collects text to train AI models. | GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent, Bytespider, cohere-training-data-crawler |
| `search` | Indexes pages for AI search and for answers that cite and link them. | OAI-SearchBot, Claude-SearchBot, PerplexityBot |
| `user` | Opens a page when someone asks an assistant to read it. | ChatGPT-User, Claude-User, Perplexity-User |

The common choice: stay out of training, but let AI answers find and link to you.

```ts
robotsTxt({ config, ai: { training: false } })
```

```txt
User-agent: GPTBot
User-agent: ClaudeBot
…
Disallow: /
```

- Blocking `search` keeps your pages out of AI search results and citations.
- The `user` crawlers act for a person who asked about a page, and some companies say they may
  not always follow `robots.txt`.
- `Google-Extended` only covers Gemini's use of your content. Google's AI answers in search come
  from the normal Googlebot, like search itself.
- The list is kept up to date in each release (`AI_CRAWLERS`). For others, add `rules`:
  `rules: [{ userAgent: 'SomeBot', disallow: ['/'] }]`. Each rule also gets the admin and API
  rules, because a crawler follows only the group that names it.

The standalone server's `/robots.txt` takes the same options through the plugin:
`seoPlugin({ robots: { ai: { training: false } } })`.

## llms.txt

[`llms.txt`](https://llmstxt.org) is a proposed standard: a short Markdown file at the site's
root that tells AI tools what the site is and where its main pages are. `llmsTxt(cms)` makes it
from your content, with the same pages as the sitemap (published, visible to visitors, not
hidden from search engines), the newest first:

```md
# My Blog

> A blog about building websites in Thailand.

## Posts

- [Hello](https://example.com/posts/hello.md): What this blog is about.

## Pages

- [My Blog](https://example.com/)
```

```ts
seoPlugin({
  // …
  llms: {
    title: 'My Blog', // default: the site name from a global with SEO fields
    description: 'A blog about building websites in Thailand.',
    limit: 100, // newest pages per collection
    markdownURL: ({ doc, collection }) =>
      collection === 'posts' ? `/posts/${doc.slug}.md` : null,
  },
})
```

`markdownURL` links to the [Markdown versions](#markdown-versions-of-pages) of your pages;
without it, links go to the pages themselves. With several locales, the file is in the default
locale (or `llms.locale`).

`llmsFullTxt(cms)` puts the Markdown of every page in one file, for tools that read a whole site
at once. It stops at about 5 MB (`maxBytes`) and says where the rest is.

::: code-group

```ts [Nuxt: server/routes/llms.txt.ts]
import { llmsTxt } from '@easy-cms/plugin-seo'

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return llmsTxt(await useEasyCMS())
})
// server/routes/llms-full.txt.ts: the same with llmsFullTxt
```

```ts [Next.js: app/llms.txt/route.ts]
import { getEasyCMS } from '@easy-cms/next'
import { llmsTxt } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const text = await llmsTxt(await getEasyCMS(config))
  return new Response(text, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
}
// app/llms-full.txt/route.ts: the same with llmsFullTxt
```

:::

The standalone server serves `/llms.txt` and `/llms-full.txt` itself; `llms: false` turns them
off.

## Markdown versions of pages

`docMarkdown(cms, { collection, doc, url })` renders one document as Markdown: its title,
description, address and dates, then its rich text, long text and the text in its blocks and
arrays, in the order of the fields. Serve it next to the page, e.g. `/posts/hello.md`.

::: code-group

```ts [Nuxt: server/middleware/markdown.ts]
import { docMarkdown } from '@easy-cms/plugin-seo'

export default defineEventHandler(async (event) => {
  const slug = /^\/posts\/([^/]+)\.md$/.exec(getRequestURL(event).pathname)?.[1]
  if (!slug) return
  const cms = await useEasyCMS()
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false, // as a visitor: published posts only
    user: null,
  })
  if (!docs[0]) throw createError({ statusCode: 404 })
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return docMarkdown(cms, { collection: 'posts', doc: docs[0] })
})
```

```ts [Next.js: app/md/posts/[slug]/route.ts]
import { getEasyCMS } from '@easy-cms/next'
import { docMarkdown } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

// next.config.ts: rewrites: async () => [{ source: '/posts/:slug.md', destination: '/md/posts/:slug' }]
export async function GET(_: Request, { params }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false, // as a visitor: published posts only
    user: null,
  })
  if (!docs[0]) return new Response('Not found', { status: 404 })
  return new Response(docMarkdown(cms, { collection: 'posts', doc: docs[0] }), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
```

:::

To write the Markdown yourself for a collection, pass `markdown` to the plugin. Rich text alone
converts with [`renderMarkdown()`](./rich-text#markdown).

```ts
seoPlugin({
  // …
  markdown: {
    products: (doc) => `# ${doc.name}\n\nPrice: ${doc.price} THB\n\n${renderMarkdown(doc.details)}`,
  },
})
```

## IndexNow

[IndexNow](https://www.indexnow.org) tells Bing, Yandex and other search engines about a changed
page right away, instead of waiting for their next crawl. Bing's index also feeds ChatGPT search
and Copilot, so new posts reach AI answers sooner.

```ts
seoPlugin({
  // …
  indexNow: { key: process.env.INDEXNOW_KEY }, // 8–128 letters, digits or dashes, e.g. a UUID
})
```

- When a page is published, changed while published, unpublished or deleted, its addresses (in
  every locale) are sent. Drafts don't send anything.
- Changes are gathered for 5 seconds (`delay`) and sent together. A failed send is logged and
  not retried: search engines still crawl as usual.
- Only public `https` addresses are sent, so development and staging on `localhost` or a
  `.test` domain stay quiet.

IndexNow checks that you own the site with a key file at `/<key>.txt`. The standalone server
serves it; in Nuxt or Next.js, answer it with `indexNowKeyFile(cms, pathname)`, or put the file
in `public/`:

```ts
// Nuxt: server/middleware/indexnow.ts
import { indexNowKeyFile } from '@easy-cms/plugin-seo'

export default defineEventHandler(async (event) => {
  const key = indexNowKeyFile(await useEasyCMS(), getRequestURL(event).pathname)
  if (key) return key
})
```

## Next steps

- [SEO](./seo): metadata, sitemap and structured data that AI answers rely on too.
- [MCP](./mcp): let AI assistants *edit* your content, with an API key.
