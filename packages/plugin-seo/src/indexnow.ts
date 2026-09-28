export interface IndexNowOptions {
  /**
   * Your IndexNow key: 8–128 letters, digits or dashes, e.g. a UUID. The site must serve it at
   * `/<key>.txt`; the standalone server does, and Nuxt or Next.js apps use `indexNowKeyFile()`.
   */
  readonly key: string
  /** Where to send changed URLs. Default `https://api.indexnow.org/indexnow` (Bing, Yandex…). */
  readonly endpoint?: string
  /** How long to gather changes before sending them together, in ms. Default 5000. */
  readonly delay?: number
  /** For tests: the `fetch` to send with. */
  readonly fetch?: typeof fetch
}

export const INDEXNOW_KEY = /^[A-Za-z0-9-]{8,128}$/
const DEFAULT_ENDPOINT = 'https://api.indexnow.org/indexnow'
/** IndexNow takes up to 10,000 URLs per request. */
const MAX_URLS = 10_000

interface Logger {
  warn(message: string): void
}

/**
 * Only public addresses are sent: development servers, e2e runs and staging on `localhost` or
 * a `.test` domain stay quiet.
 */
export function isPublicUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname
  return (
    parsed.protocol === 'https:' &&
    host.includes('.') &&
    !/^(\d+\.){3}\d+$/.test(host) &&
    !/(^|\.)(localhost|local|test|example|invalid|internal)$/.test(host)
  )
}

/** Gathers changed URLs and sends them to IndexNow in batches, one request per host. */
export function createIndexNow(options: IndexNowOptions) {
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let logger: Logger = console
  let sending: Promise<void> = Promise.resolve()

  async function send(urls: string[]) {
    const byHost = new Map<string, string[]>()
    for (const url of urls) {
      const host = new URL(url).host
      byHost.set(host, [...(byHost.get(host) ?? []), url])
    }
    const post = options.fetch ?? fetch
    for (const [host, list] of byHost) {
      for (let i = 0; i < list.length; i += MAX_URLS) {
        try {
          const response = await post(options.endpoint ?? DEFAULT_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              host,
              key: options.key,
              keyLocation: `https://${host}/${options.key}.txt`,
              urlList: list.slice(i, i + MAX_URLS),
            }),
            signal: AbortSignal.timeout(10_000),
          })
          // 200 and 202 mean received. Search engines crawl anyway, so failures are not retried.
          if (!response.ok) logger.warn(`IndexNow: ${host} answered ${response.status}`)
        } catch (error) {
          logger.warn(`IndexNow: could not send ${host}: ${(error as Error).message}`)
        }
      }
    }
  }

  function flush(): Promise<void> {
    if (timer) clearTimeout(timer)
    timer = undefined
    const urls = [...pending]
    pending.clear()
    if (urls.length > 0) sending = sending.then(() => send(urls))
    return sending
  }

  return {
    /** Queues URLs of a page that changed for visitors; sends them after `delay`. */
    submit(urls: readonly string[], log?: Logger) {
      if (log) logger = log
      for (const url of urls) if (isPublicUrl(url)) pending.add(url)
      if (pending.size === 0 || timer) return
      timer = setTimeout(() => void flush(), options.delay ?? 5000)
      ;(timer as { unref?: () => void }).unref?.()
    },
    flush,
  }
}

export type IndexNow = ReturnType<typeof createIndexNow>

/**
 * The key file for a request's path: the key when the path is `/<key>.txt`, otherwise
 * `undefined`. Serve it as plain text from your app's root.
 */
export function indexNowKeyFile(
  cms: { readonly config: { readonly endpoints: readonly { readonly handler: unknown }[] } },
  pathname: string,
): string | undefined {
  for (const endpoint of cms.config.endpoints) {
    const key = (endpoint.handler as { [INDEXNOW_SOURCE]?: string })[INDEXNOW_SOURCE]
    if (key && pathname === `/${key}.txt`) return key
  }
  return undefined
}

/** Kept on the key file's endpoint handler, found through the config (see `SEO_SOURCE`). */
export const INDEXNOW_SOURCE = Symbol.for('easy-cms.plugin-seo.indexnow')
