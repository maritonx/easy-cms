import type { AuditChange, AuditEntry } from '@easy-cms/core'
import { label, type MessageKey, t } from './i18n'
import { session } from './session'

/** Actions the admin has words for; others show as they are (e.g. from newer servers). */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'draft',
  'publish',
  'unpublish',
  'restore',
  'delete',
  'schedule',
  'unschedule',
  'setup',
  'login',
  'login.failed',
  'login.locked',
  'logout',
  'password.forgot',
  'password.link',
  'password.reset',
  'sso.login',
  'sso.failed',
  'sso.link',
  'sso.unlink',
  'role.create',
  'role.update',
  'role.delete',
  'folder.permissions',
  'backup.start',
  'backup.download',
  'backup.delete',
  'email.test',
  'delivery.retry',
  'delivery.delete',
  'audit.verify',
] as const

export function actionLabel(action: string): string {
  return (AUDIT_ACTIONS as readonly string[]).includes(action)
    ? t(`audit.action.${action}` as MessageKey)
    : action
}

/** Failures and deletions stand out in the list. */
export function actionTone(action: string): 'danger' | 'warning' | 'ok' | 'plain' {
  if (action === 'delete' || action.endsWith('.delete') || action === 'login.locked')
    return 'danger'
  if (action.endsWith('.failed') || action === 'unpublish') return 'warning'
  if (action === 'publish' || action === 'create' || action === 'login') return 'ok'
  return 'plain'
}

/** What an entry is about: a collection or global by its name, or an area. */
export function targetLabel(target: string | null): string {
  if (!target) return '—'
  if (target.startsWith('global:')) {
    const slug = target.slice('global:'.length)
    return label(session.schema?.globals.find((g) => g.slug === slug)?.label, slug)
  }
  const collection = session.schema?.collections.find((c) => c.slug === target)
  if (collection) return label(collection.labels?.plural, target)
  const area = `audit.target.${target}` as MessageKey
  return ['auth', 'roles', 'backups', 'email', 'deliveries', 'audit'].includes(target)
    ? t(area)
    : target
}

/** Where the entry's document is in the admin, if it still is somewhere to go. */
export function entryLink(entry: AuditEntry): string | null {
  if (entry.action === 'delete') return null
  if (entry.target?.startsWith('global:')) return `/globals/${entry.target.slice('global:'.length)}`
  if (entry.doc && session.schema?.collections.some((c) => c.slug === entry.target))
    return `/collections/${entry.target}/${entry.doc}`
  if (entry.target === 'roles' && entry.title && entry.action !== 'role.delete')
    return `/roles?role=${encodeURIComponent(entry.title)}`
  return null
}

const VIA: Record<string, MessageKey> = {
  user: 'audit.via.user',
  'api-key': 'audit.via.api-key',
  system: 'audit.via.system',
  scheduler: 'audit.via.scheduler',
}
export const viaLabel = (via: string) => (VIA[via] ? t(VIA[via] as MessageKey) : via)

/**
 * The rows of one change: a translated field (a value per content locale) gets a row for each
 * locale whose value changed, e.g. `title · en`.
 */
export function changeRows(change: AuditChange): AuditChange[] {
  const locales = session.schema?.localization?.locales ?? []
  const byLocale = (value: unknown) =>
    value === null ||
    value === undefined ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0 &&
      Object.keys(value).every((k) => locales.includes(k)))
  if (!('before' in change) || locales.length === 0) return [change]
  const { before, after } = change
  if (!byLocale(before) || !byLocale(after) || (before === null && after === null)) return [change]
  const at = (value: unknown, locale: string) =>
    (value as Record<string, unknown> | null)?.[locale] ?? null
  return locales
    .filter((l) => JSON.stringify(at(before, l)) !== JSON.stringify(at(after, l)))
    .map((l) => ({ field: `${change.field} · ${l}`, before: at(before, l), after: at(after, l) }))
}

/** A value before or after a change, short. */
export function showValue(value: unknown): string {
  if (value === undefined) return ''
  if (value === null || value === '') return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
