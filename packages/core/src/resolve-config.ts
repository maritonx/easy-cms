import { CORE_AI_FEATURES } from './ai.js'
import { apiKeysCollection } from './api-keys.js'
import { type AuditConfig, DEFAULT_AUDIT_KEEP, DEFAULT_FAILED_LOGINS } from './audit.js'
import {
  aiUsageCollection,
  auditLogsCollection,
  bulkOperationsCollection,
  connectionsCollection,
  DEFAULT_ROLES,
  databaseBackupsCollection,
  emailDeliveriesCollection,
  internalCollections,
  jobRunsCollection,
  outboxCollection,
  rateLimitsCollection,
  savedViewsCollection,
  scheduledJobsCollection,
  userIdentitiesCollection,
  versionsCollection,
  webhookDeliveriesCollection,
  withCreatedBy,
  withMedia,
  withUsers,
} from './builtins.js'
import { type Config, PLUGIN_API_VERSION, type ResolvedConfig } from './config.js'
import { ConfigError } from './errors.js'
import { applyFieldTypes, fieldTypeModules } from './field-types.js'
import type { Field } from './fields.js'
import { rolesCollection } from './roles.js'
import { validateConfig } from './validate-config.js'
import { SYSTEM_EVENTS } from './webhooks.js'

export const DEFAULT_ADMIN_PATH = '/admin'
export const DEFAULT_API_PATH = '/api/cms'
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024
export const DEFAULT_TOKEN_EXPIRATION = 7 * 24 * 60 * 60

const resolved = new WeakSet<object>()

/**
 * Runs the config's plugins in order, without validating the result. Build tools use it to
 * read what plugins add (e.g. `admin.modules`) when the config is not complete yet.
 */
export async function applyPlugins(input: Config): Promise<Config> {
  let config = input
  const plugins = Array.isArray(config?.plugins) ? config.plugins : []
  for (const [i, plugin] of plugins.entries()) {
    if (typeof plugin !== 'function') break // reported by validateConfig
    const wanted = plugin.info?.apiVersion
    if (wanted !== undefined && wanted !== PLUGIN_API_VERSION)
      throw new ConfigError([
        {
          path: `plugins[${i}]`,
          message: `${plugin.info?.name ?? 'this plugin'} is written for plugin API ${wanted}; this Easy CMS has ${PLUGIN_API_VERSION}`,
          hint:
            wanted > PLUGIN_API_VERSION
              ? 'upgrade Easy CMS (every @easy-cms/* package)'
              : 'upgrade the plugin to a version for this Easy CMS',
        },
      ])
    config = await plugin(config)
  }
  // The admin modules of field types (their inputs and list cells), after the plugins' own.
  const modules = fieldTypeModules(config)
  if (modules.length > 0)
    config = {
      ...config,
      admin: {
        ...config.admin,
        modules: [...new Set([...(config.admin?.modules ?? []), ...modules])],
      },
    }
  return config
}

/**
 * Runs plugins in order, adds the built-in collections, validates the result
 * and fills in defaults. Throws `ConfigError`. Resolving twice is a no-op.
 */
