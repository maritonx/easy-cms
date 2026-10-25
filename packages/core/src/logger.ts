import { auditContext } from './audit.js'

/** More about a log line: `error` for what failed (its stack goes to the log). */
export interface LogDetails {
  readonly error?: unknown
  readonly [key: string]: unknown
}

export interface Logger {
  info(message: string, details?: LogDetails): void
  warn(message: string, details?: LogDetails): void
  error(message: string, details?: LogDetails): void
}

/** Readable lines for development; an error's stack follows its line. */
export const consoleLogger: Logger = {
  info: (message) => console.info(`[easy-cms] ${message}`),
  warn: (message) => console.warn(`[easy-cms] ${message}`),
  error: (message, details) => {
    const stack = details?.error instanceof Error ? details.error.stack : undefined
    console.error(`[easy-cms] ${message}${stack ? `\n${stack}` : ''}`)
  },
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} }

/** Log line formats: `pretty` for people, `json` (one object per line) for log pipelines. */
export interface LogsConfig {
  /** Default `pretty`. The `EASY_CMS_LOG_FORMAT` environment variable wins over this. */
  readonly format?: 'pretty' | 'json'
  /** In `json`, a line for every API request (method, path, status, duration). Default true. */
  readonly requests?: boolean
}

/** The format in use: `EASY_CMS_LOG_FORMAT`, then the config, then `pretty`. */
export function logFormat(logs: LogsConfig | undefined): 'pretty' | 'json' {
  const env = process.env.EASY_CMS_LOG_FORMAT
  if (env === 'json' || env === 'pretty') return env
  return logs?.format ?? 'pretty'
}

const jsonLoggers = new WeakSet<Logger>()

/** Whether a logger writes JSON: it then also gets a line per API request (`logs.requests`). */
export const isJsonLogger = (logger: Logger): boolean => jsonLoggers.has(logger)

function errorFields(error: unknown) {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack }
  return { message: String(error) }
}

/**
 * One JSON object per line: `time`, `level`, `name`, `message`, the request's `requestId` (or
 * the job run's `runId`), `error` with its stack, and any other details.
 */
export function jsonLogger(
  write: (line: string, level: 'info' | 'warn' | 'error') => void = (line, level) =>
    (level === 'info' ? process.stdout : process.stderr).write(`${line}\n`),
): Logger {
  const log = (level: 'info' | 'warn' | 'error') => (message: string, details?: LogDetails) => {
    const store = auditContext.getStore()
    const { error, ...rest } = details ?? {}
    const entry = {
      time: new Date().toISOString(),
      level,
      name: 'easy-cms',
      message,
      ...(store?.requestId ? { requestId: store.requestId } : {}),
      ...(store?.runId ? { runId: store.runId } : {}),
      ...rest,
      ...(error === undefined ? {} : { error: errorFields(error) }),
    }
    let line: string
    try {
      line = JSON.stringify(entry)
    } catch {
      line = JSON.stringify({
        ...entry,
        ...Object.fromEntries(Object.keys(rest).map((k) => [k, '[unserializable]'])),
      })
    }
    write(line, level)
  }
  const logger = { info: log('info'), warn: log('warn'), error: log('error') }
  jsonLoggers.add(logger)
  return logger
}
