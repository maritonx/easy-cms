import { withEasyCMS } from '@easy-cms/next/config'
import type { NextConfig } from 'next'

// Typed like create-next-app's template, so the example also checks that withEasyCMS accepts it.
const nextConfig: NextConfig = {
  // Markdown versions of posts for AI assistants: /posts/<slug>.md.
  rewrites: async () => [{ source: '/posts/:slug.md', destination: '/md/posts/:slug' }],
}

export default withEasyCMS(nextConfig)
