'use client'

import { createClient } from '@easy-cms/core/client'
import { useLive } from '@easy-cms/next/live'
import Link from 'next/link'
import type config from '@/easy-cms.config'

// The REST API on this site; the browser's session cookie comes along, so editors who signed in
// read what they may read, visitors the published posts.
const cms = createClient<typeof config>({ url: '/api/cms' })

export function LivePosts() {
  const { docs, ready, error } = useLive(cms, 'posts', { sort: '-createdAt', limit: 20, depth: 0 })
  if (error) return <p role="alert">Couldn’t load the posts: {error.message}</p>
  if (!ready) return <p>Loading…</p>
  if (docs.length === 0) return <p>No posts yet.</p>
  return (
    <ul data-testid="live-posts">
      {docs.map((post) => (
        <li key={String(post.id)}>
          <Link href={`/posts/${post.slug}`}>{post.title}</Link>
        </li>
      ))}
    </ul>
  )
}
