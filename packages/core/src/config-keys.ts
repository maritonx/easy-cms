// Option names of the config: errors for names that changed (with the new name), and warnings for
// names Easy CMS doesn't know (usually a typo, which would otherwise do nothing).
import type { Config } from './config.js'
import { ConfigError, type ConfigIssue } from './errors.js'

type Add = (issue: ConfigIssue) => void
type Data = Record<string, unknown>

const keys = (list: string) => new Set(list.split(/\s+/).filter(Boolean))

const CONFIG =
  keys(`secret db serverURL cors cronSecret webhooks events jobs localization routes admin
  upload auth collections globals endpoints cliCommands onRequest fieldTypes apiKeys email backups
  audit plugins`)
const ADMIN = keys('path locale brand siteURL nav commands modules pages dashboard switcher')
const AUTH = keys(`roles rbac tokenExpiration maxLoginAttempts lockWindow trustedOrigins
  resetPasswordExpiration inviteExpiration providers providerSignUp password setupCode members emails`)
const MEMBERS = keys('roles signUp pages emails')
const UPLOAD = keys('dir maxFileSize mimeTypes storage imageSizes fromURL folders privateStorage')
const BACKUPS = keys('frequency at keep dir storage sqlite encryptionKey')
const AUDIT = keys('keepDays values failedLogins scope')
const COLLECTION = keys(`slug labels fields useAsTitle drafts versions schedule preview access hooks
  admin`)
const GLOBAL = keys('slug label fields drafts versions schedule preview access hooks scope admin')
const CONTAINER_ADMIN = keys('icon order sidebar layout group')
const COLLECTION_ADMIN = keys(
  'icon order sidebar layout group editIn badge count empty list ownerField confirmDelete',
)
const FIELD_ADMIN = keys(
  'description width condition component after cell column allowCreate initialValue position',
)
const BASE_FIELD = `type name label required unique uniqueWithin index defaultValue validate access
  hidden localized admin customType`
const FIELD: Record<string, Set<string>> = {
  text: keys(`${BASE_FIELD} minLength maxLength`),
  textarea: keys(`${BASE_FIELD} minLength maxLength`),
  number: keys(`${BASE_FIELD} min max`),
  boolean: keys(BASE_FIELD),
  date: keys(BASE_FIELD),
  email: keys(BASE_FIELD),
  json: keys(BASE_FIELD),
  select: keys(`${BASE_FIELD} options hasMany minRows maxRows`),
  slug: keys(`${BASE_FIELD} from`),
  richText: keys(BASE_FIELD),
  upload: keys(`${BASE_FIELD} hasMany minRows maxRows mimeTypes folder folderOnly filterOptions`),
  relationship: keys(`${BASE_FIELD} to hasMany minRows maxRows filterOptions`),
  array: keys(`${BASE_FIELD} fields minRows maxRows`),
  group: keys(`${BASE_FIELD} fields`),
  blocks: keys(`${BASE_FIELD} blocks minRows maxRows`),
}

/** Names that changed in 0.60: where, the old name and the new one. */
const RENAMED: readonly [scope: string, from: string, to: string][] = [
  ['config', 'commands', 'cliCommands'],
  ['admin', 'siteUrl', 'siteURL'],
  ['admin', 'menu', 'order (`admin.order` on each collection, global or page)'],
  ['auth', 'allowSignUp', 'providerSignUp'],
  ['members', 'signup', 'signUp'],
  ['audit', 'keep', 'keepDays'],
  ['backups', 'every', "frequency ('daily' or 'weekly')"],
  ['collection', 'icon', 'admin.icon'],
  ['collection', 'editIn', 'admin.editIn'],
  ['global', 'icon', 'admin.icon'],
  ['versions', 'max', 'keep'],
  ['field', 'position', 'admin.position'],
  ['fieldAdmin', 'defaultValue', 'initialValue'],
  ['command', 'to', 'href'],
]

const isObject = (value: unknown): value is Data =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The closest known name, for "did you mean". */
function closest(name: string, known: ReadonlySet<string>): string | undefined {
  let best: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of known) {
    const d = distance(name.toLowerCase(), candidate.toLowerCase())
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }
  return bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : undefined
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] as number
      row[j] = Math.min(
        (row[j] as number) + 1,
        (row[j - 1] as number) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      previous = current
    }
  }
  return row[b.length] as number
}

