import { docMarkdown, indexNowKeyFile } from '@easy-cms/plugin-seo'

// Files for search engines and AI assistants that don't fit a route file name:
// - /posts/<slug>.md: a published post as Markdown (linked from /llms.txt)
// - /<key>.txt: the IndexNow key, when INDEXNOW_KEY is set
export default defineEventHandler(async (event) => {
  const { pathname, origin } = getRequestURL(event)
  const markdown = /^\/posts\/([^/]+)\.md$/.exec(pathname)
  if (markdown) {
    const cms = await useEasyCMS()
    // Read as a visitor: published posts only.
    const { docs } = await cms.find('posts', {
      where: { slug: { equals: decodeURIComponent(markdown[1] as string) } },
      limit: 1,
      overrideAccess: false,
      user: null,
    })
    const post = docs[0]
    const hidden = post?.meta.noindex
    if (!post || hidden) throw createError({ statusCode: 404 })
    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    return docMarkdown(cms, { collection: 'posts', doc: post, url: `${origin}/posts/${post.slug}` })
  }
  if (/^\/[^/]+\.txt$/.test(pathname)) {
    const key = indexNowKeyFile(await useEasyCMS(), pathname)
    if (key) {
      setHeader(event, 'content-type', 'text/plain; charset=utf-8')
      return key
    }
  }
})
