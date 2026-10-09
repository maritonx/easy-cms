export interface RobotsTxtOptions {
  /** Your Easy CMS config, for the admin and API paths and `admin.siteURL`. */
  readonly config?: object
  /** The site's public address, for the `Sitemap:` line. Default `admin.siteURL`, then `serverURL`. */
  readonly siteURL?: string
  /** The sitemap's address, or `false` for none. Default `<siteURL>/sitemap.xml`. */
  readonly sitemap?: string | false
  /**
   * Ask search engines to stay out of the whole site, e.g. on a staging copy. Not turned on by
   * `NODE_ENV`: staging servers usually run in production mode too, so set it yourself.
   */
  readonly disallowAll?: boolean
  /** More paths to keep out of search, e.g. `['/search']`. */
  readonly disallow?: readonly string[]
  /**
   * AI crawlers by what they do (all allowed by default): `training` collects text to train
   * models, `search` indexes pages for AI search and answers that cite them, `user` opens a
   * page when someone asks an assistant to. E.g. `{ training: false }` keeps your content out
   * of training but lets AI answers link to you.
   */
  readonly ai?: { readonly training?: boolean; readonly search?: boolean; readonly user?: boolean }
  /** Rules for other crawlers. The admin and API rules are added to each one. */
  readonly rules?: readonly RobotsRule[]
}

export interface RobotsRule {
  /** One crawler's user agent, or several. */
  readonly userAgent: string | readonly string[]
  readonly allow?: readonly string[]
  /** Paths to keep it out of; `['/']` for the whole site. */
  readonly disallow?: readonly string[]
}

/**
 * Known AI crawlers, by what they do, from each company's documentation. Updated in each
 * release; add others with `rules`.
 */
export const AI_CRAWLERS = {
  training: [
    'GPTBot',
    'ClaudeBot',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
    'Meta-ExternalAgent',
    'Bytespider',
    'cohere-training-data-crawler',
  ],
  search: ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'],
  user: ['ChatGPT-User', 'Claude-User', 'Perplexity-User'],
} as const

/**
 * A `robots.txt` that keeps search engines out of the admin and the API (except uploaded
 * files, so share images still work) and points them to the sitemap.
 */
export function robotsTxt(options: RobotsTxtOptions = {}): string {
  const config = options.config as RobotsConfig | undefined
  const trim = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`
  const admin = trim(config?.admin?.path ?? '/admin')
  const api = trim(config?.routes?.api ?? '/api/cms')
  const site = options.siteURL ?? (config?.admin?.siteURL || config?.serverURL)
  // A crawler follows only the most specific group that names it, so every group gets the
  // admin and API rules.
  const base = options.disallowAll
    ? ['Disallow: /']
    : [
        `Allow: ${api}/media/file/`,
        `Disallow: ${admin}/`,
        `Disallow: ${api}/`,
        ...(options.disallow ?? []).map((path) => `Disallow: ${path}`),
      ]
  const lines = ['User-agent: *', ...base]
  const group = (agents: readonly string[], rules: string[]) => {
    lines.push('', ...agents.map((agent) => `User-agent: ${agent}`), ...rules)
  }
  if (!options.disallowAll) {
    const blocked = (['training', 'search', 'user'] as const).flatMap((kind) =>
      options.ai?.[kind] === false ? AI_CRAWLERS[kind] : [],
    )
    if (blocked.length > 0) group(blocked, ['Disallow: /'])
    for (const rule of options.rules ?? []) {
      const agents = typeof rule.userAgent === 'string' ? [rule.userAgent] : rule.userAgent
      group(agents, [
        ...(rule.allow ?? []).map((path) => `Allow: ${path}`),
        ...(rule.disallow ?? []).map((path) => `Disallow: ${path}`),
        ...base,
      ])
    }
  }
  const sitemap =
    options.sitemap === false
      ? undefined
      : (options.sitemap ?? (site ? `${site.replace(/\/+$/, '')}/sitemap.xml` : undefined))
  if (sitemap) lines.push('', `Sitemap: ${sitemap}`)
  return `${lines.join('\n')}\n`
}

/** What `robotsTxt` reads from an Easy CMS config (raw or resolved). */
interface RobotsConfig {
  readonly admin?: { readonly path?: string; readonly siteURL?: string }
  readonly routes?: { readonly api?: string }
  readonly serverURL?: string
}
