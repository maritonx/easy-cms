import type { Config } from './config.js'

/**
 * A string that is the same for configs with the same structure: collections, fields, options
 * and every other plain value. Functions count only by where they are, not by their code, since
 * bundlers rename variables differently each time they compile the same source.
 *
 * Frameworks may load the config module more than once (Next.js bundles it into each server
 * layer), which gives different objects for the same config; this tells those apart from edits.
 */
export function configSignature(config: Config): string {
  const known = signatures.get(config)
  if (known !== undefined) return known
  const seen = new WeakSet<object>()
  const signature = JSON.stringify(config, (_key, value: unknown) => {
    if (typeof value === 'function') return 'fn'
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[circular]'
      seen.add(value)
      // Key order carries no meaning in a config.
      if (!Array.isArray(value)) {
        const sorted: Record<string, unknown> = {}
        for (const key of Object.keys(value).sort())
          sorted[key] = (value as Record<string, unknown>)[key]
        seen.add(sorted)
        return sorted
      }
    }
    return value
  })
  signatures.set(config, signature)
  return signature
}

const signatures = new WeakMap<object, string>()
