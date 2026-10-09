import { CREATED_BY_FIELD } from './builtins.js'
import { ADMIN_ICONS, type CollectionConfig, type Config, type GlobalConfig } from './config.js'
import type { ConfigIssue } from './errors.js'
import { FIELD_TYPES, type Field, type SelectOption } from './fields.js'
import { WEBHOOK_EVENTS } from './webhooks.js'

export const MIN_SECRET_LENGTH = 32

/** Collections that Easy CMS provides. They can be relationship targets. */
export const BUILTIN_COLLECTIONS = ['users', 'media'] as const

/** Slugs that would clash with Easy CMS's own tables or routes. */
const RESERVED_SLUGS = new Set([
  'admin',
  'globals',
  'sessions',
  'login-attempts',
  'document-versions',
  'scheduled-jobs',
  'webhook-deliveries',
  'email-deliveries',
  'database-backups',
  'user-roles',
  'user-identities',
  'audit-logs',
  'api-keys',
  'jobs',
  'auth',
  'migrations',
  'access',
])

const SYSTEM_FIELD_NAMES = new Set(['id', 'createdAt', 'updatedAt'])

const SLUG_PATTERN = /^[a-z][a-z0-9_-]*$/
const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Checks a config and returns every problem found. An empty array means it is valid. */
export function validateConfig(config: Config): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const add = (path: string, message: string, hint?: string) =>
    issues.push(hint ? { path, message, hint } : { path, message })

  if (typeof config !== 'object' || config === null) {
    add('config', 'must be an object', 'export default defineConfig({ ... })')
    return issues
  }

  validateSecret(config.secret, add)

  if (!config.db || typeof config.db.name !== 'string' || typeof config.db.init !== 'function') {
    add('db', 'is required', "pass a database adapter, e.g. db: sqlite({ url: 'file:./cms.db' })")
  }

  validateAdmin(config, add)
  validateAdminViews(config, add)
  validateUpload(config, add)
  validateBackups(config, add)
  validateAudit(config, add)
  validateAuth(config, add)
  validateCors(config.cors, add)
  validateLocalization(config, add)
  validateWebhooks(config, add)

  const collections = asArray(config.collections, 'collections', add)
  const globals = asArray(config.globals, 'globals', add)

  const collectionSlugs = new Set<string>([...BUILTIN_COLLECTIONS])
  const seenCollections = new Set<string>()
  collections.forEach((collection, i) => {
    const slug = checkSlug(collection, `collections[${i}]`, seenCollections, add)
    if (slug) collectionSlugs.add(slug)
  })

  const menu: unknown = config.admin?.menu
  if (menu !== undefined) {
    if (!Array.isArray(menu)) {
      add('admin.menu', 'must be an array of collection slugs', "e.g. menu: ['posts', 'media']")
    } else {
      for (const [i, slug] of menu.entries()) {
        if (typeof slug !== 'string' || !collectionSlugs.has(slug))
          add(`admin.menu[${i}]`, `unknown collection ${JSON.stringify(slug)}`)
      }
    }
  }

  const seenGlobals = new Set<string>()
  globals.forEach((global, i) => {
    checkSlug(global, `globals[${i}]`, seenGlobals, add)
  })

  validateEndpoints(config, collectionSlugs, add)
  validateCommands(config, add)
  const apiKeys: unknown = config.apiKeys
  if (apiKeys !== undefined && typeof apiKeys !== 'boolean') add('apiKeys', 'must be true or false')

  collections.forEach((collection, i) => {
    const path = `collections.${collection.slug ?? `[${i}]`}`
    validateContainer(collection, path, collectionSlugs, add, {
      collection: true,
      rbac: config.auth?.rbac === true,
    })
    validateUseAsTitle(collection, path, add)
    validateIcon(collection, path, add)
    const editIn: unknown = collection.editIn
    if (editIn !== undefined && editIn !== 'page' && editIn !== 'drawer')
      add(`${path}.editIn`, `must be "page" or "drawer" (got ${JSON.stringify(editIn)})`)
  })

  globals.forEach((global, i) => {
    const path = `globals.${global.slug ?? `[${i}]`}`
    validateContainer(global, path, collectionSlugs, add, {
      collection: false,
      rbac: config.auth?.rbac === true,
    })
    validateIcon(global, path, add)
  })

  const plugins: unknown = config.plugins
  if (
    plugins !== undefined &&
    (!Array.isArray(plugins) || plugins.some((p) => typeof p !== 'function'))
  ) {
    add('plugins', 'must be an array of functions', 'a plugin is (config) => config')
  }

  return issues
}

type Add = (path: string, message: string, hint?: string) => void

function validateSecret(secret: unknown, add: Add) {
  const hint = `set EASY_CMS_SECRET to a random string of at least ${MIN_SECRET_LENGTH} characters, e.g. \`openssl rand -hex 32\``
  if (typeof secret !== 'string' || secret.length === 0) {
    // Usually the variable is in .env but the production server does not read that file.
    add(
      'secret',
      'is required',
      `${hint}. In production, set it in the server's environment: not every server reads .env (Nuxt's does not)`,
    )
  } else if (secret.length < MIN_SECRET_LENGTH) {
    add('secret', `must be at least ${MIN_SECRET_LENGTH} characters (got ${secret.length})`, hint)
  }
}

