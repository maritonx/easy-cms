import type { AdminCollection, AdminGlobal, AdminSchema } from '@easy-cms/core'
import { reactive } from 'vue'
import { api } from './api'
import { loadModules } from './plugins'

export interface User {
  id: number | string
  email: string
  name?: string | null
  role: string
}

interface SessionState {
  loaded: boolean
  user: User | null
  hasUsers: boolean
  /** The login page offers "Forgot password?" (the CMS can email links). */
  passwordReset: boolean
  schema: AdminSchema | null
}

export const session = reactive<SessionState>({
  loaded: false,
  user: null,
  hasUsers: true,
  passwordReset: false,
  schema: null,
})

/** Loads the current user and, when logged in, the admin schema. */
export async function loadSession(): Promise<void> {
  const me = await api<{ user: User | null }>('GET', '/users/me')
  session.user = me.user
  if (me.user) {
    session.schema = await api<AdminSchema>('GET', '/admin/schema')
    // Components from admin modules; views wait for the ones they show.
    void loadModules(session.schema.modules ?? [])
  } else {
    session.schema = null
    const init = await api<{ hasUsers: boolean; passwordReset?: boolean }>('GET', '/users/init')
    session.hasUsers = init.hasUsers
    session.passwordReset = init.passwordReset === true
  }
  session.loaded = true
}

export async function login(email: string, password: string): Promise<void> {
  await api('POST', '/users/login', { email, password })
  await loadSession()
}

/** Asks for a link to set a new password; the answer is the same whether the email exists. */
export async function forgotPassword(email: string, locale: string): Promise<void> {
  await api('POST', '/users/forgot-password', { email, locale })
}

/** Sets the password from a link and signs in. */
export async function resetPassword(token: string, password: string, locale: string) {
  await api('POST', '/users/reset-password', { token, password, locale })
  await loadSession()
}

export async function registerFirstUser(data: { email: string; password: string; name?: string }) {
  await api('POST', '/users/first-register', data)
  await loadSession()
}

export async function logout(): Promise<void> {
  await api('POST', '/users/logout').catch(() => {})
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
