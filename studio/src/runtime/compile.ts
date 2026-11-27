/**
 * The config's code to a config: TypeScript to CommonJS with sucrase (small, and it keeps every
 * line where it was, so errors point at the editor's lines), run with Studio's `require`.
 */
import type { Config } from '@easy-cms/core'
import { transform } from 'sucrase'
import { type Imports, imports } from './modules'

export class ConfigCodeError extends Error {
  constructor(
    message: string,
    /** 1-based line in the editor, when known. */
    readonly line?: number,
  ) {
    super(message)
  }
}

/** `new Function` puts two lines before the code: `function anonymous(…` and `) {`. */
const FUNCTION_HEADER_LINES = 2

/** The editor's line an error was thrown at, from its stack. */
export function lineOf(error: unknown): number | undefined {
  const stack = error instanceof Error ? (error.stack ?? '') : ''
  const match = /(?:<anonymous>|eval at [^)]*\), <anonymous>):(\d+):\d+/.exec(stack)
  if (!match) return undefined
  const line = Number(match[1]) - FUNCTION_HEADER_LINES
  return line > 0 ? line : undefined
}

export function compile(code: string): { config: Config; imports: Imports } {
  let js: string
  try {
    js = transform(code, {
      transforms: ['typescript', 'imports'],
      filePath: 'easy-cms.config.ts',
      production: true,
    }).code
  } catch (error) {
    const message = (error as Error).message
    const line = /\((\d+):\d+\)/.exec(message)?.[1]
    throw new ConfigCodeError(message, line ? Number(line) : undefined)
  }
  const deps = imports()
  const module = { exports: {} as Record<string, unknown> }
  // No environment variables in Studio: `process.env.X ?? fallback` takes the fallback.
  const process = { env: {} as Record<string, string | undefined> }
  try {
    new Function('require', 'module', 'exports', 'process', js)(
      deps.require,
      module,
      module.exports,
      process,
    )
  } catch (error) {
    throw new ConfigCodeError((error as Error).message, lineOf(error))
  }
  const config = module.exports.default
  if (!config || typeof config !== 'object')
    throw new ConfigCodeError('The file needs `export default defineConfig({ … })`')
  return { config: config as Config, imports: deps }
}
