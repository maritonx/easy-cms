import { LivePosts } from './live-posts'

export const metadata = { title: 'Live posts' }

/** Posts as they are published, edited and removed, without reloading (realtime, ADR-0070). */
export default function LivePage() {
  return (
    <section>
      <h1>Live posts</h1>
      <p>This list follows the CMS: publish or edit a post in the admin and it changes here.</p>
      <LivePosts />
    </section>
  )
}
