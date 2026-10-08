import { settings } from './settings'

export interface ApiErrorItem {
  message: string
  field?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly errors: ApiErrorItem[]

  constructor(status: number, errors: ApiErrorItem[]) {
    super(errors.map((e) => e.message).join('; ') || `Request failed (${status})`)
    this.status = status
    this.errors = errors
  }

  /** Validation messages keyed by field path. */
  get fieldErrors(): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    for (const e of this.errors) {
      if (!e.field) continue
      map[e.field] = [...(map[e.field] ?? []), e.message]
    }
    return map
  }
}

function cookie(name: string): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

/** Called when the API says the session is gone, so the app can go to the login page. */
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  const multipart = body instanceof FormData
  // The browser sets the multipart boundary itself.
  if (body !== undefined && !multipart) headers['content-type'] = 'application/json'
  const csrf = cookie('ecms-csrf')
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf

  const response = await fetch(`${settings.apiPath}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : undefined
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/users/')) onUnauthorized()
    throw new ApiError(response.status, (data?.errors as ApiErrorItem[]) ?? [])
  }
  return data as T
}

/** Builds a bracket query string: `{ where: { title: { like: 'x' } } }` → `where[title][like]=x`. */
export function toQuery(params: Record<string, unknown>): string {
  const parts: string[] = []
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>))
        walk(prefix ? `${prefix}[${k}]` : k, v)
    } else {
      parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`)
    }
  }
  walk('', params)
  return parts.length ? `?${parts.join('&')}` : ''
}

export interface Paginated<T> {
  docs: T[]
  totalDocs: number
  limit: number
  page: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export type Id = number | string
export type Doc = Record<string, unknown> & { id: Id }

/** Uploads one file to the media library. */
export function uploadFile(file: File, alt?: string, folder?: Id | null): Promise<Doc> {
  const form = new FormData()
  form.set('file', file)
  if (alt) form.set('alt', alt)
  if (folder !== undefined && folder !== null) form.set('folder', String(folder))
  return api<Doc>('POST', '/media?depth=0', form)
}

/** An upload in progress: its result, and a way to cancel it. */
export interface Upload {
  done: Promise<Doc>
  abort: () => void
}

/** Thrown by a cancelled upload. */
export class UploadCancelled extends Error {}

/**
 * Uploads one file to the media library, reporting progress from 0 to 1 (`fetch` can't report
 * an upload's progress, so this uses XMLHttpRequest).
 */
/** Files larger than this go straight to the storage when it can take them (hosts limit bodies). */
const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024

/** Sends a body with XMLHttpRequest, reporting progress; resolves with the response. */
function send(
  xhr: XMLHttpRequest,
  method: string,
  url: string,
  headers: Record<string, string>,
  body: XMLHttpRequestBodyInit,
  onProgress: (fraction: number) => void,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    xhr.open(method, url)
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      let data: unknown
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : undefined
      } catch {
        data = undefined
      }
      resolve({ status: xhr.status, data })
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.onabort = () => reject(new UploadCancelled('Cancelled'))
    xhr.send(body)
  })
}

/**
 * Uploads one file to the media library, reporting progress from 0 to 1 (`fetch` can't report
 * an upload's progress, so this uses XMLHttpRequest). Large files go straight to the storage
 * when it can take them (`POST /media/uploads`, then `/media/uploads/complete`).
 */
export function uploadWithProgress(
  file: File,
  options: { alt?: string; folder?: Id | null | undefined },
  onProgress: (fraction: number) => void,
): Upload {
  const xhr = new XMLHttpRequest()
  let cancelled = false
  const fields = {
    ...(options.alt ? { alt: options.alt } : {}),
    ...(options.folder !== undefined && options.folder !== null ? { folder: options.folder } : {}),
  }
  const ours = () => {
    const headers: Record<string, string> = { accept: 'application/json' }
    const csrf = cookie('ecms-csrf')
    if (csrf) headers['x-csrf-token'] = csrf
    return headers
  }
  const failed = (status: number, data: unknown) => {
    if (status === 401) onUnauthorized()
    return new ApiError(status, (data as { errors?: ApiErrorItem[] } | undefined)?.errors ?? [])
  }

  const done = (async (): Promise<Doc> => {
    if (file.size > DIRECT_UPLOAD_BYTES) {
      const started = await api<{
        ticket: string
        upload: { url: string; method: string; headers: Record<string, string> } | null
      }>('POST', '/media/uploads', { name: file.name, size: file.size, type: file.type, ...fields })
      if (cancelled) throw new UploadCancelled('Cancelled')
      if (started.upload) {
        const { status, data } = await send(
          xhr,
          started.upload.method,
          started.upload.url,
          started.upload.headers,
          file,
          onProgress,
        )
        if (status < 200 || status >= 300)
          throw new ApiError(status, [{ message: `The storage refused the file (${status})` }])
        return api<Doc>('POST', '/media/uploads/complete?depth=0', {
          ticket: started.ticket,
        }).catch((e) => {
          throw e instanceof ApiError ? e : failed(500, data)
        })
      }
    }
    // Through the server.
    const form = new FormData()
    form.set('file', file)
    for (const [name, value] of Object.entries(fields)) form.set(name, String(value))
    xhr.withCredentials = true
    const { status, data } = await send(
      xhr,
      'POST',
      `${settings.apiPath}/media?depth=0`,
      ours(),
      form,
      onProgress,
    )
    if (status >= 200 && status < 300) return data as Doc
    throw failed(status, data)
  })()
  return {
    done,
    abort: () => {
      cancelled = true
      xhr.abort()
    },
  }
}

/** Has the server download a file from a link into the media library (`upload.fromURL`). */
export function uploadFromURL(url: string, alt?: string, folder?: Id | null): Promise<Doc> {
  return api<Doc>('POST', '/media?depth=0', {
    url,
    ...(alt ? { alt } : {}),
    ...(folder !== undefined && folder !== null ? { folder } : {}),
  })
}
