import { getEasyCMS } from '@easy-cms/next'
import { llmsTxt } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

// /llms.txt: a short Markdown index of the blog for AI assistants (llmstxt.org).
export async function GET(request: Request) {
  const text = await llmsTxt(await getEasyCMS(config), { siteUrl: new URL(request.url).origin })
  return new Response(text, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
}