function validateAdmin(config: Config, add: Add) {
  const admin = config.admin
  if (admin === undefined) return
  if (admin.path !== undefined && (typeof admin.path !== 'string' || !admin.path.startsWith('/'))) {
    add('admin.path', 'must start with "/"', "e.g. path: '/admin'")
  }
  if (admin.locale !== undefined && admin.locale !== 'en' && admin.locale !== 'th') {
    add('admin.locale', `must be "en" or "th" (got ${JSON.stringify(admin.locale)})`)
  }
  const siteUrl: unknown = admin.siteUrl
  if (
    siteUrl !== undefined &&
    (typeof siteUrl !== 'string' || !/^(\/|https?:\/\/)/.test(siteUrl))
  ) {
    add(
      'admin.siteUrl',
      'must be a path starting with "/" or an http(s) URL',
      "e.g. siteUrl: 'https://example.com'",
    )
  }
  const switcher: unknown = admin.switcher
  if (switcher !== undefined && switcher !== null) {
    const { cookie, options } = switcher as { cookie?: unknown; options?: unknown }
    if (typeof cookie !== 'string' || !/^[A-Za-z0-9_-]+$/.test(cookie))
      add('admin.switcher.cookie', 'must be a cookie name (letters, digits, - and _)')
    if (typeof options !== 'string' || !options.startsWith('/'))
      add('admin.switcher.options', 'must be a path under the API starting with "/"')
  }
  const modules: unknown = admin.modules
  if (modules !== undefined) {
    if (!Array.isArray(modules)) {
      add('admin.modules', 'must be an array', "e.g. modules: ['@easy-cms/plugin-seo/admin']")
    } else {
      for (const [i, module] of modules.entries()) {
        if (typeof module !== 'string' || module.trim() === '') {
          add(`admin.modules[${i}]`, 'must be a package export or a file path')
        } else if (/^[a-z][a-z0-9+.-]*:/i.test(module) || module.startsWith('//')) {
          add(
            `admin.modules[${i}]`,
            'must be a package export or a file path, not a URL',
            "admin modules are served from your server, e.g. '@easy-cms/plugin-seo/admin'",
          )
        }
      }
    }
  }
  const brand: unknown = admin.brand
  if (brand === undefined) return
  if (typeof brand !== 'object' || brand === null) {
    add('admin.brand', 'must be an object', "e.g. brand: { name: 'Acme', color: '#0f766e' }")
    return
  }
  const { name, logo, color } = brand as Record<string, unknown>
  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    add('admin.brand.name', 'must be a non-empty string')
  }
  if (
    logo !== undefined &&
    (typeof logo !== 'string' || !/^(\/|https?:\/\/|data:image\/)/.test(logo))
  ) {
    add(
      'admin.brand.logo',
      'must be a path starting with "/" or an http(s) URL',
      "e.g. logo: '/logo.svg'",
    )
  }
  if (color !== undefined && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) {
    add('admin.brand.color', `must be a hex color like "#0f766e" (got ${JSON.stringify(color)})`)
  }
}

const PAGE_PATH = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Pages (`admin.pages`) and dashboard widgets (`admin.dashboard`), e.g. from plugins. */
function validateAdminViews(config: Config, add: Add) {
  const access = (value: unknown, path: string) => {
    if (value !== undefined && typeof value !== 'function')
      add(
        `${path}.access`,
        'must be a function',
        'e.g. access: ({ user }) => user.role === "admin"',
      )
  }
  const pages: unknown = config.admin?.pages
  if (pages !== undefined) {
    if (!Array.isArray(pages)) {
      add(
        'admin.pages',
        'must be an array',
        "e.g. pages: [{ path: 'stats', label: 'Stats', component: 'ecms-stats' }]",
      )
    } else {
      const seen = new Set<string>()
      pages.forEach((page: unknown, i) => {
        const path = `admin.pages[${i}]`
        if (typeof page !== 'object' || page === null) {
          add(path, 'must be an object')
          return
        }
        const p = page as Record<string, unknown>
        if (typeof p.path !== 'string' || !PAGE_PATH.test(p.path)) {
          add(
            `${path}.path`,
            `must be lowercase letters, digits and "-" (got ${JSON.stringify(p.path)})`,
            "e.g. path: 'forms-overview'",
          )
        } else if (seen.has(p.path)) {
          add(`${path}.path`, `"${p.path}" is used by another page`)
        } else {
          seen.add(p.path)
        }
        validateComponent(p.component, `${path}.component`, add)
        const label = p.label
        if (
          !(typeof label === 'string' && label.trim() !== '') &&
          !(typeof label === 'object' && label !== null && !Array.isArray(label))
        )
          add(
            `${path}.label`,
            'must be a string or { en, th }',
            "e.g. label: { en: 'Stats', th: 'สถิติ' }",
          )
        validateIcon(p, path, add)
        if (
          p.group !== undefined &&
          p.group !== 'content' &&
          p.group !== 'settings' &&
          p.group !== false
        )
          add(`${path}.group`, 'must be "content", "settings" or false')
        access(p.access, path)
      })
    }
  }
  const widgets: unknown = config.admin?.dashboard
  if (widgets !== undefined) {
    if (!Array.isArray(widgets)) {
      add(
        'admin.dashboard',
        'must be an array',
        "e.g. dashboard: [{ component: 'ecms-stats-widget' }]",
      )
    } else {
      const tags = new Set<string>()
      widgets.forEach((widget: unknown, i) => {
        const path = `admin.dashboard[${i}]`
        if (typeof widget !== 'object' || widget === null) {
          add(path, 'must be an object')
          return
        }
        const w = widget as Record<string, unknown>
        validateComponent(w.component, `${path}.component`, add)
        if (w.width !== undefined && w.width !== 'half' && w.width !== 'full')
          add(`${path}.width`, 'must be "half" or "full"')
        if (
          w.label !== undefined &&
          !(typeof w.label === 'string' && w.label.trim() !== '') &&
          !(typeof w.label === 'object' && w.label !== null && !Array.isArray(w.label))
        )
          add(`${path}.label`, 'must be a string or { en, th }')
        // Settings → Roles gives panels to roles by their tag.
        const component = w.component as { tag?: unknown } | string | undefined
        const tag = typeof component === 'string' ? component : component?.tag
        if (config.auth?.rbac === true && typeof tag === 'string') {
          if (tags.has(tag))
            add(
              `${path}.component`,
              `another panel uses "${tag}"`,
              'with auth.rbac, roles are given panels by their tag: use one tag per panel',
            )
          tags.add(tag)
        }
        access(w.access, path)
      })
    }
  }
}

