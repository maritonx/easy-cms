---
"@easy-cms/plugin-seo": minor
"@easy-cms/richtext": minor
---

SEO for AI search and assistants.

- **AI crawlers:** `robotsTxt({ ai: { training: false } })` keeps AI training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot…) out while AI search (OAI-SearchBot, Claude-SearchBot, PerplexityBot) and assistants opening a page for someone may still read and cite your pages. Each group (`training`, `search`, `user`) can be set; all are allowed by default. `rules` adds other crawlers, and `AI_CRAWLERS` lists the known ones.
- **llms.txt:** `llmsTxt(cms)` writes a short Markdown index of the site (llmstxt.org) from the same pages as the sitemap, and `llmsFullTxt(cms)` the Markdown of every page in one file. Set the title, summary and links to Markdown pages with the plugin's `llms` option.
- **Markdown pages:** `docMarkdown(cms, { collection, doc })` renders a document as Markdown (title, description, dates, rich text, long text and the text in blocks), for routes like `/posts/hello.md`; `markdown` in the plugin's options writes your own per collection. `@easy-cms/richtext` has `renderMarkdown()`.
- **IndexNow:** `indexNow: { key }` tells Bing and other IndexNow search engines about pages as they are published, changed, unpublished or deleted, in batches and only for public https addresses. `indexNowKeyFile()` serves the key file in Nuxt and Next.js apps.
- The standalone server also serves `/llms.txt`, `/llms-full.txt` and the IndexNow key file.
