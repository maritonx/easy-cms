import { llmsTxt } from '@easy-cms/plugin-seo'

// /llms.txt: a short Markdown index of the blog for AI assistants (llmstxt.org).
export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return llmsTxt(await useEasyCMS(), { siteURL: getRequestURL(event).origin })
})
