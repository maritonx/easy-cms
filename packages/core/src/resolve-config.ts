import { apiKeysCollection } from './api-keys.js'
import {
  DEFAULT_ROLES,
  emailDeliveriesCollection,
  internalCollections,
  scheduledJobsCollection,
  versionsCollection,
  webhookDeliveriesCollection,
  withMedia,
  withUsers,
} from './builtins.js'
import type { Config, ResolvedConfig } from './config.js'
import { ConfigError } from './errors.js'
import { applyFieldTypes, fieldTypeModules } from './field-types.js'
import { validateConfig } from './validate-config.js'

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
  for (const plugin of plugins) {
    if (typeof plugin !== 'function') break // reported by validateConfig
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
    config = withMedia(withUsers(config))
  }

  // Fields of added types become fields of their base types.
  const applied = applyFieldTypes(config)
  config = applied.config
  const issues = [...applied.issues, ...validateConfig(config)]
  if (issues.length > 0) throw new ConfigError(issues)

  const { plugins: _plugins, ...rest } = config
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
      siteUrl: config.admin?.siteUrl ?? '',
      menu: config.admin?.menu ?? [],
      modules: config.admin?.modules ?? [],
    },
    upload: {
      dir: config.upload?.dir ?? 'uploads',
      maxFileSize: config.upload?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      mimeTypes: config.upload?.mimeTypes ?? ['image/*', 'application/pdf'],
      imageSizes: config.upload?.imageSizes ?? [],
      ...(config.upload?.storage ? { storage: config.upload.storage } : {}),
    },
    auth: {
      roles: config.auth?.roles ?? DEFAULT_ROLES,
      tokenExpiration: config.auth?.tokenExpiration ?? DEFAULT_TOKEN_EXPIRATION,
      maxLoginAttempts: config.auth?.maxLoginAttempts ?? 5,
      lockWindow: config.auth?.lockWindow ?? 15 * 60,
      trustedOrigins: config.auth?.trustedOrigins ?? [],
      resetPasswordExpiration: config.auth?.resetPasswordExpiration ?? 60 * 60,
      inviteExpiration: config.auth?.inviteExpiration ?? 7 * 24 * 60 * 60,
      emails: config.auth?.emails ?? {},
    },
    collections: [
      ...(config.collections ?? []),
      ...internalCollections,
      ...(usesVersions(config) ? [versionsCollection] : []),
      ...(usesSchedule(config) ? [scheduledJobsCollection] : []),
      ...((config.webhooks?.length ?? 0) > 0 ? [webhookDeliveriesCollection] : []),
      ...(config.apiKeys ? [apiKeysCollection] : []),
      ...(config.email ? [emailDeliveriesCollection] : []),
    ],
    globals: config.globals ?? [],
    endpoints: config.endpoints ?? [],
    commands: config.commands ?? [],
    fieldTypes: config.fieldTypes ?? [],
  }
  resolved.add(result)
  return result
}

function usesVersions(config: Config): boolean {
  return [...(config.collections ?? []), ...(config.globals ?? [])].some((c) => c.versions)
}

function usesSchedule(config: Config): boolean {
  return [...(config.collections ?? []), ...(config.globals ?? [])].some((c) => c.schedule)
}