function validateIcon(container: { icon?: unknown }, path: string, add: Add) {
  const icon = container.icon
  if (icon === undefined || (ADMIN_ICONS as readonly unknown[]).includes(icon)) return
  add(`${path}.icon`, `unknown icon ${JSON.stringify(icon)}`, `one of: ${ADMIN_ICONS.join(', ')}`)
}

function validateAuth(config: Config, add: Add) {
  const auth = config.auth
  if (auth === undefined) return
  if (auth.rbac !== undefined && typeof auth.rbac !== 'boolean')
    add('auth.rbac', 'must be true or false')
  if (auth.password !== undefined && typeof auth.password !== 'boolean')
    add('auth.password', 'must be true or false')
  if (auth.setupCode !== undefined && typeof auth.setupCode !== 'string')
    add('auth.setupCode', 'must be a string')
  const providers: unknown = auth.providers
  if (providers !== undefined) {
    if (!Array.isArray(providers)) {
      add(
        'auth.providers',
        'must be an array',
        'e.g. providers: [google({ clientId, clientSecret })]',
      )
    } else {
      const ids = new Set<string>()
      providers.forEach((provider: unknown, i) => {
        const p = provider as Record<string, unknown> | null
        const path = `auth.providers[${i}]`
        if (
          typeof p !== 'object' ||
          p === null ||
          typeof p.authorizationURL !== 'function' ||
          typeof p.callback !== 'function'
        ) {
          add(
            path,
            'must be a provider',
            'e.g. google({ clientId, clientSecret }) from @easy-cms/auth-oauth',
          )
          return
        }
        if (typeof p.id !== 'string' || !PAGE_PATH.test(p.id))
          add(`${path}.id`, 'must be lowercase letters, digits and "-"')
        else if (ids.has(p.id))
          add(`${path}.id`, `"${p.id}" is used by another provider`, 'give one of them its own id')
        else ids.add(p.id)
        if (typeof p.name !== 'string' || p.name.trim() === '')
          add(`${path}.name`, 'must be a name')
      })
    }
  }
  const signUp = auth.allowSignUp as { domains?: unknown; role?: unknown } | undefined
  if (signUp !== undefined) {
    if (
      typeof signUp !== 'object' ||
      signUp === null ||
      !Array.isArray(signUp.domains) ||
      signUp.domains.some((d) => typeof d !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d))
    )
      add('auth.allowSignUp.domains', 'must be email domains', "e.g. domains: ['example.com']")
    if (signUp?.role === 'admin')
      add('auth.allowSignUp.role', 'can\'t be "admin"', 'make admins by hand, in Settings → Users')
    else if (
      signUp?.role !== undefined &&
      (typeof signUp.role !== 'string' ||
        (!auth.rbac && !(auth.roles ?? ['admin', 'editor']).includes(signUp.role)))
    )
      add('auth.allowSignUp.role', 'must be one of auth.roles')
    if (!Array.isArray(providers) || providers.length === 0)
      add('auth.allowSignUp', 'needs auth.providers')
  }
  if (auth.password === false && (!Array.isArray(providers) || providers.length === 0))
    add('auth.password', 'false needs auth.providers', 'otherwise only admins could sign in')
  if (auth.roles !== undefined) {
    const roles: unknown = auth.roles
    if (!Array.isArray(roles) || roles.some((r) => typeof r !== 'string' || r === '')) {
      add('auth.roles', 'must be an array of non-empty strings')
    } else if (!roles.includes('admin')) {
      add('auth.roles', 'must include "admin"', "e.g. roles: ['admin', 'editor']")
    }
  }
  for (const key of [
    'tokenExpiration',
    'maxLoginAttempts',
    'lockWindow',
    'resetPasswordExpiration',
    'inviteExpiration',
  ] as const) {
    const value = auth[key]
    if (value !== undefined && !(Number.isInteger(value) && value > 0)) {
      add(`auth.${key}`, 'must be a positive integer')
    }
  }
  if (auth.emails !== undefined) {
    const emails: unknown = auth.emails
    if (typeof emails !== 'object' || emails === null) add('auth.emails', 'must be an object')
    else
      for (const [name, fn] of Object.entries(emails)) {
        if (!['resetPassword', 'invite', 'passwordChanged'].includes(name))
          add(
            `auth.emails.${name}`,
            'unknown email',
            'use resetPassword, invite or passwordChanged',
          )
        else if (typeof fn !== 'function')
          add(
            `auth.emails.${name}`,
            'must be a function ({ user, url, locale }) => { subject, text }',
          )
      }
  }
  if (auth.trustedOrigins !== undefined) {
    for (const [i, origin] of auth.trustedOrigins.entries()) {
      if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin)) {
        add(
          `auth.trustedOrigins[${i}]`,
          `must be an origin like "https://example.com" (got ${JSON.stringify(origin)})`,
        )
      }
    }
  }
}

const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
const LOCALIZABLE = new Set([
  'text',
  'textarea',
  'email',
  'slug',
  'richText',
  'number',
  'boolean',
  'date',
  'json',
  'select',
  'upload',
  'relationship',
  'blocks',
  'array',
])

