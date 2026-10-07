# @easy-cms/richtext

## 0.39.0

No changes in this release.

## 0.38.0

No changes in this release.

## 0.37.2

No changes in this release.

## 0.37.1

No changes in this release.

## 0.37.0

No changes in this release.

## 0.36.1

No changes in this release.

## 0.36.0

No changes in this release.

## 0.35.0

No changes in this release.

## 0.34.0

No changes in this release.

## 0.33.0

No changes in this release.

## 0.32.0

No changes in this release.

## 0.31.0

No changes in this release.

## 0.30.0

No changes in this release.

## 0.29.0

No changes in this release.

## 0.28.0

No changes in this release.

## 0.27.0

No changes in this release.

## 0.26.0

No changes in this release.

## 0.25.0

No changes in this release.

## 0.24.0

No changes in this release.

## 0.23.0

No changes in this release.

## 0.22.2

No changes in this release.

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.

## 0.22.0

No changes in this release.

## 0.21.0

No changes in this release.

## 0.20.1

No changes in this release.

## 0.20.0

No changes in this release.

## 0.19.0

No changes in this release.

## 0.18.0

### Minor Changes

- b0bfcad: SEO for AI search and assistants.
  
  - **AI crawlers:** `robotsTxt({ ai: { training: false } })` keeps AI training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot…) out while AI search (OAI-SearchBot, Claude-SearchBot, PerplexityBot) and assistants opening a page for someone may still read and cite your pages. Each group (`training`, `search`, `user`) can be set; all are allowed by default. `rules` adds other crawlers, and `AI_CRAWLERS` lists the known ones.
  - **llms.txt:** `llmsTxt(cms)` writes a short Markdown index of the site (llmstxt.org) from the same pages as the sitemap, and `llmsFullTxt(cms)` the Markdown of every page in one file. Set the title, summary and links to Markdown pages with the plugin's `llms` option.
  - **Markdown pages:** `docMarkdown(cms, { collection, doc })` renders a document as Markdown (title, description, dates, rich text, long text and the text in blocks), for routes like `/posts/hello.md`; `markdown` in the plugin's options writes your own per collection. `@easy-cms/richtext` has `renderMarkdown()`.
  - **IndexNow:** `indexNow: { key }` tells Bing and other IndexNow search engines about pages as they are published, changed, unpublished or deleted, in batches and only for public https addresses. `indexNowKeyFile()` serves the key file in Nuxt and Next.js apps.
  - The standalone server also serves `/llms.txt`, `/llms-full.txt` and the IndexNow key file.

## 0.17.0

No changes in this release.

## 0.16.1

No changes in this release.

## 0.16.0

No changes in this release.

## 0.15.0

No changes in this release.

## 0.14.0

No changes in this release.

## 0.13.1

No changes in this release.

## 0.13.0

No changes in this release.

## 0.12.0

No changes in this release.

## 0.11.0

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.0

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.1

No changes in this release.

## 0.1.0

### Minor Changes

- 312df64: First release of Easy CMS: an embedded, code-first headless CMS for Nuxt and Next.js with an admin UI,
  typed Local API, REST API, SQLite and Postgres adapters, uploads, drafts, hooks and access control.
