// Request every route once up front, so no test waits for a route's first load. (Nuxt and Next.js
// run production builds and standalone needs no compiling; warming them costs nothing.)
const PAGES = [
  '/',
  '/admin/',
  '/admin/login',
  '/posts/warm-up',
  '/api/cms/posts',
  '/api/cms/auth/me',
]

export default async function warmUp() {
  for (const port of [3100, 3102]) {
    for (const path of PAGES) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await fetch(`http://localhost:${port}${path}`, { signal: AbortSignal.timeout(120_000) })
          break
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1_000))
        }
      }
    }
  }
}
