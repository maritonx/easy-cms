import { EMAIL_DELIVERIES, SCHEDULED_JOBS, WEBHOOK_DELIVERIES } from '../builtins.js'
import type { EasyCMS } from '../local-api.js'
import { VERSION } from '../version.js'

/** Something an admin should look at, shown on the dashboard with a link to how to fix it. */
export type AdminAttention =
  /** Webhook deliveries that failed for good in the last 7 days; `url`: the one failing most. */
  | { id: 'webhooks'; count: number; url: string }
  /** Emails waiting over an hour, or that failed for good in the last 7 days. */
  | { id: 'emails'; count: number }
  /** Scheduled publishing more than 10 minutes late: nothing runs `jobs/run`. */
  | { id: 'scheduled'; count: number }
  /** No `email` in the config: no forgotten-password links, invitations or form emails. */
  | { id: 'no-email' }
  /** In production without `serverURL`: links in emails can't be made. */
  | { id: 'no-server-url' }

/** What the dashboard shows admins (`GET <api>/admin/status`). */
export interface AdminStatus {
  system: {
    /** `@easy-cms/core`'s version. */
    version: string
    /** The database adapter, e.g. `sqlite` or `postgres`. */
    database: string
    /** Where uploads are stored, e.g. `local` or `s3`. */
    storage: string
    /** The email adapter's name, `custom` when it has none, or `null` without email. */
    email: string | null
    /** The config's plugins, with their name and version when they give them. */
    plugins: { name?: string; version?: string }[]
    /** Field types from packages (`fieldTypes`). */
    fieldTypes: string[]
  }
  attention: AdminAttention[]
}

const DAY = 86_400_000
const has = (cms: EasyCMS, slug: string) => cms.config.collections.some((c) => c.slug === slug)

/** The system summary and the problems to look at, for admins. */
export async function adminStatus(cms: EasyCMS): Promise<AdminStatus> {
  const config = cms.config
  const attention: AdminAttention[] = []
  const now = Date.now()
  const weekAgo = new Date(now - 7 * DAY).toISOString()

  if (has(cms, WEBHOOK_DELIVERIES)) {
    const failed = await cms.db.find({
      collection: WEBHOOK_DELIVERIES,
      where: { and: [{ state: { equals: 'failed' } }, { updatedAt: { gte: weekAgo } }] },
      sort: ['-updatedAt'],
      limit: 200,
      page: 1,
    })
    if (failed.totalDocs > 0) {
      const byUrl = new Map<string, number>()
      for (const row of failed.docs) {
        const url = String(row.url ?? '')
        byUrl.set(url, (byUrl.get(url) ?? 0) + 1)
      }
      const [url] = [...byUrl.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['']
      attention.push({ id: 'webhooks', count: failed.totalDocs, url })
    }
  }

  if (has(cms, EMAIL_DELIVERIES)) {
    const count = await cms.db.count({
      collection: EMAIL_DELIVERIES,
      where: {
        or: [
          { and: [{ state: { equals: 'failed' } }, { updatedAt: { gte: weekAgo } }] },
          {
            and: [
              { state: { equals: 'pending' } },
              { createdAt: { lte: new Date(now - 60 * 60_000).toISOString() } },
            ],
          },
        ],
      },
    })
    if (count > 0) attention.push({ id: 'emails', count })
  }

  if (has(cms, SCHEDULED_JOBS)) {
    const count = await cms.db.count({
      collection: SCHEDULED_JOBS,
      where: {
        and: [
          { state: { equals: 'pending' } },
          { runAt: { lte: new Date(now - 10 * 60_000).toISOString() } },
        ],
      },
    })
    if (count > 0) attention.push({ id: 'scheduled', count })
  }

  if (!config.email) attention.push({ id: 'no-email' })
  if (!config.serverURL && process.env.NODE_ENV === 'production')
    attention.push({ id: 'no-server-url' })

  return {
    system: {
      version: VERSION,
      database: config.db.name,
      storage: config.upload.storage?.name ?? 'local',
      email: config.email ? (config.email.name ?? 'custom') : null,
      plugins: config.installedPlugins.map((p) => ({ ...p })),
      fieldTypes: config.fieldTypes.map((t) => t.name),
    },
    attention,
  }
}
