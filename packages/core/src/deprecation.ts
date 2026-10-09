/**
 * The codes already warned about, on `globalThis`: frameworks may load more than one copy of this
 * module (Next.js bundles it per server layer), and each code should still be logged once.
 */
const KEY = Symbol.for('easy-cms.deprecations')

function warned(): Set<string> {
  const store = globalThis as { [KEY]?: Set<string> }
  store[KEY] ??= new Set()
  return store[KEY]
}

/**
 * Logs that something deprecated was used, once per `code` and process. On Node.js it is a
 * `DeprecationWarning` (`process.emitWarning`), so `--no-deprecation` hides it,
 * `--throw-deprecation` turns it into an error and `--trace-deprecation` shows where it came
 * from; elsewhere `console.warn`.
 *
 * Plugins use codes of their own, e.g. `ACME_SEO_DEP001`.
 *
 * ```ts
 * warnDeprecated('ACME_DEP001', '`acmePlugin({ key })` is now `apiKey`; `key` goes in 2.0.')
 * ```
 */
export function warnDeprecated(code: string, message: string): void {
  const seen = warned()
  if (seen.has(code)) return
  seen.add(code)
  const node = (globalThis as { process?: { emitWarning?: NodeJS.Process['emitWarning'] } }).process
  if (typeof node?.emitWarning === 'function')
    node.emitWarning(message, { type: 'DeprecationWarning', code })
  else console.warn(`[${code}] DeprecationWarning: ${message}`)
}
