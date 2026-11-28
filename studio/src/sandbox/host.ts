/**
 * The sandbox (ADR-0074): runs the CMS for the config the editor sends, frames the admin, and
 * answers the admin's API requests, which its Service Worker carries here. Everything runs one at
 * a time: core's request context in browsers follows one request at a time.
 */
import { type Config, createEasyCMS, createRestHandler } from '@easy-cms/core'
import { dropMemoryDatabase } from '@easy-cms/db-memory'
import {
  ADMIN_PATH,
  type ApiRequest,
  type ApiResponse,
  type ConfigMessage,
  studioOrigin,
  type ThemeMode,
  type ToEditor,
  type ToSandbox,
} from '../protocol'
import { ConfigCodeError, compile } from '../runtime/compile'
import { consoleOf, DATABASE, prepare } from '../runtime/prepare'
import { seed } from '../runtime/seed'
import { SAMPLES } from '../templates/samples'

/** The admin Studio signs in as (its Service Worker sends the session token). */
const ADMIN = { email: 'admin@studio.easycms.dev', password: 'studio-admin-0f3c9a71' }

type Cms = Awaited<ReturnType<typeof createEasyCMS>>
let current: { cms: Cms; handle: (request: Request) => Promise<Response>; token: string } | null =
  null
let adminFrame: HTMLIFrameElement | null = null
let hostId = ''

const tell = (message: ToEditor) => window.parent.postMessage(message, studioOrigin())
const log = consoleOf((level, message) => tell({ type: 'studio:console', level, message }))

let queue: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn)
  queue = run.catch(() => {})
  return run
}

/** The config to apply next: a newer one replaces one still waiting (keeping a fresh start). */
let waiting: ConfigMessage | null = null
function apply(message: ConfigMessage) {
  const first = waiting === null
  waiting = { ...message, fresh: message.fresh === true || waiting?.fresh === true }
  if (!first) return
  void oneAtATime(async () => {
    const next = waiting as ConfigMessage
    waiting = null
    await start(next)
  })
}

async function start({ code, template, fresh }: ConfigMessage) {
  tell({ type: 'studio:status', state: 'busy' })
  let config: Config
  try {
    const compiled = compile(code)
    for (const note of new Set(compiled.imports.notes)) log.info(note)
    config = prepare(compiled.config, (line) => log.info(line))
  } catch (error) {
    const line = error instanceof ConfigCodeError ? error.line : undefined
    tell({
      type: 'studio:status',
      state: 'error',
      message: (error as Error).message,
      ...(line ? { line } : {}),
    })
    return
  }
  if (fresh) {
    // A template was picked: its documents, not the last one's.
    await current?.cms.destroy().catch(() => {})
    current = null
    await dropMemoryDatabase(DATABASE)
  }
  let cms: Cms
  try {
    cms = await createEasyCMS(config, { logger: log, cwd: '/' })
  } catch (error) {
    // The last admin stays; the editor shows what is wrong.
    tell({ type: 'studio:status', state: 'error', message: (error as Error).message })
    return
  }
  try {
    const [admin] = (
      await cms.find('users', { where: { email: { equals: ADMIN.email } }, limit: 1 })
    ).docs
    if (!admin) await cms.create('users', { ...ADMIN, role: 'admin' })
    const { token } = await cms.auth.login(ADMIN)
    const samples = (template && SAMPLES[template]) || {}
    // The config's collections, and those a template has samples for (a plugin's, like tenants).
    const own = new Set([...(config.collections ?? []).map((c) => c.slug), ...Object.keys(samples)])
    const result = await seed(
      cms as never,
      cms.config.collections.filter((c) => own.has(c.slug)),
      samples,
    )
    if (result.created) log.info(`Added ${result.created} sample documents.`)
    for (const problem of result.problems) log.warn(`Sample documents: ${problem}`)
    const previous = current
    current = { cms, handle: createRestHandler(cms), token }
    await previous?.cms.destroy()
  } catch (error) {
    await cms.destroy().catch(() => {})
    tell({ type: 'studio:status', state: 'error', message: (error as Error).message })
    return
  }
  showAdmin()
  tell({ type: 'studio:status', state: 'ok' })
}

/** The theme Studio's toggle chose: this page's, and the admin's once it is ready. */
let theme: ThemeMode = 'system'
function setTheme(mode: ThemeMode) {
  theme = mode
  document.documentElement.style.colorScheme = mode === 'system' ? '' : mode
  adminFrame?.contentWindow?.postMessage({ type: 'easy-cms:theme', mode }, location.origin)
}

/** Frames the admin the first time; asks it to load the schema again after that. */
function showAdmin() {
  if (adminFrame) {
    adminFrame.contentWindow?.postMessage({ type: 'easy-cms:reload' }, location.origin)
    return
  }
  adminFrame = document.createElement('iframe')
  adminFrame.title = 'Easy CMS admin'
  adminFrame.src = `${ADMIN_PATH}/?host=${encodeURIComponent(hostId)}`
  document.body.append(adminFrame)
}

/** An API request of the admin, from the Service Worker. */
async function answer(request: ApiRequest): Promise<ApiResponse> {
  if (!current) return json(503, { errors: [{ message: 'Studio is starting' }] })
  const headers = new Headers(request.headers)
  headers.delete('cookie')
  headers.set('authorization', `Bearer ${current.token}`)
  const response = await current.handle(
    new Request(request.url, {
      method: request.method,
      headers,
      ...(request.body ? { body: request.body } : {}),
    }),
  )
  // Live updates stream for as long as the admin is open; Studio's admin reloads instead.
  if (response.headers.get('content-type')?.startsWith('text/event-stream')) {
    await response.body?.cancel()
    return json(204, null)
  }
  return {
    status: response.status,
    headers: [...response.headers],
    body: await response.arrayBuffer(),
  }
}

function json(status: number, data: unknown): ApiResponse {
  const body =
    data === null ? new ArrayBuffer(0) : new TextEncoder().encode(JSON.stringify(data)).buffer
  return { status, headers: [['content-type', 'application/json']], body: body as ArrayBuffer }
}

async function main() {
  if (!('serviceWorker' in navigator)) {
    tell({ type: 'studio:status', state: 'error', message: 'This browser has no Service Workers' })
    return
  }
  const registration = await navigator.serviceWorker.register('/sw.js', { type: 'module' })
  await navigator.serviceWorker.ready
  const worker = registration.active as ServiceWorker
  // The Service Worker knows this page by its client id, which only it can see.
  hostId = await new Promise<string>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = (event) => resolve(String(event.data))
    worker.postMessage({ type: 'studio:hello' }, [channel.port2])
  })
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as ApiRequest | null
    const port = event.ports[0]
    if (data?.type !== 'studio:request' || !port) return
    void oneAtATime(() => answer(data)).then(
      (response) => port.postMessage(response, [response.body]),
      (error: unknown) => port.postMessage(json(500, { errors: [{ message: String(error) }] })),
    )
  })
  window.addEventListener('message', (event: MessageEvent<ToSandbox>) => {
    // The admin, mounted: it gets the theme (its own default is the operating system's).
    if (
      adminFrame &&
      event.source === adminFrame.contentWindow &&
      event.origin === location.origin &&
      (event.data as { type?: unknown } | null)?.type === 'easy-cms:ready'
    ) {
      if (theme !== 'system') setTheme(theme)
      return
    }
    if (event.source !== window.parent || event.origin !== studioOrigin()) return
    if (event.data?.type === 'studio:config') apply(event.data)
    else if (event.data?.type === 'studio:theme') setTheme(event.data.mode)
  })
  tell({ type: 'studio:ready' })
}

void main()