function validateLocalization(config: Config, add: Add) {
  const localization = config.localization
  if (localization !== undefined && localization !== null) {
    const locales = localization?.locales
    if (!Array.isArray(locales) || locales.length === 0) {
      add('localization.locales', 'must be a non-empty list of locales', "locales: ['th', 'en']")
    } else {
      const seen = new Set<string>()
      for (const [i, locale] of locales.entries()) {
        if (typeof locale !== 'string' || !LOCALE_PATTERN.test(locale)) {
          add(
            `localization.locales[${i}]`,
            `must be a locale code like "th" or "en-US" (got ${JSON.stringify(locale)})`,
          )
        } else if (seen.has(locale)) {
          add(`localization.locales[${i}]`, `duplicate locale "${locale}"`)
        }
        seen.add(locale)
      }
      const fallbackDefault = localization.defaultLocale
      if (fallbackDefault !== undefined && !locales.includes(fallbackDefault)) {
        add('localization.defaultLocale', `must be one of the locales (got "${fallbackDefault}")`)
      }
    }
  }

  const walk = (fields: readonly Field[] | undefined, path: string, insideLocalized = false) => {
    if (!Array.isArray(fields)) return
    for (const field of fields) {
      if (typeof field?.name !== 'string') continue
      const fieldPath = `${path}.${field.name}`
      if (field.localized) {
        if (!localization) {
          add(
            `${fieldPath}.localized`,
            'needs `localization` in the config',
            "localization: { locales: ['th', 'en'] }",
          )
        } else if (!LOCALIZABLE.has(field.type)) {
          add(
            `${fieldPath}.localized`,
            `${field.type} fields cannot be localized`,
            'localize the fields inside it instead',
          )
        } else if (insideLocalized) {
          add(
            `${fieldPath}.localized`,
            'is inside a localized field, which already holds one value per locale',
          )
        }
      }
      const inside = insideLocalized || field.localized === true
      if (field.type === 'group' || field.type === 'array')
        walk(field.fields, `${fieldPath}.fields`, inside)
      if (field.type === 'blocks')
        for (const block of field.blocks ?? [])
          walk(block?.fields, `${fieldPath}.blocks.${block?.slug}`, inside)
    }
  }
  for (const [i, c] of (config.collections ?? []).entries())
    walk(c?.fields, `collections[${i}].fields`)
  for (const [i, g] of (config.globals ?? []).entries()) walk(g?.fields, `globals[${i}].fields`)
}

function validateWebhooks(config: Config, add: Add) {
  const email: unknown = config.email
  if (
    email !== undefined &&
    (typeof email !== 'object' ||
      email === null ||
      typeof (email as { send?: unknown }).send !== 'function')
  )
    add(
      'email',
      'must be an email adapter with a send() function',
      'e.g. email: consoleEmail() or smtp({ … }) from @easy-cms/email-smtp',
    )
  const hooks = config.webhooks
  if (hooks === undefined) return
  if (!Array.isArray(hooks)) {
    add('webhooks', 'must be a list', "webhooks: [{ url: 'https://example.com/hook' }]")
    return
  }
  const collections = new Set([
    ...BUILTIN_COLLECTIONS,
    ...(config.collections ?? []).map((c) => c?.slug),
  ])
  const globals = new Set((config.globals ?? []).map((g) => g?.slug))
  for (const [i, hook] of hooks.entries()) {
    const path = `webhooks[${i}]`
    if (typeof hook?.url !== 'string' || !/^https?:\/\/\S+$/.test(hook.url)) {
      add(`${path}.url`, 'must be an http(s) URL')
    }
    for (const event of hook?.events ?? []) {
      if (!(WEBHOOK_EVENTS as readonly string[]).includes(event))
        add(`${path}.events`, `unknown event "${event}"`, `use: ${WEBHOOK_EVENTS.join(', ')}`)
    }
    for (const slug of hook?.collections ?? [])
      if (!collections.has(slug)) add(`${path}.collections`, `unknown collection "${slug}"`)
    for (const slug of hook?.globals ?? [])
      if (!globals.has(slug)) add(`${path}.globals`, `unknown global "${slug}"`)
  }
}

function validateCors(cors: unknown, add: Add) {
  if (cors === undefined || cors === '*') return
  if (!Array.isArray(cors)) {
    add('cors', 'must be a list of origins or "*"', 'cors: ["https://my-site.com"]')
    return
  }
  for (const [i, origin] of cors.entries()) {
    if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin)) {
      add(
        `cors[${i}]`,
        `must be an origin like "https://example.com" (got ${JSON.stringify(origin)})`,
      )
    }
  }
}

function validateUpload(config: Config, add: Add) {
  const upload = config.upload
  // Upload fields put in a folder need folders.
  if (upload?.folders !== true) {
    const walk = (fields: readonly Field[], path: string) => {
      for (const [i, field] of fields.entries()) {
        const at = `${path}.fields[${i}]`
        if (field.type === 'upload' && field.folder !== undefined)
          add(`${at}.folder`, 'needs upload.folders: true', 'upload: { folders: true }')
        if ((field.type === 'group' || field.type === 'array') && Array.isArray(field.fields))
          walk(field.fields, at)
        if (field.type === 'blocks' && Array.isArray(field.blocks))
          for (const [b, block] of field.blocks.entries())
            if (Array.isArray(block?.fields)) walk(block.fields, `${at}.blocks[${b}]`)
      }
    }
    for (const [i, c] of (config.collections ?? []).entries())
      if (Array.isArray(c?.fields)) walk(c.fields, `collections[${i}]`)
    for (const [i, g] of (config.globals ?? []).entries())
      if (Array.isArray(g?.fields)) walk(g.fields, `globals[${i}]`)
  }
  if (upload === undefined) return
  if (
    upload.maxFileSize !== undefined &&
    !(Number.isInteger(upload.maxFileSize) && upload.maxFileSize > 0)
  ) {
    add('upload.maxFileSize', 'must be a positive integer (bytes)')
  }
  if (upload.dir !== undefined && (typeof upload.dir !== 'string' || upload.dir.length === 0)) {
    add('upload.dir', 'must be a non-empty string')
  }
  const mimeTypes: unknown = upload.mimeTypes
  if (
    mimeTypes !== undefined &&
    (!Array.isArray(mimeTypes) ||
      mimeTypes.length === 0 ||
      !mimeTypes.every((t) => typeof t === 'string' && MIME_PATTERN.test(t)))
  )
    add(
      'upload.mimeTypes',
      'must be a list of MIME types or groups (documents, office, archives)',
      "e.g. mimeTypes: ['image/*', 'documents']",
    )
  if (upload.folders !== undefined && typeof upload.folders !== 'boolean')
    add('upload.folders', 'must be true or false')
  const privateStorage: unknown = upload.privateStorage
  if (
    privateStorage !== undefined &&
    (typeof privateStorage !== 'object' ||
      privateStorage === null ||
      typeof (privateStorage as { get?: unknown }).get !== 'function')
  )
    add('upload.privateStorage', 'must be a storage adapter', 'e.g. s3Storage({ … })')
  const fromURL: unknown = upload.fromURL
  if (fromURL === undefined) return
  if (typeof fromURL !== 'object' || fromURL === null) {
    add('upload.fromURL', 'must be an object', "e.g. fromURL: { allowedHosts: ['*'] }")
    return
  }
  const { allowedHosts, allowPrivate } = fromURL as Record<string, unknown>
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) {
    add(
      'upload.fromURL.allowedHosts',
      'must be a non-empty array of host names',
      "e.g. allowedHosts: ['images.example.com', '*.cdn.example.com'] or ['*'] for any public host",
    )
  } else {
    allowedHosts.forEach((host: unknown, i) => {
      if (typeof host !== 'string' || !HOST_PATTERN.test(host))
        add(
          `upload.fromURL.allowedHosts[${i}]`,
          `must be a host name like "images.example.com", "*.example.com" or "*" (got ${JSON.stringify(host)})`,
        )
    })
  }
  if (allowPrivate !== undefined && typeof allowPrivate !== 'boolean')
    add('upload.fromURL.allowPrivate', 'must be true or false')
}

