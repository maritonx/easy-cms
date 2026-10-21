import { getEasyCMS } from '@easy-cms/next'
import { llmsFullTxt } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

// /llms-full.txt: every published post as Markdown, in one file.
export async function GET() {
  const text = await llmsFullTxt(await getEasyCMS(config))
  return new Response(text, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
}
