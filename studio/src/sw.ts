/// <reference lib="webworker" />
/**
 * The sandbox's Service Worker (ADR-0074): serves the admin's shell in Studio mode, and carries
 * the admin's API requests to the sandbox page, which runs the CMS. It keeps nothing that matters
 * (browsers stop idle workers): which page hosts which admin is a hint, found again if lost.
 */
import { renderShell } from '@easy-cms/admin/shell'
import { adminHeaders } from '../deploy/headers'
import {
  ADMIN_PATH,
  API_PATH,
  type ApiRequest,
  type ApiResponse,
  SANDBOX_PAGE,
  studioOrigin,
} from './protocol'

declare const self: ServiceWorkerGlobalScope

/** Admin client → the sandbox page that framed it. */
const hosts = new Map<string, string>()
let shell: Promise<string> | undefined

self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type !== 'studio:hello') return
  const source = event.source as Client | null
  if (source) event.ports[0]?.postMessage(source.id)
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === API_PATH || url.pathname.startsWith(`${API_PATH}/`)) {
    event.respondWith(forward(event))
    return
  }
  const isPage = event.request.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(url.pathname)
  if (isPage && (url.pathname === ADMIN_PATH || url.pathname.startsWith(`${ADMIN_PATH}/`))) {
    const host = url.searchParams.get('host')
    if (host && event.resultingClientId) hosts.set(event.resultingClientId, host)
    event.respondWith(adminShell())
  }
})

async function adminShell(): Promise<Response> {
  shell ??= fetch(`${ADMIN_PATH}/shell.html`).then((r) => r.text())
  const html = renderShell(await shell, {
    basePath: ADMIN_PATH,
    apiPath: API_PATH,
    studio: { origin: self.location.origin },
  })
  return new Response(html, {
    headers: {
      ...adminHeaders({ studio: studioOrigin() }),
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  })
}

/** The page that runs the CMS for this admin. */
async function hostOf(clientId: string): Promise<Client | undefined> {
  const known = hosts.get(clientId)
  if (known) {
    const client = await self.clients.get(known)
    if (client) return client
  }
  // Forgotten (the worker was stopped): the most recently used sandbox page.
  const pages = await self.clients.matchAll({ type: 'window' })
  return pages.find((page) => new URL(page.url).pathname === SANDBOX_PAGE)
}

const NO_BODY = new Set([101, 204, 205, 304])

async function forward(event: FetchEvent): Promise<Response> {
  const host = await hostOf(event.clientId)
  if (!host) return Response.json({ errors: [{ message: 'Studio is not open' }] }, { status: 503 })
  const { request } = event
  const body =
    request.method === 'GET' || request.method === 'HEAD' ? null : await request.arrayBuffer()
  const message: ApiRequest = {
    type: 'studio:request',
    url: request.url,
    method: request.method,
    headers: [...request.headers],
    body,
  }
  const channel = new MessageChannel()
  const reply = new Promise<ApiResponse>((resolve) => {
    channel.port1.onmessage = (e) => resolve(e.data as ApiResponse)
  })
  host.postMessage(message, [channel.port2, ...(body ? [body] : [])])
  const response = await reply
  return new Response(NO_BODY.has(response.status) ? null : response.body, {
    status: response.status,
    headers: response.headers,
  })
}
