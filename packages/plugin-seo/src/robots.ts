export interface RobotsTxtOptions {
  /** Your Easy CMS config, for the admin and API paths and `admin.siteUrl`. */
  readonly config?: object
  /** The site's public address, for the `Sitemap:` line. Default `admin.siteUrl`, then `serverURL`. */
  readonly siteUrl?: string
  /** The sitemap's address, or `false` for none. Default `<siteUrl>/sitemap.xml`. */
  readonly sitemap?: string | false
  /**
   * Ask search engines to stay out of the whole site, e.g. on a staging copy. Not turned on by
   * `NODE_ENV`: staging servers usually run in production mode too, so set it yourself.
   */
  readonly disallowAll?: boolean
  /** More paths to keep out of search, e.g. `['/search']`. */
  readonly disallow?: readonly string[]
}

/**
 * A `robots.txt` that keeps search engines out of the admin and the API (except uploaded
 * files, so share images still work) and points them to the sitemap.
 */
export function robotsTxt(options: RobotsTxtOptions = {}): string {
  const config = options.config as RobotsConfig | undefined
  const trim = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`
  const admin = trim(config?.admin?.path ?? '/admin')
  const api = trim(config?.routes?.api ?? '/api/cms')
  const site = options.siteUrl ?? (config?.admin?.siteUrl || config?.serverURL)
  const lines = ['User-agent: *']
  if (options.disallowAll) {
    lines.push('Disallow: /')
  } else {
    lines.push(`Allow: ${api}/media/file/`, `Disallow: ${admin}/`, `Disallow: ${api}/`)
    for (const path of options.disallow ?? []) lines.push(`Disallow: ${path}`)
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
  readonly admin?: { readonly path?: string; readonly siteUrl?: string }
  readonly routes?: { readonly api?: string }
  readonly serverURL?: string
}
