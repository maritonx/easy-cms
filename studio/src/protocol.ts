/**
 * Messages between Studio's pages (ADR-0074). The editor (this origin) frames the sandbox (its
 * own origin in production), which runs the CMS and frames the admin; the sandbox's Service
 * Worker carries the admin's API requests to it.
 */

/** Editor → sandbox. */
export type ToSandbox = { type: 'studio:config'; code: string }

/** Sandbox → editor. */
export type ToEditor =
  | { type: 'studio:ready' }
  | { type: 'studio:status'; state: 'busy' }
  | { type: 'studio:status'; state: 'ok' }
  | { type: 'studio:status'; state: 'error'; message: string; line?: number }
  | { type: 'studio:console'; level: 'info' | 'warn' | 'error'; message: string }

/** Service Worker → sandbox: an API request of the admin, answered on `port`. */
export interface ApiRequest {
  type: 'studio:request'
  url: string
  method: string
  headers: [string, string][]
  body: ArrayBuffer | null
}

/** Sandbox → Service Worker, on the request's port. */
export interface ApiResponse {
  status: number
  headers: [string, string][]
  body: ArrayBuffer
}

/** The sandbox's page and the admin it frames. */
export const SANDBOX_PAGE = '/sandbox.html'
export const ADMIN_PATH = '/admin'
export const API_PATH = '/api/cms'

/** Where the sandbox is: its own origin in production (VITE_SANDBOX_ORIGIN), else this one. */
export const sandboxOrigin = (): string => import.meta.env.VITE_SANDBOX_ORIGIN || location.origin

/** Where the editor is, for the sandbox to check messages (VITE_STUDIO_ORIGIN), else its own. */
export const studioOrigin = (): string => import.meta.env.VITE_STUDIO_ORIGIN || location.origin
