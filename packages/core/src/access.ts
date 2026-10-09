/** A document id. SQLite uses integers, Postgres may use either. */
export type ID = string | number

export type Role = 'admin' | 'editor' | (string & {})

/** The logged-in admin user, as seen by access functions and hooks. */
export interface AuthUser {
  readonly id: ID
  readonly email: string
  readonly role: Role
  /**
   * Set by `onRequest` (e.g. a multi-tenant plugin) when `role` holds only in part of the site,
   * such as one tenant: an `admin` there administers that part, not the whole system (Settings,
   * backups, roles, other users' API keys).
   */
  readonly scoped?: boolean
  readonly [field: string]: unknown
}

/**
 * An admin of the whole system: role `admin`, signed in (not an API key), and not an admin of a
 * part only (`scoped`).
 */
export const isSystemAdmin = (user: AuthUser | null | undefined): boolean =>
  user?.role === 'admin' && !user.apiKey && user.scoped !== true

export interface WhereOperators {
  readonly equals?: unknown
  readonly not_equals?: unknown
  readonly in?: readonly unknown[]
  readonly not_in?: readonly unknown[]
  readonly gt?: number | string
  readonly gte?: number | string
  readonly lt?: number | string
  readonly lte?: number | string
  readonly like?: string
  readonly exists?: boolean
}

export type Where = {
  readonly and?: readonly Where[]
  readonly or?: readonly Where[]
} & {
  readonly [field: string]: WhereOperators | readonly Where[] | undefined
}

/**
 * What a request is about besides its user, e.g. the site or tenant it works in: set by
 * `onRequest` in the config (usually a plugin's), or passed to the Local API as `context`.
 */
export type RequestContext = Readonly<Record<string, unknown>>

export interface AccessArgs {
  /** `null` when the request is not logged in. */
  readonly user: AuthUser | null
  /** The request's context (`onRequest`), `{}` when there is none. */
  readonly context?: RequestContext
  readonly id?: ID
  readonly data?: Readonly<Record<string, unknown>>
}

/**
 * Decides whether an operation is allowed.
 * Return a `Where` to allow it only for the documents that match.
 */
export type Access = (args: AccessArgs) => boolean | Where | Promise<boolean | Where>

export interface CollectionAccess {
  readonly read?: Access
  readonly create?: Access
  readonly update?: Access
  readonly delete?: Access
}

export interface GlobalAccess {
  readonly read?: Access
  readonly update?: Access
}

export type FieldAccessFn = (args: AccessArgs) => boolean | Promise<boolean>

export interface FieldAccess {
  readonly read?: FieldAccessFn
  readonly update?: FieldAccessFn
}

export const anyone: Access = () => true

export const isLoggedIn: Access = ({ user }) => user !== null

export const isAdmin: Access = ({ user }) => user?.role === 'admin'
