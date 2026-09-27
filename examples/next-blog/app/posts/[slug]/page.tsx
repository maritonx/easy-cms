import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import { notFound } from 'next/navigation'
import config from '@/easy-cms.config'
import { PostView } from './post-view'

export const dynamic = 'force-dynamic'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  // Logged-in editors can preview drafts: access rules decide, drafts included for them.
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false,
    user,
    draft: user !== null,
  })
  const post = docs[0]
  if (!post) notFound()
  return <PostView post={post} />
}
