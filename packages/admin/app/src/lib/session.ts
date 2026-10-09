import type { AdminCollection, AdminGlobal, AdminSchema, SsoProviderRef } from '@easy-cms/core'
import { reactive } from 'vue'
import { api } from './api'
import { loadModules } from './plugins'

export interface User {
  id: number | string
  email: string
  name?: string | null
  role: string
  /** The role holds in part of the site only, e.g. one tenant (see `AuthUser.scoped`). */
  scoped?: boolean
}

/** An admin of the whole system, not of a part (`scoped`). */
export const isSystemAdmin = (user: User | null) => user?.role === 'admin' && user.scoped !== true

interface SessionState {
  loaded: boolean
  user: User | null
  hasUsers: boolean
  /** The login page offers "Forgot password?" (the CMS can email links). */
  passwordReset: boolean
  /** Outside accounts to sign in with (`auth.providers`). */
  providers: SsoProviderRef[]
  /** `false`: only admins sign in with a password (`auth.password: false`). */
  password: boolean
  /** Creating the first admin needs the setup code (`EASY_CMS_SETUP_CODE`). */
  setupCode: boolean
  schema: AdminSchema | null
}

export const session = reactive<SessionState>({
  loaded: false,
  user: null,
  hasUsers: true,
  passwordReset: false,
  providers: [],
  password: true,
  setupCode: false,
  schema: null,
})

/** Loads the current user and, when logged in, the admin schema. */
export async function loadSession(): Promise<void> {
  const me = await api<{ user: (User & { member?: boolean }) | null }>('GET', '/auth/me')
  // Site members (e.g. customers) are signed in on the site, not here.
  session.user = me.user?.member ? null : me.user
  if (session.user) {
    session.schema = await api<AdminSchema>('GET', '/admin/ui/schema')
    // Components from admin modules; views wait for the ones they show.
    void loadModules(session.schema.modules ?? [])
  } else {
    session.schema = null
    const init = await api<{
      hasUsers: boolean
      passwordReset?: boolean
      providers?: SsoProviderRef[]
      password?: boolean
      setupCode?: boolean
    }>('GET', '/auth/init')
    session.hasUsers = init.hasUsers
    session.passwordReset = init.passwordReset === true
    session.providers = init.providers ?? []
    session.password = init.password !== false
    session.setupCode = init.setupCode === true
  }
  session.loaded = true
}

/** Thrown by `login` for an account of a site member (e.g. a customer). */
export class MemberAccountError extends Error {}

export async function login(email: string, password: string): Promise<void> {
  const result = await api<{ user: { member?: boolean } }>('POST', '/auth/login', {
    email,
    password,
  })
  if (result.user.member) throw new MemberAccountError()
  await loadSession()
}

/** Asks for a link to set a new password; the answer is the same whether the email exists. */
export async function forgotPassword(email: string, locale: string): Promise<void> {
  await api('POST', '/auth/forgot-password', { email, locale })
}

/** Sets the password from a link and signs in. */
export async function resetPassword(token: string, password: string, locale: string) {
  await api('POST', '/auth/reset-password', { token, password, locale })
  await loadSession()
}

export async function registerFirstUser(data: {
  email: string
  password: string
  name?: string
  setupCode?: string
}) {
  await api('POST', '/auth/first-register', data)
  await loadSession()
}

export async function logout(): Promise<void> {
  await api('POST', '/auth/logout').catch(() => {})
  session.user = null
  session.schema = null
}

export function findCollection(slug: string): AdminCollection | undefined {
  return session.schema?.collections.find((c) => c.slug === slug)
}

export function findGlobal(slug: string): AdminGlobal | undefined {
  return session.schema?.globals.find((g) => g.slug === slug)
}

/** A one-time message shown by the next view, e.g. "Created" after redirecting to the new document. */
let flashMessage: string | null = null
export function setFlash(message: string) {
  flashMessage = message
}
export function takeFlash(): string | null {
  const message = flashMessage
  flashMessage = null
  return message
}