function check(value: unknown, path: string, scope: string, known: ReadonlySet<string>, add: Add) {
  if (!isObject(value)) return
  for (const key of Object.keys(value)) {
    if (known.has(key)) continue
    const renamed = RENAMED.find(([s, from]) => s === scope && from === key)
    if (renamed) {
      add({ path: `${path}.${key}`.replace(/^\./, ''), message: `is now \`${renamed[2]}\`` })
      continue
    }
    const guess = closest(key, known)
    add({
      path: `${path}.${key}`.replace(/^\./, ''),
      message: `is not an option Easy CMS knows${guess ? `: did you mean \`${guess}\`?` : ''}`,
      severity: 'warning',
    })
  }
}

function checkFields(fields: unknown, path: string, add: Add) {
  if (!Array.isArray(fields)) return
  for (const [i, field] of fields.entries()) {
    if (!isObject(field)) continue
    const at = `${path}.${typeof field.name === 'string' ? field.name : `[${i}]`}`
    const known = typeof field.type === 'string' ? FIELD[field.type] : undefined
    // Fields of added types (`fieldTypes`) may take options of their own.
    if (known && field.customType === undefined) check(field, at, 'field', known, add)
    check(field.admin, `${at}.admin`, 'fieldAdmin', FIELD_ADMIN, add)
    checkFields(field.fields, `${at}.fields`, add)
    if (Array.isArray(field.blocks))
      for (const block of field.blocks)
        if (isObject(block)) checkFields(block.fields, `${at}.blocks.${String(block.slug)}`, add)
  }
}

/** Renamed options (errors) and unknown ones (warnings). */
export function checkConfigKeys(config: Config, add: Add) {
  const c = config as unknown as Data
  check(c, '', 'config', CONFIG, add)
  check(c.admin, 'admin', 'admin', ADMIN, add)
  const admin = isObject(c.admin) ? c.admin : {}
  if (Array.isArray(admin.commands))
    for (const [i, command] of admin.commands.entries())
      if (isObject(command) && 'to' in command)
        add({ path: `admin.commands[${i}].to`, message: 'is now `href`' })
  check(c.auth, 'auth', 'auth', AUTH, add)
  if (isObject(c.auth)) check(c.auth.members, 'auth.members', 'members', MEMBERS, add)
  check(c.upload, 'upload', 'upload', UPLOAD, add)
  check(c.backups, 'backups', 'backups', BACKUPS, add)
  if (isObject(c.audit)) check(c.audit, 'audit', 'audit', AUDIT, add)
  for (const [kind, list] of [
    ['collections', c.collections],
    ['globals', c.globals],
  ] as const) {
    if (!Array.isArray(list)) continue
    const collection = kind === 'collections'
    for (const [i, item] of list.entries()) {
      if (!isObject(item)) continue
      const at = `${kind}.${typeof item.slug === 'string' ? item.slug : `[${i}]`}`
      check(item, at, collection ? 'collection' : 'global', collection ? COLLECTION : GLOBAL, add)
      check(
        item.admin,
        `${at}.admin`,
        'admin-of',
        collection ? COLLECTION_ADMIN : CONTAINER_ADMIN,
        add,
      )
      if (isObject(item.versions))
        check(item.versions, `${at}.versions`, 'versions', keys('keep'), add)
      checkFields(item.fields, `${at}.fields`, add)
    }
  }
}

/**
 * Throws a ConfigError for options of a plugin or adapter whose name changed, so an upgrade
 * doesn't quietly drop them. `renamed` maps the old name to the new one, maybe followed by a note.
 */
export function checkRenamedOptions(
  where: string,
  options: object | undefined,
  renamed: Readonly<Record<string, string>>,
): void {
  if (!options) return
  const issues = Object.keys(options)
    .filter((key) => Object.hasOwn(renamed, key))
    .map((key) => {
      // The new name, then maybe a note: 'minSubmitSeconds (in seconds)'.
      const [name, ...note] = (renamed[key] as string).split(' ')
      return { path: `${where}.${key}`, message: `is now \`${name}\` ${note.join(' ')}`.trim() }
    })
  if (issues.length) throw new ConfigError(issues)
}
