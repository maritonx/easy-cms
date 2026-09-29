/**
 * Types shared by the server plugin, the browser client and the `<easy-form>` element. This
 * file must not import anything: it ends up in browser bundles.
 */

export const FIELD_KINDS = [
  'text',
  'textarea',
  'email',
  'number',
  'phone',
  'select',
  'checkbox',
  'date',
  'message',
] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

/** A field of a published form, as the public API sends it (labels in the requested locale). */
export interface PublicField {
  readonly kind: FieldKind
  /** The key in the submitted data. Empty for `message`. */
  readonly name: string
  readonly label: string
  readonly required: boolean
  readonly placeholder?: string
  readonly defaultValue?: string | boolean
  readonly width: 'full' | 'half'
  /** `select`: the choices. */
  readonly options?: readonly { readonly label: string; readonly value: string }[]
  /** `select`: several choices. */
  readonly multiple?: boolean
  /** `select`: radio buttons (or checkboxes with `multiple`) instead of a dropdown. */
  readonly display?: 'dropdown' | 'radio'
  /** `number`. */
  readonly min?: number
  readonly max?: number
  /** `message`: the text as HTML (escaped and safe). */
  readonly html?: string
}

/** A published form, as `GET <api>/form/:slug` returns it. */
export interface PublicForm {
  readonly slug: string
  readonly title: string
  readonly fields: readonly PublicField[]
  readonly submitLabel: string
  /** Send it back with the submission: it proves the form was loaded a moment before. */
  readonly token: string
  /** The name of the hidden field bots fill in; leave it empty. */
  readonly honeypot: string
  /** Cloudflare Turnstile's site key, when the form needs it. */
  readonly turnstile: string | null
  readonly locale: string | null
}

/** What happens after a submission. */
export type Confirmation =
  | { readonly type: 'message'; readonly html: string }
  | { readonly type: 'redirect'; readonly url: string }

/** The body of `POST <api>/form/:slug/submit`. */
export interface Submission {
  readonly data: Readonly<Record<string, unknown>>
  readonly token: string
  /** The page the form is on, kept with the submission. */
  readonly page?: string
  readonly locale?: string | null
  /** Cloudflare Turnstile's response token. */
  readonly turnstile?: string
  /** The honeypot's value: must be empty. */
  readonly [honeypot: string]: unknown
}

export type SubmitResult =
  | { readonly ok: true; readonly confirmation: Confirmation }
  | {
      readonly ok: false
      readonly status: number
      readonly errors: readonly { readonly message: string; readonly field?: string }[]
    }

/** The endpoints, under the REST API. */
export const formPath = (slug: string) => `/form/${encodeURIComponent(slug)}`
