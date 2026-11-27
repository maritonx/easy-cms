/**
 * What a config in Studio may import. Packages that run in a browser are the real ones; those
 * that only make sense on a server (databases, storages, email, sign-in) are stand-ins Studio
 * replaces anyway; plugins that don't run in a browser yet do nothing, and say so.
 */
import * as core from '@easy-cms/core'
import * as dbMemory from '@easy-cms/db-memory'
import * as fields from '@easy-cms/fields'
import * as multiTenant from '@easy-cms/plugin-multi-tenant'
import * as redirects from '@easy-cms/plugin-redirects'
import * as seo from '@easy-cms/plugin-seo'

const REAL: Record<string, unknown> = {
  '@easy-cms/core': core,
  '@easy-cms/db-memory': dbMemory,
  '@easy-cms/fields': fields,
  '@easy-cms/plugin-multi-tenant': multiTenant,
  '@easy-cms/plugin-redirects': redirects,
  '@easy-cms/plugin-seo': seo,
}

/** Server-only packages: Studio puts its own in their place (see `prepare`). */
const REPLACED: Record<string, string> = {
  '@easy-cms/db-sqlite': 'the database is SQLite in memory',
  '@easy-cms/db-postgres': 'the database is SQLite in memory',
  '@easy-cms/storage-s3': 'files are kept in memory',
  '@easy-cms/storage-vercel-blob': 'files are kept in memory',
  '@easy-cms/storage-netlify-blobs': 'files are kept in memory',
  '@easy-cms/email-smtp': 'emails show in the console',
  '@easy-cms/auth-oauth': 'single sign-on is off',
}

/** Plugins that don't run in a browser yet: they leave the config as it is. */
const STUBBED = new Set([
  '@easy-cms/plugin-ai',
  '@easy-cms/plugin-analytics',
  '@easy-cms/plugin-backups',
  '@easy-cms/plugin-ecommerce',
  '@easy-cms/plugin-email',
  '@easy-cms/plugin-form-builder',
  '@easy-cms/plugin-graphql',
  '@easy-cms/plugin-mcp',
  '@easy-cms/plugin-nested-docs',
  '@easy-cms/plugin-notify',
  '@easy-cms/plugin-social',
])

/** Marks what a replaced package's function returned, so `prepare` knows to drop it. */
export const REPLACED_VALUE = Symbol('replaced in Studio')

export class ImportError extends Error {}

/**
 * A module whose every export is a function. For a replaced package it returns a marked value;
 * for a stubbed plugin, a plugin that changes nothing (and a function, if called again).
 */
function standIn(specifier: string, kind: 'replaced' | 'stubbed'): unknown {
  const make = (): unknown =>
    kind === 'replaced'
      ? { [REPLACED_VALUE]: specifier }
      : Object.assign((config: unknown) => config, { [REPLACED_VALUE]: specifier })
  return new Proxy(
    {},
    {
      get: (_, key) => (key === '__esModule' ? true : typeof key === 'string' ? make : undefined),
    },
  )
}

export interface Imports {
  /** `require` for the compiled config. */
  require(specifier: string): unknown
  /** Notes for the console: what was replaced or does nothing here. */
  readonly notes: string[]
}

export function imports(): Imports {
  const notes: string[] = []
  return {
    notes,
    require(specifier) {
      const real = REAL[specifier]
      if (real) return real
      const replaced = REPLACED[specifier]
      if (replaced) {
        notes.push(`${specifier}: in Studio, ${replaced}.`)
        return standIn(specifier, 'replaced')
      }
      if (STUBBED.has(specifier)) {
        notes.push(`${specifier}: stubbed in Studio (it doesn't run in a browser yet).`)
        return standIn(specifier, 'stubbed')
      }
      if (specifier.startsWith('.') || specifier.startsWith('/'))
        throw new ImportError(`Studio has only this file: "${specifier}" can't be imported`)
      throw new ImportError(`Studio can import @easy-cms packages only, not "${specifier}" (yet)`)
    },
  }
}
