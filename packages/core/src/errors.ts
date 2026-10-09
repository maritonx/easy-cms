export interface ConfigIssue {
  /** Where the problem is, e.g. `collections.posts.fields.slug.from`. */
  readonly path: string
  readonly message: string
  /** How to fix it. */
  readonly hint?: string
}

/**
 * What went wrong, for programs: in REST errors (`errors[].code`), GraphQL errors
 * (`extensions.code`) and on every `EasyCMSError` (`code`). New codes may be added; these keep
 * their meaning.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'BAD_USER_INPUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'TOO_MANY_REQUESTS'
  | 'CONFIG_ERROR'
  | 'INTERNAL_SERVER_ERROR'

/** The code of an HTTP status, for errors that only have a status. */
export function codeOfStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'BAD_USER_INPUT'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 405:
      return 'METHOD_NOT_ALLOWED'
    case 413:
      return 'PAYLOAD_TOO_LARGE'
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE'
    case 429:
      return 'TOO_MANY_REQUESTS'
    default:
      return status >= 400 && status < 500 ? 'BAD_USER_INPUT' : 'INTERNAL_SERVER_ERROR'
  }
}

/** Base class for Easy CMS's errors: an HTTP status for the REST API, and a code for programs. */
export class EasyCMSError extends Error {
  readonly status: number
  readonly code: ErrorCode

  constructor(message: string, status: number, code: ErrorCode = codeOfStatus(status)) {
    super(message)
    this.name = 'EasyCMSError'
    this.status = status
    this.code = code
  }
}

export class ConfigError extends EasyCMSError {
  readonly issues: readonly ConfigIssue[]

  constructor(issues: readonly ConfigIssue[]) {
    super(ConfigError.format(issues), 500, 'CONFIG_ERROR')
    this.name = 'ConfigError'
    this.issues = issues
  }

  static format(issues: readonly ConfigIssue[]): string {
    const lines = issues.map((issue) => {
      const hint = issue.hint ? `\n    → ${issue.hint}` : ''
      return `  • ${issue.path}: ${issue.message}${hint}`
    })
    const noun = issues.length === 1 ? 'problem' : 'problems'
    return `Invalid Easy CMS config (${issues.length} ${noun}):\n${lines.join('\n')}`
  }
}

export interface FieldError {
  /** Dotted path, e.g. `links.0.url`. */
  readonly field: string
  readonly message: string
}

export class ValidationError extends EasyCMSError {
  readonly errors: readonly FieldError[]

  constructor(collection: string, errors: readonly FieldError[]) {
    const list = errors.map((e) => `${e.field}: ${e.message}`).join('; ')
    super(`Invalid data for "${collection}": ${list}`, 400, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
    this.errors = errors
  }
}

export class NotFoundError extends EasyCMSError {
  constructor(collection: string, id: unknown) {
    super(`No document with id ${JSON.stringify(id)} in "${collection}"`, 404)
    this.name = 'NotFoundError'
  }
}

/** A bad `where`, `sort` or unknown collection/global. */
export class QueryError extends EasyCMSError {
  constructor(message: string) {
    super(message, 400)
    this.name = 'QueryError'
  }
}

/** The database schema does not match the config (pending or missing migrations). */
export class SchemaError extends EasyCMSError {
  constructor(message: string) {
    super(message, 500)
    this.name = 'SchemaError'
  }
}

/** Not logged in, or the session is invalid. */
export class UnauthorizedError extends EasyCMSError {
  constructor(message = 'You must be logged in') {
    super(message, 401)
    this.name = 'UnauthorizedError'
  }
}

/** Logged in, but not allowed to do this. */
export class ForbiddenError extends EasyCMSError {
  constructor(message = 'You are not allowed to do this') {
    super(message, 403)
    this.name = 'ForbiddenError'
  }
}

export class TooManyRequestsError extends EasyCMSError {
  /** When to try again, in seconds (the REST API sends it as `Retry-After`). */
  readonly retryAfter: number | undefined

  constructor(message: string, retryAfter?: number) {
    super(message, 429)
    this.name = 'TooManyRequestsError'
    this.retryAfter = retryAfter
  }
}

export class PayloadTooLargeError extends EasyCMSError {
  constructor(message: string) {
    super(message, 413)
    this.name = 'PayloadTooLargeError'
  }
}