/** `*`, `host.name` or `*.host.name`: no scheme, port or path. */
/** A media folder's key (`upload` fields' `folder`). */
const FOLDER_KEY = /^[a-z0-9][a-z0-9_-]{0,59}$/

/** A MIME type, `type/*`, or a group of types (`documents`, `office`, `archives`). */
const MIME_PATTERN = /^([\w.+-]+\/(\*|[\w.+-]+)|documents|office|archives)$/i

const HOST_PATTERN =
  /^(\*|(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)$/i

/** `audit`: true, or its settings. */
function validateAudit(config: Config, add: Add) {
  const audit: unknown = config.audit
  if (audit !== undefined && typeof audit !== 'boolean') {
    const a = audit as Record<string, unknown> | null
    if (typeof a !== 'object' || a === null)
      add('audit', 'must be true or { keep, values, failedLogins }')
    else {
      if (a.keep !== undefined && !(Number.isInteger(a.keep) && (a.keep as number) >= 0))
        add('audit.keep', 'must be a number of days (0: keep all)')
      if (a.values !== undefined && typeof a.values !== 'boolean')
        add('audit.values', 'must be true or false')
      if (
        a.failedLogins !== undefined &&
        !(Number.isInteger(a.failedLogins) && (a.failedLogins as number) > 0)
      )
        add('audit.failedLogins', 'must be a positive number')
    }
  }
}

function validateBackups(config: Config, add: Add) {
  const backups: unknown = config.backups
  if (backups === undefined) return
  if (typeof backups !== 'object' || backups === null) {
    add('backups', 'must be an object', "e.g. backups: { every: 'day', keep: 7 }")
    return
  }
  const { every, at, keep, dir, storage, sqlite } = backups as Record<string, unknown>
  if (every !== undefined && every !== 'day' && every !== 'week')
    add('backups.every', 'must be "day" or "week"')
  if (at !== undefined && (typeof at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(at)))
    add('backups.at', 'must be a time like "03:00"')
  if (keep !== undefined && !(Number.isInteger(keep) && (keep as number) >= 1))
    add('backups.keep', 'must be a whole number, 1 or more')
  if (dir !== undefined && (typeof dir !== 'string' || dir.trim() === ''))
    add('backups.dir', 'must be a folder name')
  if (
    typeof dir === 'string' &&
    dir.replace(/^\.\//, '').replace(/\/+$/, '') ===
      (config.upload?.dir ?? 'uploads').replace(/^\.\//, '').replace(/\/+$/, '')
  )
    add('backups.dir', 'must not be the uploads folder: uploads are served publicly')
  if (
    storage !== undefined &&
    (typeof storage !== 'object' ||
      storage === null ||
      typeof (storage as { put?: unknown }).put !== 'function')
  )
    add('backups.storage', 'must be a storage adapter, e.g. s3Storage()')
  if (sqlite !== undefined && typeof sqlite !== 'function')
    add(
      'backups.sqlite',
      "must be the sqlite adapter, e.g. import { sqlite } from '@easy-cms/db-sqlite'",
    )
}

function asArray<T>(value: readonly T[] | undefined, path: string, add: Add): readonly T[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    add(path, 'must be an array')
    return []
  }
  return value
}

function checkSlug(
  container: CollectionConfig | GlobalConfig,
  path: string,
  seen: Set<string>,
  add: Add,
): string | undefined {
  const slug: unknown = container.slug
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    add(
      `${path}.slug`,
      `must be lowercase letters, digits, "-" or "_", starting with a letter (got ${JSON.stringify(slug)})`,
    )
    return undefined
  }
  if (RESERVED_SLUGS.has(slug)) {
    add(`${path}.slug`, `"${slug}" is reserved by Easy CMS`, 'choose another slug')
    return undefined
  }
  if (seen.has(slug)) {
    add(`${path}.slug`, `duplicate slug "${slug}"`)
    return undefined
  }
  seen.add(slug)
  return slug
}

function validateContainer(
  container: CollectionConfig | GlobalConfig,
  path: string,
  collectionSlugs: ReadonlySet<string>,
  add: Add,
  { collection, rbac }: { collection: boolean; rbac: boolean },
) {
  if (!Array.isArray(container.fields)) {
    add(`${path}.fields`, 'must be an array')
    return
  }
  const versions = container.versions
  if (versions !== undefined && typeof versions !== 'boolean') {
    const max = typeof versions === 'object' && versions !== null ? versions.max : undefined
    if (typeof versions !== 'object' || versions === null) {
      add(`${path}.versions`, 'must be true, false or { max }')
    } else if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
      add(`${path}.versions.max`, 'must be a positive integer')
    }
  }
  if (container.schedule && !container.drafts) {
    add(`${path}.schedule`, 'needs `drafts: true`', 'scheduling publishes and unpublishes drafts')
  }
  if (container.preview !== undefined && typeof container.preview !== 'function') {
    add(
      `${path}.preview`,
      'must be a function ({ doc }) => url',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: an example shown to the user
      'preview: ({ doc }) => `/posts/${doc.slug}`',
    )
  }
  const admin: unknown = container.admin
  if (admin !== undefined) {
    if (typeof admin !== 'object' || admin === null) {
      add(`${path}.admin`, 'must be an object', "e.g. admin: { sidebar: ['ecms-my-panel'] }")
    } else {
      const sidebar: unknown = (admin as { sidebar?: unknown }).sidebar
      if (sidebar !== undefined) validateComponents(sidebar, `${path}.admin.sidebar`, add)
      const group: unknown = (admin as { group?: unknown }).group
      if (group !== undefined && group !== 'settings')
        add(`${path}.admin.group`, `must be 'settings' (got ${JSON.stringify(group)})`)
      const list: unknown = (admin as { list?: unknown }).list
      if (list !== undefined) validateList(list, container, `${path}.admin.list`, add)
      const owner: unknown = (admin as { ownerField?: unknown }).ownerField
      if (owner !== undefined) {
        const field = container.fields.find((f) => f.name === owner)
        if (
          !collection ||
          container.slug === 'users' ||
          field?.type !== 'relationship' ||
          field.to !== 'users' ||
          field.hasMany
        )
          add(
            `${path}.admin.ownerField`,
            'must name a relationship field to "users" (not hasMany) of a collection',
            "e.g. { name: 'author', type: 'relationship', to: 'users' }",
          )
      }
    }
  }
  // With roles from the admin, `createdBy` is Easy CMS's.
  const createdBy = container.fields.find((f) => f.name === CREATED_BY_FIELD.name)
  if (rbac && createdBy && createdBy !== CREATED_BY_FIELD)
    add(
      `${path}.fields.createdBy`,
      '"createdBy" is added by Easy CMS with auth.rbac',
      'rename the field; to use it as the owner, set admin.ownerField',
    )
  const reserved = new Set(SYSTEM_FIELD_NAMES)
  if (container.drafts) reserved.add('status')
  validateFields(container.fields, `${path}.fields`, reserved, collectionSlugs, add)
}

