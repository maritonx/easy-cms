import { llmsFullTxt } from '@easy-cms/plugin-seo'

// /llms-full.txt: every published post as Markdown, in one file.
export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  return llmsFullTxt(await useEasyCMS(), { siteUrl: getRequestURL(event).origin })
})
