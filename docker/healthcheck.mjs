// The container's health check: /readyz (the database answers, no migration pending), or
// /healthz on versions before /readyz existed.
// biome-ignore lint/suspicious/noUndeclaredEnvVars: runs in the container, not under turbo
const base = `http://127.0.0.1:${process.env.PORT || 4000}`
const get = (path) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(4000) })
try {
  let response = await get('/readyz')
  if (response.status === 404) response = await get('/healthz')
  process.exit(response.ok ? 0 : 1)
} catch {
  process.exit(1)
}