function validateFields(
  fields: readonly Field[],
  path: string,
  reserved: ReadonlySet<string>,
  collectionSlugs: ReadonlySet<string>,
  add: Add,
) {
  const names = new Set<string>()
  const byName = new Map<string, Field>()

  fields.forEach((field, i) => {
    const name: unknown = field?.name
    if (typeof name !== 'string' || !FIELD_NAME_PATTERN.test(name)) {
      add(`${path}[${i}].name`, `must be a valid identifier (got ${JSON.stringify(name)})`)
      return
    }
    if (reserved.has(name)) {
      add(`${path}.${name}`, `"${name}" is reserved`, 'Easy CMS adds this field automatically')
    }
    if (names.has(name)) add(`${path}.${name}`, `duplicate field name "${name}"`)
    names.add(name)
    byName.set(name, field)
  })

  for (const field of fields) {
    if (typeof field?.name !== 'string') continue
    const fieldPath = `${path}.${field.name}`
    const type: unknown = field.type
    if (!(FIELD_TYPES as readonly unknown[]).includes(type)) {
      add(
        `${fieldPath}.type`,
        `unknown field type ${JSON.stringify(type)}`,
        `use one of: ${FIELD_TYPES.join(', ')}`,
      )
      continue
    }
    validateField(field, fieldPath, byName, collectionSlugs, add)
  }
}

function validateList(
  list: unknown,
  container: CollectionConfig | GlobalConfig,
  path: string,
  add: Add,
) {
  if (typeof list !== 'object' || list === null) {
    add(path, 'must be an object', "e.g. list: { tree: 'parent' }")
    return
  }
  const { tree, sort } = list as { tree?: unknown; sort?: unknown }
  if (sort !== undefined && (typeof sort !== 'string' || !sort.replace(/^-/, '')))
    add(`${path}.sort`, 'must be a field name, with - for descending', "e.g. sort: 'title'")
  if (tree === undefined) return
  const field = container.fields.find((f) => f.name === tree)
  if (
    field?.type !== 'relationship' ||
    field.to !== container.slug ||
    field.hasMany ||
    field.localized
  ) {
    add(
      `${path}.tree`,
      `must name a relationship field to "${container.slug}" (not hasMany or localized)`,
      `e.g. { name: 'parent', type: 'relationship', to: '${container.slug}' }`,
    )
  }
}

/** `minRows` / `maxRows` of a relationship or upload: only with `hasMany`. */
function validateManyRange(
  field: { hasMany?: boolean; minRows?: number; maxRows?: number },
  path: string,
  add: Add,
) {
  if ((field.minRows !== undefined || field.maxRows !== undefined) && !field.hasMany) {
    add(path, 'minRows and maxRows need hasMany: true')
    return
  }
  checkRange(field.minRows, field.maxRows, 'minRows', 'maxRows', path, add)
}

