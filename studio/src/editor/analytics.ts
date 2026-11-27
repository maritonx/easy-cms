/**
 * Umami (cookieless), when Studio is built with VITE_UMAMI_SRC and VITE_UMAMI_WEBSITE_ID. The
 * events measure what ADR-0074 asks: of the people who open Studio, how many take a config into a
 * project. Nothing about the config itself is sent.
 */
type Event =
  | 'studio-edit'
  | 'studio-share'
  | 'studio-copy-command'
  | 'studio-copy-config'
  | 'studio-open-link'
  | 'studio-expand'

const src = import.meta.env.VITE_UMAMI_SRC
const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID

type Umami = { track(name: string): void }
const umami = () => (window as { umami?: Umami }).umami
/** Events from before the script loaded (opening a shared link happens at once). */
const waiting: Event[] = []

export function startAnalytics(): void {
  if (!src || !websiteId) return
  const script = document.createElement('script')
  script.defer = true
  script.src = src
  script.dataset.websiteId = websiteId
  // Only the live site counts, not previews or local runs.
  if (import.meta.env.VITE_UMAMI_DOMAINS)
    script.dataset.domains = import.meta.env.VITE_UMAMI_DOMAINS
  // Never the config: it is in the address's hash, which Umami would otherwise not see anyway.
  script.dataset.excludeHash = 'true'
  script.addEventListener('load', () => {
    for (const event of waiting.splice(0)) umami()?.track(event)
  })
  document.head.append(script)
}

const sent = new Set<Event>()

/** Counts an event; `once` counts it once per visit (editing, say). */
export function track(event: Event, options: { once?: boolean } = {}): void {
  if (options.once) {
    if (sent.has(event)) return
    sent.add(event)
  }
  const loaded = umami()
  if (loaded) loaded.track(event)
  else if (src && websiteId) waiting.push(event)
}
