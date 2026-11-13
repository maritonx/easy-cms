// `easy-cms build --target workers`: what Wrangler needs to deploy Easy CMS as a Cloudflare
// Worker (ADR-0067). Written again on every build into .easy-cms/workers/; wrangler.jsonc is the
// project's own once written.
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { APP_DIR } from '@easy-cms/admin'
import type { ResolvedConfig } from '@easy-cms/core'
import { ADMIN_ASSETS } from './workers.js'

/** Packages Easy CMS imports only when present, which can't run on Workers. */
const UNAVAILABLE = ['sharp', '@opentelemetry/api', 'drizzle-kit/api'] as const

export const WORKERS_DIR = join('.easy-cms', 'workers')

/** Today's date for `compatibility_date`, as Wrangler expects it. */
const today = () => new Date().toISOString().slice(0, 10)

export interface BuildResult {
  readonly dir: string
  /** Whether wrangler.jsonc was written (it is kept once it exists). */
  readonly wroteWrangler: boolean
}

export async function buildWorkers(args: {
  cwd: string
  configFile: string
  config: ResolvedConfig
}): Promise<BuildResult> {
  const { cwd, configFile, config } = args
  if (!config.upload.storage)
    throw new Error(
      'A Worker has no disk for uploads: set upload.storage in the config, e.g. s3Storage() with an R2 bucket.',
    )

  const dir = join(cwd, WORKERS_DIR)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  // The entry: the project's config, as a Worker.
  const importPath = relative(dir, configFile).split(sep).join('/')
  await writeFile(
    join(dir, 'worker.ts'),
    `// Written by \`easy-cms build --target workers\`; written again on every build.
import { createWorker } from 'easy-cms/workers'
import config from '${importPath.startsWith('.') ? importPath : `./${importPath}`}'

export default createWorker(config)
`,
  )
  // What the alias in wrangler.jsonc points those packages to: importing them fails, as when
  // they are not installed, and Easy CMS goes on without them.
  await writeFile(
    join(dir, 'unavailable.js'),
    `throw new Error('This package is not available on Cloudflare Workers')\n`,
  )
  // The admin app, read by the Worker through the ASSETS binding.
  await cp(APP_DIR, join(dir, 'assets', ...ADMIN_ASSETS.split('/').filter(Boolean)), {
    recursive: true,
  })

  const wrangler = join(cwd, 'wrangler.jsonc')
  const wroteWrangler = !existsSync(wrangler) && !existsSync(join(cwd, 'wrangler.toml'))
  if (wroteWrangler) await writeFile(wrangler, await wranglerConfig(cwd))
  return { dir, wroteWrangler }
}

async function wranglerConfig(cwd: string): Promise<string> {
  const pkg = await readFile(join(cwd, 'package.json'), 'utf8')
    .then((text) => JSON.parse(text) as { name?: string })
    .catch(() => ({}) as { name?: string })
  const name = (pkg.name ?? basename(cwd))
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const dir = WORKERS_DIR.split(sep).join('/')
  const alias = Object.fromEntries(UNAVAILABLE.map((name) => [name, `./${dir}/unavailable.js`]))
  const config = {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: name || 'easy-cms',
    main: `${dir}/worker.ts`,
    compatibility_date: today(),
    compatibility_flags: ['nodejs_compat'],
    // Every request reaches the Worker first; it reads the admin app from the assets.
    assets: {
      directory: `${dir}/assets`,
      binding: 'ASSETS',
      run_worker_first: true,
      html_handling: 'none',
      not_found_handling: 'none',
    },
    alias,
    // Scheduled publishing, webhook and email retries, backups: every minute.
    triggers: { crons: ['* * * * *'] },
    vars: { NODE_ENV: 'production' },
  }
  return `// Written by \`easy-cms build --target workers\`, then yours: it is not written again.
// Secrets (EASY_CMS_SECRET, DATABASE_URL, …): npx wrangler secret put <NAME>
${JSON.stringify(config, null, 2)}
`
}
