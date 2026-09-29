import {
  type Confirmation,
  formPath,
  type PublicForm,
  type Submission,
  type SubmitResult,
} from './shared.js'

export type {
  Confirmation,
  FieldKind,
  PublicField,
  PublicForm,
  Submission,
  SubmitResult,
} from './shared.js'

export interface ClientOptions {
  /** The REST API's address, e.g. `/api/cms` or `https://cms.example.com/api/cms`. */
  readonly api: string
  /** The `fetch` to use (e.g. Nuxt's `$fetch` wrapper, or a test double). */
  readonly fetch?: typeof fetch
}

const base = (api: string) => api.replace(/\/+$/, '')

/**
 * A published form, ready to render: its fields in `locale`, the submit label, and the token to
 * send back with the submission. `null` when there is no such published form.
 */
export async function getForm(
  slug: string,
  options: ClientOptions & { readonly locale?: string | null },
): Promise<PublicForm | null> {
  const query = options.locale ? `?locale=${encodeURIComponent(options.locale)}` : ''
  const response = await (options.fetch ?? fetch)(`${base(options.api)}${formPath(slug)}${query}`, {
    credentials: 'omit',
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Could not load form "${slug}" (${response.status})`)
  return (await response.json()) as PublicForm
}

/**
 * Sends a submission. Resolves to the confirmation (a message or a redirect), or to the errors:
 * per field (`field`) for invalid values, or for the whole form (too many submissions…).
 */
export async function submitForm(
  slug: string,
  submission: Submission,
  options: ClientOptions,
): Promise<SubmitResult> {
  const response = await (options.fetch ?? fetch)(`${base(options.api)}${formPath(slug)}/submit`, {
    method: 'POST',
    // No cookies: a logged-in editor viewing the site submits like any visitor.
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  })
  const body = (await response.json().catch(() => ({}))) as {
    confirmation?: Confirmation
    errors?: { message: string; field?: string }[]
  }
  if (response.ok && body.confirmation) return { ok: true, confirmation: body.confirmation }
  return {
    ok: false,
    status: response.status,
    errors: body.errors ?? [{ message: `Could not send the form (${response.status})` }],
  }
}