export async function resolveConfig(input: Config | ResolvedConfig): Promise<ResolvedConfig> {
  if (resolved.has(input)) return input as ResolvedConfig

  let config = await applyPlugins(input as Config)
  if (typeof config === 'object' && config !== null && Array.isArray(config.collections ?? [])) {
    config = withCreatedBy(withMedia(withUsers(config)))
  }

  // Fields of added types become fields of their base types.
  const applied = applyFieldTypes(config)
  config = applied.config
  const all = [...applied.issues, ...validateConfig(config)]
  const issues = all.filter((issue) => issue.severity !== 'warning')
  if (issues.length > 0) throw new ConfigError(issues)
  const warnings = all.filter((issue) => issue.severity === 'warning')

  const { plugins, ...rest } = config
  const result: ResolvedConfig = {
    ...rest,
    cors: config.cors ?? [],
    localization: config.localization
      ? {
          locales: config.localization.locales,
          defaultLocale: config.localization.defaultLocale ?? config.localization.locales[0] ?? '',
          fallback: config.localization.fallback ?? true,
        }
      : null,
    routes: { api: `/${(config.routes?.api ?? DEFAULT_API_PATH).replace(/^\/+|\/+$/g, '')}` },
    admin: {
      path: config.admin?.path ?? DEFAULT_ADMIN_PATH,
      locale: config.admin?.locale ?? 'en',
      brand: config.admin?.brand ?? {},
      siteURL: config.admin?.siteURL ?? '',
      modules: config.admin?.modules ?? [],
      pages: config.admin?.pages ?? [],
      dashboard: config.admin?.dashboard ?? [],
      switcher: config.admin?.switcher ?? false,
      nav: config.admin?.nav ?? [],
      commands: config.admin?.commands ?? [],
    },
    upload: {
      dir: config.upload?.dir ?? 'uploads',
      maxFileSize: config.upload?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      mimeTypes: config.upload?.mimeTypes ?? ['image/*', 'application/pdf'],
      imageSizes: config.upload?.imageSizes ?? [],
      folders: config.upload?.folders === true,
      ...(config.upload?.storage ? { storage: config.upload.storage } : {}),
      ...(config.upload?.fromURL ? { fromURL: config.upload.fromURL } : {}),
      ...(config.upload?.privateStorage ? { privateStorage: config.upload.privateStorage } : {}),
    },
    auth: {
      roles: config.auth?.roles ?? DEFAULT_ROLES,
      rbac: config.auth?.rbac === true,
      providers: config.auth?.providers ?? [],
      providerSignUp: config.auth?.providerSignUp ?? { domains: [] },
      password:
        typeof config.auth?.password === 'object'
          ? { breakGlass: config.auth.password.breakGlass.map((email) => email.toLowerCase()) }
          : config.auth?.password !== false,
      setupCode: config.auth?.setupCode ?? process.env.EASY_CMS_SETUP_CODE ?? '',
      tokenExpiration: config.auth?.tokenExpiration ?? DEFAULT_TOKEN_EXPIRATION,
      maxLoginAttempts: config.auth?.maxLoginAttempts ?? 5,
      lockWindow: config.auth?.lockWindow ?? 15 * 60,
      trustedOrigins: config.auth?.trustedOrigins ?? [],
      resetPasswordExpiration: config.auth?.resetPasswordExpiration ?? 60 * 60,
      inviteExpiration: config.auth?.inviteExpiration ?? 7 * 24 * 60 * 60,
      emails: config.auth?.emails ?? {},
      members: config.auth?.members ?? { roles: [] },
    },
    audit: config.audit ? resolveAudit(config.audit === true ? {} : config.audit) : false,
    collections: [
      ...(config.collections ?? []),
      ...internalCollections,
      // Roles keep their history as versions.
      ...(usesVersions(config) || config.auth?.rbac ? [versionsCollection] : []),
      ...(usesSchedule(config) ? [scheduledJobsCollection] : []),
      ...((config.webhooks?.length ?? 0) > 0 ? [webhookDeliveriesCollection] : []),
      ...(config.apiKeys ? [apiKeysCollection] : []),
      ...(config.email ? [emailDeliveriesCollection] : []),
      ...((config.jobs?.length ?? 0) > 0 ? [jobRunsCollection] : []),
      ...(config.outbox ? [outboxCollection] : []),
      ...(config.rateLimit ? [rateLimitsCollection] : []),
      databaseBackupsCollection,
      bulkOperationsCollection,
      savedViewsCollection,
      ...(resolvedIntegrations(config).length > 0 ? [connectionsCollection] : []),
      ...(config.ai ? [aiUsageCollection] : []),
      ...(config.auth?.rbac ? [rolesCollection] : []),
      ...((config.auth?.providers?.length ?? 0) > 0 ? [userIdentitiesCollection] : []),
      ...(config.audit ? [auditLogsCollection] : []),
    ],
    globals: config.globals ?? [],
    endpoints: config.endpoints ?? [],
    integrations: resolvedIntegrations(config),
    aiFeatures: config.ai ? [...CORE_AI_FEATURES, ...(config.aiFeatures ?? [])] : [],
    cliCommands: config.cliCommands ?? [],
    // Easy CMS's own events (#356), for webhooks and `cms.on`.
    events: [...new Set([...(config.events ?? []), ...SYSTEM_EVENTS])],
    jobs: config.jobs ?? [],
    warnings,
    installedPlugins: (plugins ?? []).map((plugin) =>
      typeof plugin === 'function' && plugin.info ? { ...plugin.info } : {},
    ),
    fieldTypes: config.fieldTypes ?? [],
  }
  const final = withoutUiFields(result)
  resolved.add(final)
  return final
}

