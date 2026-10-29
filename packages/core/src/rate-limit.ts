import { createHmac } from 'node:crypto'
import type { AuthUser, ID } from './access.js'
import type { ApiKeyContext } from './api-keys.js'
import { RATE_LIMITS } from './builtins.js'
import type { RateLimitConfig } from './config.js'
import type { Database } from './database.js'
import type { Logger } from './logger.js'

/** How often an instance adds what it counted to the database and reads the totals back. */
const SYNC_MS = 5000

const DEFAULTS = { window: 60, anonymous: 300, users: 1200, apiKeys: 1200 } as const

type Kind = 'anonymous' | 'user' | 'apiKey'

interface Count {
  /** The total in the database at the last sync, all instances together. */
  total: number
  /** Counted here since then. */
  pending: number
  /** The row's id, once known. */
  id?: ID | undefined
  /** When the window ends (ms). */
  ends: number
}

/**
 * Requests per client and window (`rateLimit`), counted in memory and added to the `rate-limits`
 * table every few seconds, so instances share totals without a write per request. A client may
 * go a little over the limit between syncs, by what the other instances counted meanwhile.
 */
export class RateLimiter {
  private readonly counts = new Map<string, Count>()
  private readonly settings: Required<RateLimitConfig>
  private lastSync = Date.now()
  private syncing: Promise<void> | undefined
  private warnedNoIp = false

  constructor(
    private readonly db: Database,
    private readonly secret: string,
    private readonly logger: Logger,
    settings: RateLimitConfig,
  ) {
    this.settings = { ...DEFAULTS, ...settings }
  }

  /**
   * Counts a request, or returns the seconds until the client may send another when it is over
   * its limit. Health checks and the cron's `jobs/run` aren't counted (the caller skips them).
   */
  hit(user: AuthUser | null, ip: string | undefined, now = Date.now()): number | undefined {
    const client = this.client(user, ip)
    if (!client) return undefined
    const [kind, id, limit] = client
    const windowMs = this.settings.window * 1000
    const bucket = Math.floor(now / windowMs)
    const key = `${kind}:${id}:${bucket}`
    let count = this.counts.get(key)
    if (!count) {
      count = { total: 0, pending: 0, ends: (bucket + 1) * windowMs }
      this.counts.set(key, count)
    }
    if (now - this.lastSync >= SYNC_MS && !this.syncing) void this.sync(now)
    if (count.total + count.pending >= limit)
      return Math.max(1, Math.ceil((count.ends - now) / 1000))
    count.pending++
    return undefined
  }

  /** Who is counted, and their limit; `undefined` when nothing limits them. */
  private client(
    user: AuthUser | null,
    ip: string | undefined,
  ): [Kind, string, number] | undefined {
    const { anonymous, users, apiKeys } = this.settings
    const key = user?.apiKey as ApiKeyContext | undefined
    if (key) return apiKeys === false ? undefined : ['apiKey', String(key.id), apiKeys]
    if (user) return users === false ? undefined : ['user', String(user.id), users]
    if (anonymous === false) return undefined
    if (!ip) {
      if (!this.warnedNoIp) {
        this.warnedNoIp = true
        this.logger.warn(
          'rateLimit: the client IP is unknown, so visitors who are not signed in are not limited. Behind a proxy, set trustProxy on the adapter.',
        )
      }
      return undefined
    }
    // No IP is stored: an HMAC of it, which can't be turned back without the secret.
    const hashed = createHmac('sha256', this.secret).update(`rate:${ip}`).digest('base64url')
    return ['anonymous', hashed.slice(0, 22), anonymous]
  }

  /**
   * Adds what this instance counted to the database and reads the totals back; forgets windows
   * that are over. Runs in the background every few seconds; `await` it in tests.
   */
  sync(now = Date.now()): Promise<void> {
    this.lastSync = now
    this.syncing ??= this.write(now)
      .catch((error) => this.logger.warn(`rateLimit: counts not saved: ${String(error)}`))
      .finally(() => {
        this.syncing = undefined
      })
    return this.syncing
  }

  private async write(now: number): Promise<void> {
    for (const [key, count] of this.counts) {
      if (count.ends <= now) {
        this.counts.delete(key)
        continue
      }
      const added = count.pending
      count.pending = 0
      count.total = (await this.add(key, count, added)) ?? count.total + added
    }
  }

  /** Adds `by` to the key's row (made if missing) and returns the new total. */
  private async add(key: string, count: Count, by: number): Promise<number | null> {
    count.id ??= await this.rowId(key)
    if (count.id === undefined) {
      const stamp = new Date().toISOString()
      try {
        const created = await this.db.create({
          collection: RATE_LIMITS,
          data: {
            key,
            count: by,
            expiresAt: new Date(count.ends).toISOString(),
            createdAt: stamp,
            updatedAt: stamp,
          },
        })
        count.id = created.id
        return by
      } catch (error) {
        // Another instance made it first (`key` is unique): add to theirs.
        count.id = await this.rowId(key)
        if (count.id === undefined) throw error
      }
    }
    return this.db.increment({ collection: RATE_LIMITS, id: count.id, field: 'count', by })
  }

  private async rowId(key: string): Promise<ID | undefined> {
    const { docs } = await this.db.find({
      collection: RATE_LIMITS,
      where: { key: { equals: key } },
      sort: [],
      limit: 1,
      page: 1,
    })
    return docs[0]?.id
  }

  /** Deletes the rows of windows that are over. From `runJobs`. */
  async clear(now = new Date()): Promise<number> {
    let deleted = 0
    for (;;) {
      const { docs } = await this.db.find({
        collection: RATE_LIMITS,
        where: { expiresAt: { lt: now.toISOString() } },
        sort: ['id'],
        limit: 500,
        page: 1,
      })
      for (const row of docs) await this.db.delete({ collection: RATE_LIMITS, id: row.id })
      deleted += docs.length
      if (docs.length < 500) return deleted
    }
  }
}