function validateField(
  field: Field,
  path: string,
  siblings: ReadonlyMap<string, Field>,
  collectionSlugs: ReadonlySet<string>,
  add: Add,
) {
  const position: unknown = field.position
  if (position !== undefined && position !== 'sidebar') {
    add(`${path}.position`, `must be "sidebar" (got ${JSON.stringify(position)})`)
  }
  const admin: unknown = field.admin
  if (admin !== undefined) {
    if (typeof admin !== 'object' || admin === null) {
      add(`${path}.admin`, 'must be an object', "e.g. admin: { component: 'ecms-color-picker' }")
    } else {
      const { component, after, cell } = admin as {
        component?: unknown
        after?: unknown
        cell?: unknown
      }
      if (component !== undefined) validateComponent(component, `${path}.admin.component`, add)
      if (after !== undefined) validateComponents(after, `${path}.admin.after`, add)
      if (cell !== undefined) validateComponent(cell, `${path}.admin.cell`, add)
    }
  }
  if (field.uniqueWithin !== undefined) {
    const scope = siblings.get(field.uniqueWithin)
    if (!field.unique && field.type !== 'slug') {
      add(`${path}.uniqueWithin`, 'needs `unique: true` (or a slug field)')
    } else if (!scope || scope === field) {
      add(`${path}.uniqueWithin`, `no sibling field named "${field.uniqueWithin}"`)
    } else if (
      !['relationship', 'select', 'text', 'number'].includes(scope.type) ||
      ('hasMany' in scope && scope.hasMany) ||
      scope.localized
    ) {
      add(
        `${path}.uniqueWithin`,
        `"${field.uniqueWithin}" must be a single, unlocalized relationship, select, text or number field`,
      )
    }
  }
  switch (field.type) {
    case 'text':
    case 'textarea':
      checkRange(field.minLength, field.maxLength, 'minLength', 'maxLength', path, add)
      break
    case 'number':
      checkRange(field.min, field.max, 'min', 'max', path, add)
      break
    case 'select':
      validateSelect(field.options, field.defaultValue, field.hasMany, path, add)
      break
    case 'slug':
      if (field.from !== undefined) {
        const source = siblings.get(field.from)
        if (!source) {
          add(`${path}.from`, `no sibling field named "${field.from}"`)
        } else if (source.type !== 'text') {
          add(`${path}.from`, `"${field.from}" must be a text field (got ${source.type})`)
        }
      }
      break
    case 'relationship':
      if (typeof field.to !== 'string' || !collectionSlugs.has(field.to)) {
        add(
          `${path}.to`,
          `unknown collection ${JSON.stringify(field.to)}`,
          `use one of: ${[...collectionSlugs].join(', ')}`,
        )
      }
      validateManyRange(field, path, add)
      break
    case 'upload':
      validateManyRange(field, path, add)
      if (field.folder !== undefined && !FOLDER_KEY.test(String(field.folder)))
        add(
          `${path}.folder`,
          'must be a folder key: lowercase letters, digits, "-" or "_"',
          "e.g. folder: 'banners'",
        )
      if (field.folderOnly !== undefined && field.folder === undefined)
        add(`${path}.folderOnly`, 'needs folder')
      if (field.mimeTypes !== undefined) {
        const types: unknown = field.mimeTypes
        if (
          !Array.isArray(types) ||
          types.length === 0 ||
          !types.every((t) => typeof t === 'string' && MIME_PATTERN.test(t))
        ) {
          add(
            `${path}.mimeTypes`,
            'must be a list of MIME types or groups (documents, office, archives)',
            "e.g. mimeTypes: ['image/*', 'documents']",
          )
        }
      }
      break
    case 'array':
    case 'group':
      if (!Array.isArray(field.fields) || field.fields.length === 0) {
        add(`${path}.fields`, 'must contain at least one field')
        break
      }
      if (field.type === 'array')
        checkRange(field.minRows, field.maxRows, 'minRows', 'maxRows', path, add)
      validateFields(field.fields, `${path}.fields`, new Set(['id']), collectionSlugs, add)
      break
    case 'blocks': {
      if (!Array.isArray(field.blocks) || field.blocks.length === 0) {
        add(
          `${path}.blocks`,
          'must contain at least one block',
          "blocks: [{ slug: 'hero', fields: [...] }]",
        )
        break
      }
      checkRange(field.minRows, field.maxRows, 'minRows', 'maxRows', path, add)
      const seen = new Set<string>()
      for (const [i, block] of field.blocks.entries()) {
        const blockPath = `${path}.blocks[${i}]`
        if (typeof block?.slug !== 'string' || !SLUG_PATTERN.test(block.slug)) {
          add(
            `${blockPath}.slug`,
            'must be lowercase letters, digits, "-" or "_", starting with a letter',
          )
        } else if (seen.has(block.slug)) {
          add(`${blockPath}.slug`, `duplicate block "${block.slug}"`)
        } else {
          seen.add(block.slug)
        }
        if (!Array.isArray(block?.fields)) {
          add(`${blockPath}.fields`, 'must be an array')
          continue
        }
        validateFields(
          block.fields,
          `${blockPath}.fields`,
          new Set(['id', 'blockType']),
          collectionSlugs,
          add,
        )
      }
      break
    }
  }
}

/** Custom element names from admin modules: `ecms-` plus lowercase letters, digits and `-`. */
export const ADMIN_COMPONENT_TAG = /^ecms-[a-z0-9]+(-[a-z0-9]+)*$/

function validateComponent(component: unknown, path: string, add: Add) {
  const tag =
    typeof component === 'object' && component !== null
      ? (component as { tag?: unknown }).tag
      : component
  if (typeof tag !== 'string' || !ADMIN_COMPONENT_TAG.test(tag)) {
    add(
      path,
      `must be a custom element name starting with "ecms-" (got ${JSON.stringify(tag)})`,
      "e.g. 'ecms-color-picker' or { tag: 'ecms-color-picker', props: { palette: 'brand' } }",
    )
    return
  }
  if (typeof component === 'object' && component !== null) {
    const props: unknown = (component as { props?: unknown }).props
    if (
      props !== undefined &&
      (typeof props !== 'object' || props === null || Array.isArray(props))
    )
      add(`${path}.props`, 'must be an object of plain JSON values')
  }
}

function validateComponents(components: unknown, path: string, add: Add) {
  if (!Array.isArray(components)) {
    add(path, 'must be an array of components', "e.g. ['ecms-seo-preview']")
    return
  }
  for (const [i, component] of components.entries()) {
    validateComponent(component, `${path}[${i}]`, add)
  }
}

const ENDPOINT_METHODS = ['get', 'post', 'put', 'patch', 'delete']
const ENDPOINT_SEGMENT = /^(:[A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9._~-]+)$/
/** First path segments the built-in REST API uses besides collection slugs. */
const RESERVED_ENDPOINT_ROOTS = new Set([
  'users',
  'globals',
  'admin',
  'jobs',
  'media',
  'api-keys',
  'auth',
])

