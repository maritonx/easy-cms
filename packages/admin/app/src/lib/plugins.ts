import type { AdminField } from '@easy-cms/core'
import type { InjectionKey, Ref } from 'vue'
import type { api } from './api'
import { settings } from './settings'

/**
 * Admin modules (`admin.modules`) define Web Components that fields and edit pages show. The
 * admin sets these properties on each element and listens for two events:
 *
 * - `change` (a `CustomEvent` whose `detail` is the new value): sets the field's value.
 * - `set-field` (`detail: { path, value }`): sets another field, e.g. `meta.title`.
 * - `navigate` (`detail`: a path inside the admin, e.g. `/p/forms-overview?range=30`): goes there.
 *
 * Bump `API_VERSION` only for changes that break existing components.
 */
export const API_VERSION = 1

export interface ElementContext {
  apiVersion: typeof API_VERSION
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
  /** The admin's language: `en` or `th`. */
  uiLocale: string
  readOnly: boolean
  /** The component's `props` from the config. */
  options: Record<string, unknown>
  /** Calls the REST API as the logged-in user, e.g. `api('POST', '/seo/generate', body)`. */
  api: typeof api
  /** The logged-in user. */
  user: { id: string | number; email: string; role: string } | null
  /** On a page of its own (`admin.pages`): the rest of its path and the query; otherwise undefined. */
  route: PageRoute | undefined
}

/** Where a page (`admin.pages`) is: what follows `/p/<path>/`, and the query's first values. */
export interface PageRoute {
  subpath: string
  query: Record<string, string>
}

/** What an edit page shares with components inside its form. */
export interface FormContext {
  readonly doc: Readonly<Ref<Record<string, unknown>>>
  /** Sets a value by path (`meta.title`, `links.0.url`), replacing the form object. */
  setField(path: string, value: unknown): void
  readonly collection?: string
  readonly global?: string
  readonly id: Readonly<Ref<string | number | null>>
}

export const FORM: InjectionKey<FormContext> = Symbol('easy-cms-form')

/** A copy of `data` with the value at `path` replaced; missing groups and rows are created. */
export function setPath(
  data: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split('.') as [string, ...string[]]
  if (rest.length === 0) return { ...data, [head]: value }
  const child = data[head]
  const next = rest.join('.')
  if (Array.isArray(child)) {
    const index = Number(rest[0])
    const copy = [...child]
    const row = copy[index]
    copy[index] =
      rest.length === 1
        ? value
        : setPath(
            typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {},
            rest.slice(1).join('.'),
            value,
          )
    return { ...data, [head]: copy }
  }
  const group =
    typeof child === 'object' && child !== null ? (child as Record<string, unknown>) : {}
  return { ...data, [head]: setPath(group, next, value) }
}

let loading: Promise<void> | undefined

/**
 * Imports the admin modules once, after login. Resolves when all have loaded or failed; a
 * failing module is logged and the rest of the admin works without it.
 */
export function loadModules(urls: readonly string[]): Promise<void> {
  loading ??= Promise.allSettled(
    urls.map((url) => import(/* @vite-ignore */ `${settings.apiPath}${url}`)),
  ).then((results) => {
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected')
        console.error(`Easy CMS: admin module ${urls[i]} failed to load`, result.reason)
    }
  })
  return loading
}

/** Settles after the modules loaded (or failed); immediately when none were requested. */
export function modulesLoaded(): Promise<void> {
  return loading ?? Promise.resolve()
}
