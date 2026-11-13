// Easy CMS as a Cloudflare Worker (ADR-0067): the standalone server's admin, REST API and root
// endpoints in `fetch`, and the jobs in `scheduled` (Cron Triggers). `easy-cms build --target
// workers` writes the entry that calls `createWorker` with the project's config.
import { type Config, createEasyCMS, type EasyCMS } from '@easy-cms/core'
import { createStandaloneHandler } from './handler.js'

/** The Worker's static assets binding (`assets.binding` in wrangler.jsonc). */
export interface WorkerAssets {
  fetch(request: Request | URL | string): Promise<Response>
}

export interface WorkerEnv {
  readonly ASSETS?: WorkerAssets
  readonly [binding: string]: unknown
}

export interface WorkerContext {
  waitUntil(task: Promise<unknown>): void
}

export interface EasyCMSWorker {
  fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response>
  scheduled(controller: unknown, env: WorkerEnv, ctx: WorkerContext): Promise<void>
}

/** Where `easy-cms build --target workers` puts the admin app among the Worker's assets. */
export const ADMIN_ASSETS = '/_easy-cms/admin'

/** A file of the admin app from the Worker's assets. */
async function readAsset(assets: WorkerAssets, path: string): Promise<Uint8Array | undefined> {
  const response = await assets.fetch(new URL(`${ADMIN_ASSETS}/${path}`, 'https://assets.invalid'))
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined
}

/**
 * The Worker for a config. A Worker has no disk, so `upload.storage` must be set, e.g.
 * `s3Storage()` with an R2 bucket; and the database is reached over HTTP, e.g. Turso.
 */
export function createWorker<C extends Config>(config: C): EasyCMSWorker {
  if (!config.upload?.storage)
    throw new Error(
      'Easy CMS on Cloudflare Workers needs upload.storage: a Worker has no disk for uploads.\n    → e.g. upload: { storage: s3Storage({ ... }) } with an R2 bucket',
    )
  type Started = { cms: EasyCMS<C>; handler: ReturnType<typeof createStandaloneHandler> }
  let started: Promise<Started> | undefined
  const start = (env: WorkerEnv) => {
    started ??= (async () => {
      // No timer: Cron Triggers call `scheduled` instead.
      const cms = await createEasyCMS(config, { scheduler: false })
      const assets = env.ASSETS
      const handler = createStandaloneHandler(cms, {
        admin: assets ? { readFile: (path) => readAsset(assets, path) } : {},
      })
      return { cms, handler }
    })().catch((error: unknown) => {
      // The next request tries again, e.g. once the database answers.
      started = undefined
      throw error
    })
    return started
  }

  return {
    async fetch(request, env, ctx) {
      const { cms, handler } = await start(env)
      const response = await handler(request, request.headers.get('cf-connecting-ip') ?? undefined)
      // Emails, a backup: after the response, while the Worker is kept for them.
      if (cms.busy) ctx.waitUntil(cms.settle())
      return response
    },
    async scheduled(_controller, env, ctx) {
      const { cms } = await start(env)
      ctx.waitUntil(cms.runJobs().then(() => cms.settle()))
    },
  }
}