function validateCommands(config: Config, add: Add) {
  const commands: unknown = config.commands
  if (commands === undefined) return
  if (!Array.isArray(commands)) {
    add('commands', 'must be an array', "e.g. commands: [{ name: 'my:task', description, run }]")
    return
  }
  const seen = new Set<string>()
  commands.forEach((command: unknown, i) => {
    const path = `commands[${i}]`
    const { name, description, run } = (command ?? {}) as Record<string, unknown>
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*(:[a-z0-9-]+)*$/.test(name))
      add(`${path}.name`, 'must be lowercase letters, digits, - and :', "e.g. 'nested:rebuild'")
    else if (seen.has(name)) add(`${path}.name`, `"${name}" is already used by another command`)
    else seen.add(name)
    if (typeof description !== 'string') add(`${path}.description`, 'must be a string')
    if (typeof run !== 'function') add(`${path}.run`, 'must be a function')
  })
}

function validateEndpoints(config: Config, collectionSlugs: ReadonlySet<string>, add: Add) {
  const endpoints: unknown = config.endpoints
  if (endpoints === undefined) return
  if (!Array.isArray(endpoints)) {
    add(
      'endpoints',
      'must be an array',
      "e.g. endpoints: [{ path: '/hello', method: 'get', handler }]",
    )
    return
  }
  const seen = new Set<string>()
  endpoints.forEach((endpoint: unknown, i) => {
    const path = `endpoints[${i}]`
    if (typeof endpoint !== 'object' || endpoint === null) {
      add(path, 'must be an object { path, method, handler }')
      return
    }
    const { path: route, method, handler, root } = endpoint as Record<string, unknown>
    if (root !== undefined && typeof root !== 'boolean')
      add(`${path}.root`, 'must be true or false')
    const segments = typeof route === 'string' ? route.split('/').slice(1) : []
    if (
      typeof route !== 'string' ||
      !route.startsWith('/') ||
      segments.length === 0 ||
      !segments.every((s) => ENDPOINT_SEGMENT.test(s))
    ) {
      add(`${path}.path`, `must be a path like "/seo/generate" (got ${JSON.stringify(route)})`)
    } else {
      const first = segments[0] as string
      if (first.startsWith(':')) {
        add(`${path}.path`, 'must start with a fixed segment, not a parameter')
      } else if (root === true) {
        const taken = [
          config.routes?.api ?? '/api/cms',
          `/${(config.admin?.path ?? '/admin').replace(/^\/+|\/+$/g, '')}`,
          '/healthz',
        ]
          .map((p) => p.replace(/\/+$/, ''))
          .find((p) => route === p || route.startsWith(`${p}/`) || p.startsWith(`${route}/`))
        if (taken)
          add(
            `${path}.path`,
            `"${route}" is served by ${taken === '/healthz' ? 'the standalone server' : `"${taken}"`}`,
          )
      } else if (RESERVED_ENDPOINT_ROOTS.has(first) || collectionSlugs.has(first)) {
        add(
          `${path}.path`,
          `"/${first}" is used by the built-in API`,
          'start the path with your plugin or feature name, e.g. "/seo/generate"',
        )
      }
    }
    const verb = typeof method === 'string' ? method.toLowerCase() : method
    if (typeof verb !== 'string' || !ENDPOINT_METHODS.includes(verb)) {
      add(
        `${path}.method`,
        `must be one of ${ENDPOINT_METHODS.join(', ')} (got ${JSON.stringify(method)})`,
      )
    }
    if (typeof handler !== 'function') add(`${path}.handler`, 'must be a function')
    if (typeof route === 'string' && typeof verb === 'string') {
      // Parameters match anything, so "/a/:x" and "/a/:y" are the same route.
      const key = `${root === true ? 'root ' : ''}${verb} ${route.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':')}`
      if (seen.has(key)) add(`${path}.path`, `duplicate endpoint ${verb.toUpperCase()} ${route}`)
      seen.add(key)
    }
  })
}

function checkRange(
  min: number | undefined,
  max: number | undefined,
  minName: string,
  maxName: string,
  path: string,
  add: Add,
) {
  if (min !== undefined && max !== undefined && min > max) {
    add(path, `${minName} (${min}) is greater than ${maxName} (${max})`)
  }
}

function validateSelect(
  options: readonly SelectOption[] | undefined,
  defaultValue: string | readonly string[] | undefined,
  hasMany: boolean | undefined,
  path: string,
  add: Add,
) {
  if (!Array.isArray(options) || options.length === 0) {
    add(`${path}.options`, 'must contain at least one option')
    return
  }
  const values = options.map((o) => (typeof o === 'string' ? o : o.value))
  const duplicates = values.filter((v, i) => values.indexOf(v) !== i)
  if (duplicates.length > 0) {
    add(`${path}.options`, `duplicate option values: ${[...new Set(duplicates)].join(', ')}`)
  }
  if (defaultValue === undefined) return
  const defaults = typeof defaultValue === 'string' ? [defaultValue] : defaultValue
  if (typeof defaultValue !== 'string' && !hasMany) {
    add(`${path}.defaultValue`, 'must be a single value unless hasMany is true')
  }
  for (const value of defaults) {
    if (!values.includes(value)) {
      add(`${path}.defaultValue`, `"${value}" is not one of the options`)
    }
  }
}

function validateUseAsTitle(collection: CollectionConfig, path: string, add: Add) {
  if (collection.useAsTitle === undefined || !Array.isArray(collection.fields)) return
  const field = collection.fields.find((f) => f.name === collection.useAsTitle)
  if (!field) {
    add(`${path}.useAsTitle`, `no top-level field named "${collection.useAsTitle}"`)
  } else if (!['text', 'textarea', 'email', 'slug', 'number', 'date'].includes(field.type)) {
    add(
      `${path}.useAsTitle`,
      `"${field.name}" is a ${field.type} field and cannot be shown as a title`,
    )
  }
}
