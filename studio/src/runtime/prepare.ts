/**
 * The user's config, made to run in Studio: the database in memory (kept across edits), files in
 * memory, emails to the console, a secret when there is none, and nothing that needs a server.
 */
import { type Config, consoleEmail, type Logger } from '@easy-cms/core'
import { memory } from '@easy-cms/db-memory'
import { REPLACED_VALUE } from './modules'
import { memoryStorage } from './storage'

/** The in-memory database's name: documents stay while the config changes. */
export const DATABASE = 'studio'
/** Studio's own: configs read theirs from `process.env`, which is empty here. */
const SECRET = 'studio-0f3c9a71b2d84e65a1c7f02e9b4d6a38'

const replaced = (value: unknown) =>
  !!value && (typeof value === 'object' || typeof value === 'function') && REPLACED_VALUE in value

export function prepare(config: Config, log: (line: string) => void): Config {
  // Backups write files; a browser can't check a link's address is public before downloading.
  const { backups: _files, upload = {}, auth = {}, admin = {}, ...rest } = config
  const { fromURL: _download, ...files } = upload
  return {
    ...rest,
    secret:
      typeof config.secret === 'string' && config.secret.length >= 32 ? config.secret : SECRET,
    db: memory({ name: DATABASE }),
    upload: {
      ...files,
      storage: memoryStorage(),
      ...(files.privateStorage ? { privateStorage: memoryStorage() } : {}),
    },
    ...(config.email ? { email: consoleEmail({ log }) } : {}),
    auth: { ...auth, providers: (auth.providers ?? []).filter((p) => !replaced(p)) },
    // Admin components load from the app's server, which Studio doesn't have.
    admin: { ...admin, enabled: true, modules: [] },
    plugins: (config.plugins ?? []).filter((p) => !replaced(p)),
  }
}

/** A logger that sends lines to Studio's console. */
export function consoleOf(
  send: (level: 'info' | 'warn' | 'error', message: string) => void,
): Logger {
  return {
    info: (message) => send('info', message),
    warn: (message) => send('warn', message),
    error: (message) => send('error', message),
  }
}
