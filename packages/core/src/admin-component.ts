import type { AdminLocale } from './config.js'
import type { AdminField } from './rest/admin-schema.js'

/**
 * What an admin component built with `easy-cms build:admin` gets as props (Vue, React, Svelte):
 * the properties the admin sets on every admin element, and `change`, `setField` and `navigate`,
 * which send its events. See "What the element receives" in the plugins guide.
 */
export interface AdminComponentProps<Value = unknown, Options = Record<string, unknown>> {
  /** `1`. Raised only for changes that break components. */
  readonly apiVersion: number
  /** The field's value (field components). */
  readonly value: Value
  /** The field's path, e.g. `meta.title` (field components). */
  readonly path: string | undefined
  /** The field as the admin sees it (field components). */
  readonly field: AdminField | undefined
  /** The field's label in the admin's language (field components). */
  readonly label: string | undefined
  /** The whole form as edited, not saved yet (a copy). */
  readonly doc: Record<string, unknown>
  readonly collection: string | undefined
  readonly global: string | undefined
  /** The document's id; `null` while creating one. */
  readonly id: string | number | null
  /** The content locale being edited, or `null` without localization. */
  readonly locale: string | null
  /** The admin's language. */
  readonly uiLocale: AdminLocale
  /** The user may not change it. */
  readonly readOnly: boolean
  /** The component's `props` from the config. */
  readonly options: Options
  /** The logged-in user. */
  readonly user: {
    readonly id: string | number
    readonly email: string
    readonly role: string
  } | null
  /** On a page of its own (`admin.pages`): what follows its path, and the query. */
  readonly route: { readonly subpath: string; readonly query: Record<string, string> } | undefined
  /** Calls the REST API as the logged-in user (cookies and CSRF included). */
  readonly api: <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>
  /** Sets the field (the `change` event). Saved when the editor saves. */
  readonly change: (value: Value) => void
  /** Sets any field of the form (the `set-field` event), e.g. `meta.title`. */
  readonly setField: (path: string, value: unknown) => void
  /** Opens a page of the admin (the `navigate` event), e.g. `/collections/posts`. */
  readonly navigate: (path: string) => void
}
