import { getEasyCMS } from '@easy-cms/next'
import { docMarkdown } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

// A published post as Markdown, at /posts/<slug>.md (rewritten here in next.config.ts).
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  // Read as a visitor: published posts only.
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false,
    user: null,
  })
  const post = docs[0]
  const hidden = post?.meta.noindex
  if (!post || hidden) return new Response('Not found', { status: 404 })
  // The address on the site from the config (SITE_URL), not from the request's Host.
  const url = `${cms.config.admin.siteURL.replace(/\/+$/, '')}/posts/${post.slug}`
  return new Response(docMarkdown(cms, { collection: 'posts', doc: post, url }), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
