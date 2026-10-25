// `/healthz` and `/readyz`: what load balancers and Kubernetes probe. Served under the API by every
// adapter, and at the root by the standalone server.
import { USERS } from './builtins.js'
import type { Config } from './config.js'
import type { EasyCMS } from './local-api.js'

export type HealthCheck = 'healthz' | 'readyz'

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

/** Instances whose migrations were all applied: that can't be undone, so they aren't read again. */
const migrated = new WeakSet<EasyCMS>()

async function pendingMigrations(cms: EasyCMS): Promise<number> {
  if (migrated.has(cms)) return 0
  const pending = (await cms.db.migrationStatus()).filter((m) => !m.applied).length
  if (pending === 0) migrated.add(cms)
  return pending
}

/**
 * `healthz`: the process answers (liveness), without touching the database. `readyz`: the CMS
 * started, its database answers and no migration is pending (readiness); `503` otherwise, naming
 * the check that failed, with the error in the log only. `cms` is `null` when it failed to start.
 */
export async function healthResponse<C extends Config>(
  check: HealthCheck,
  instance: EasyCMS<C> | null,
): Promise<Response> {
  const cms = instance as EasyCMS | null
  if (check === 'healthz') return new Response('ok', { headers: { 'cache-control': 'no-store' } })
  if (!cms) {
    return Response.json(
      { status: 'error', checks: { startup: 'error' } },
      { status: 503, headers: HEADERS },
    )
  }
  const checks: Record<string, string> = {}
  try {
    await cms.db.count({ collection: USERS })
    checks.database = 'ok'
    const pending = await pendingMigrations(cms)
    checks.migrations = pending === 0 ? 'ok' : `${pending} pending`
  } catch (error) {
    if (checks.database) checks.migrations = 'error'
    else Object.assign(checks, { database: 'error', migrations: 'not checked' })
    cms.logger.error(`Readiness check failed: ${(error as Error).message}`, { error })
  }
  const ok = Object.values(checks).every((value) => value === 'ok')
  return Response.json(
    { status: ok ? 'ok' : 'error', checks },
    { status: ok ? 200 : 503, headers: HEADERS },
  )
}
