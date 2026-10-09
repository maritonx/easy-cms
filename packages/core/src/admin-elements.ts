import type { AdminLocale } from './config.js'
import type { AdminField } from './rest/admin-schema.js'

/**
 * The version of what the admin gives the Web Components of admin modules (fields, cells, side
 * panels, pages, dashboard panels). It changes only when a component would break.
 */
export const ADMIN_API_VERSION = 1

/** Where a page (`admin.pages`) is: what follows `/p/<path>/`, and the query's first values. */
export interface AdminPageRoute {
  readonly subpath: string
  readonly query: Readonly<Record<string, string>>
}

/**
 * The properties the admin sets on a component's element. Components may dispatch:
 *
 * - `change` (`CustomEvent`, `detail`: the new value): sets the field's value.
 * - `set-field` (`detail: { path, value }`): sets another field, e.g. `meta.title`.
 * - `navigate` (`detail`: a path inside the admin, e.g. `/p/forms-overview?range=30`): goes there.
 */
export interface AdminElementProps {
  apiVersion: typeof ADMIN_API_VERSION
  /** The field's value (field components only). */
  value: unknown
  /** The field's path in the document, e.g. `meta.title` (field components only). */
  path: string | undefined
  field: AdminField | undefined
  /** The field's label in the admin's language (field components only). */
  label: string | undefined
  /** The whole form as edited, not yet saved (a copy); in a list's cell, that row's document. */
  doc: Record<string, unknown>
  collection: string | undefined
  global: string | undefined
  /** The document's id; `null` while creating one. */
  id: string | number | null
  /** The content locale being edited (with localization), otherwise `null`. */
  locale: string | null
  /** The admin's language. */
  uiLocale: AdminLocale
  readOnly: boolean
  /** The component's `props` from the config. */
  options: Record<string, unknown>
  /** Calls the REST API as the logged-in user, e.g. `api('POST', '/seo/generate', body)`. */
  api: <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>
  /** The logged-in user. */
  user: { id: string | number; email: string; role: string } | null
  /** On a page of its own (`admin.pages`): the rest of its path and the query; otherwise undefined. */
  route: AdminPageRoute | undefined
}

/** The `detail` of a `set-field` event. */
export interface SetFieldDetail {
  readonly path: string
  readonly value: unknown
}
