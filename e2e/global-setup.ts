// Dev servers compile a route on its first request and may reload the page while doing so, which
// aborts a test's first navigation. Request every route once up front. (Next.js runs a
// production build, standalone needs no compiling, but warming it costs nothing.)
const PAGES = [
  '/',
  '/admin/',
  '/admin/login',
  '/posts/warm-up',
  '/api/cms/posts',
  '/api/cms/users/me',
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