/** A container's fields as the admin shows them: `ui` fields included (see `withoutUiFields`). */
export const ADMIN_FIELDS = Symbol('easy-cms.adminFields')

type WithAdminFields = { [ADMIN_FIELDS]?: readonly Field[] }

/** The fields the admin shows: the stored ones and `ui` fields, in their order. */
export function adminFieldsOf(container: { readonly fields: readonly Field[] }): readonly Field[] {
  return (container as WithAdminFields)[ADMIN_FIELDS] ?? container.fields
}

/**
 * Takes `ui` fields (which store nothing) out of every collection, global, group, array and block,
 * so the database, queries, validation and the API never see them. The admin's schema reads
 * them back with `adminFieldsOf`.
 */
function withoutUiFields(config: ResolvedConfig): ResolvedConfig {
  const strip = (fields: readonly Field[]): { data: Field[]; admin: Field[]; changed: boolean } => {
    let changed = false
    const admin: Field[] = []
    const data: Field[] = []
    for (const field of fields) {
      if (field.type === 'ui') {
        changed = true
        admin.push(field)
        continue
      }
      let next: Field = field
      if (field.type === 'group' || field.type === 'array') {
        const inner = strip(field.fields)
        if (inner.changed) {
          changed = true
          next = { ...field, fields: inner.data, [ADMIN_FIELDS]: inner.admin } as unknown as Field
        }
      } else if (field.type === 'blocks' || (field.type === 'richText' && field.blocks)) {
        let blocksChanged = false
        const blocks = (field.blocks ?? []).map((block) => {
          const inner = strip(block.fields)
          if (!inner.changed) return block
          blocksChanged = true
          return { ...block, fields: inner.data, [ADMIN_FIELDS]: inner.admin }
        })
        if (blocksChanged) {
          changed = true
          next = { ...field, blocks } as Field
        }
      }
      admin.push(next)
      data.push(next)
    }
    return { data, admin, changed }
  }
  // Copies: the config given may be resolved again (e.g. by a second instance).
  const apply = <T extends { readonly fields: readonly Field[] }>(container: T): T => {
    const inner = strip(container.fields)
    return inner.changed
      ? ({ ...container, fields: inner.data, [ADMIN_FIELDS]: inner.admin } as T)
      : container
  }
  return {
    ...config,
    collections: config.collections.map(apply),
    globals: config.globals.map(apply),
  }
}

function usesVersions(config: Config): boolean {
  return [...(config.collections ?? []), ...(config.globals ?? [])].some((c) => c.versions)
}

function usesSchedule(config: Config): boolean {
  return [...(config.collections ?? []), ...(config.globals ?? [])].some((c) => c.schedule)
}

function resolveAudit(audit: AuditConfig): Required<AuditConfig> {
  return {
    keepDays: audit.keepDays ?? DEFAULT_AUDIT_KEEP,
    values: audit.values !== false,
    failedLogins: audit.failedLogins ?? DEFAULT_FAILED_LOGINS,
    scope: audit.scope ?? false,
  }
}

/** Plugins' integrations (#311). */
function resolvedIntegrations(config: Config) {
  return config.integrations ?? []
}
