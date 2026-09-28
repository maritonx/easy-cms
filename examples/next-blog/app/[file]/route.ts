import { getEasyCMS } from '@easy-cms/next'
import { indexNowKeyFile } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

// /<key>.txt: the IndexNow key, when INDEXNOW_KEY is set. Other one-segment paths without a
// page of their own end here too, and get a 404.
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const key = indexNowKeyFile(await getEasyCMS(config), `/${file}`)
  return key
    ? new Response(key, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    : new Response('Not found', { status: 404 })
}
