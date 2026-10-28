import type * as Otel from '@opentelemetry/api'
import type { Database } from './database.js'
import { ConfigError } from './errors.js'
import { setTraceIds } from './logger.js'
import { VERSION } from './version.js'

/** `telemetry` in the config: OpenTelemetry traces and metrics, both on with `true`. */
export interface TelemetryConfig {
  /** Spans for API requests, Local API calls, database calls and background jobs. Default true. */
  readonly traces?: boolean
  /** Request and database durations, job runs and queue sizes. Default true. */
  readonly metrics?: boolean
}

type Attributes = Record<string, string | number | boolean>

/** Queues whose sizes are reported, as `easy_cms.queue.size` with `queue` and `state`. */
export type QueueSizes = Record<string, { pending: number; failed: number }>

/** Database calls that get a span: those of `Database` that take a collection or a global. */
const DB_CALLS = new Set([
  'find',
  'findPage',
  'findAfter',
  'findById',
  'findByIds',
  'count',
  'create',
  'update',
  'increment',
  'delete',
  'findGlobal',
  'updateGlobal',
])

/**
 * OpenTelemetry for one CMS (`telemetry` in the config, ADR-0057): spans and metrics through
 * `@opentelemetry/api`, sent wherever the app's own SDK sends them. Spans carry names of
 * collections, routes and operations, never values from queries or documents.
 */
export class Telemetry {
  private readonly tracer: Otel.Tracer | undefined
  private readonly httpDuration: Otel.Histogram | undefined
  private readonly dbDuration: Otel.Histogram | undefined
  private readonly jobRuns: Otel.Counter | undefined
  private readonly jobDuration: Otel.Histogram | undefined
  private queues: QueueSizes = {}
  private late = 0

  private constructor(
    private readonly api: typeof Otel,
    traces: boolean,
    metrics: boolean,
  ) {
    this.tracer = traces ? api.trace.getTracer('easy-cms', VERSION) : undefined
    if (metrics) {
      const meter = api.metrics.getMeter('easy-cms', VERSION)
      this.httpDuration = meter.createHistogram('http.server.request.duration', {
        unit: 's',
        description: 'Duration of API requests',
      })
      this.dbDuration = meter.createHistogram('db.client.operation.duration', {
        unit: 's',
        description: 'Duration of database calls',
      })
      this.jobRuns = meter.createCounter('easy_cms.jobs.runs', {
        description: 'Runs of the config’s jobs, by job and result',
      })
      this.jobDuration = meter.createHistogram('easy_cms.jobs.duration', {
        unit: 's',
        description: 'Duration of the config’s jobs',
      })
      meter
        .createObservableGauge('easy_cms.queue.size', {
          description: 'Background work waiting or failed, as of the last job run',
        })
        .addCallback((result) => {
          for (const [queue, sizes] of Object.entries(this.queues))
            for (const state of ['pending', 'failed'] as const)
              result.observe(sizes[state], { queue, state })
        })
      meter
        .createObservableGauge('easy_cms.scheduled.late', {
          description: 'Scheduled publishes more than 10 minutes late, as of the last job run',
        })
        .addCallback((result) => result.observe(this.late))
    }
    if (traces)
      setTraceIds(() => {
        const context = api.trace.getActiveSpan()?.spanContext()
        return context && api.isSpanContextValid(context)
          ? { traceId: context.traceId, spanId: context.spanId }
          : undefined
      })
  }

  /** `undefined` without `telemetry`; throws when `@opentelemetry/api` isn't installed. */
  static async load(config: boolean | TelemetryConfig | undefined): Promise<Telemetry | undefined> {
    if (!config) return undefined
    const { traces = true, metrics = true } = config === true ? {} : config
    if (!traces && !metrics) return undefined
    let api: typeof Otel
    try {
      api = await import('@opentelemetry/api')
    } catch {
      throw new ConfigError([
        {
          path: 'telemetry',
          message: 'needs @opentelemetry/api',
          hint: 'npm install @opentelemetry/api, and set up the OpenTelemetry SDK in your app',
        },
      ])
    }
    return new Telemetry(api, traces, metrics)
  }

  /** Runs `fn` in a span; with traces off, just runs it. Errors mark the span and go on. */
  async span<T>(
    name: string,
    attributes: Attributes,
    fn: (span: Otel.Span | undefined) => Promise<T>,
    kind: 'internal' | 'server' | 'client' = 'internal',
  ): Promise<T> {
    if (!this.tracer) return fn(undefined)
    const spanKind = { internal: 0, server: 1, client: 2 }[kind] as Otel.SpanKind
    return this.tracer.startActiveSpan(name, { kind: spanKind, attributes }, async (span) => {
      try {
        return await fn(span)
      } catch (error) {
        span.setStatus({ code: this.api.SpanStatusCode.ERROR })
        span.setAttribute('error.type', errorType(error))
        throw error
      } finally {
        span.end()
      }
    })
  }

  /**
   * An API request: a server span when nothing traces it yet (`easy-cms serve`), else a span
   * inside the framework's (Next.js, Nuxt with an SDK).
   */
  async request(method: string, route: string, fn: () => Promise<Response>): Promise<Response> {
    const started = performance.now()
    const kind = this.api.trace.getActiveSpan() ? 'internal' : 'server'
    const attributes = { 'http.request.method': method, 'http.route': route }
    let status = 500
    try {
      return await this.span(
        `easy-cms ${method} ${route}`,
        attributes,
        async (span) => {
          const response = await fn()
          status = response.status
          span?.setAttribute('http.response.status_code', status)
          if (status >= 500) span?.setStatus({ code: this.api.SpanStatusCode.ERROR })
          return response
        },
        kind,
      )
    } finally {
      this.httpDuration?.record((performance.now() - started) / 1000, {
        ...attributes,
        'http.response.status_code': status,
      })
    }
  }

  /** The database with a client span and a duration per call (`db <call> <collection>`). */
  database(db: Database, system: string): Database {
    return new Proxy(db, {
      get: (target, key, receiver) => {
        const value = Reflect.get(target, key, receiver)
        if (typeof key !== 'string' || !DB_CALLS.has(key) || typeof value !== 'function')
          return value
        return (args: { collection?: string; slug?: string }, ...rest: unknown[]) => {
          const name = args?.collection ?? args?.slug ?? ''
          const attributes = {
            'db.system.name': system,
            'db.operation.name': key,
            'db.collection.name': name,
          }
          const started = performance.now()
          return this.span(
            `db ${key} ${name}`,
            attributes,
            () => Promise.resolve(value.call(target, args, ...rest)),
            'client',
          ).finally(() => this.dbDuration?.record((performance.now() - started) / 1000, attributes))
        }
      },
    })
  }

  /** A run of one of the config's jobs, for `easy_cms.jobs.*`. */
  jobRan(name: string, ok: boolean, ms: number): void {
    const attributes = { job: name, result: ok ? 'ok' : 'failed' }
    this.jobRuns?.add(1, attributes)
    this.jobDuration?.record(ms / 1000, { job: name })
  }

  /** Whether the queue gauges are reported (and worth counting for). */
  get measuresQueues(): boolean {
    return this.jobRuns !== undefined
  }

  /** Queue sizes found by the last job run, for the gauges. */
  queuesCounted(queues: QueueSizes, late: number): void {
    this.queues = queues
    this.late = late
  }
}

/** The kind of an error, for `error.type`: its class or code, not its message. */
function errorType(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && code) return code
    const name = (error as { name?: unknown }).name
    if (typeof name === 'string' && name) return name
  }
  return 'Error'
}

/**
 * A REST path as a route: collection and global slugs and ids become parameters, so spans and
 * metrics have a few names, not one per document.
 */
export function routeOf(path: string | null, root: boolean): string {
  if (path === null) return 'other'
  if (root) return path
  const parts = path.split('/').filter(Boolean)
  const [first] = parts
  const fixed = new Set(['auth', 'admin', 'jobs', 'search', 'healthz', 'readyz', 'api-keys'])
  const word = /^[a-z][a-z.-]{0,39}$/
  const route = parts.map((part, i) => {
    if (i === 0) return fixed.has(part) || part === 'globals' ? part : ':collection'
    if (first === 'globals' && i === 1) return ':global'
    if (first === 'admin' || first === 'auth') return word.test(part) ? part : ':param'
    if (i === 1) return /^\d+$/.test(part) || !word.test(part) ? ':id' : part
    return word.test(part) ? part : ':id'
  })
  return `/${route.join('/')}`
}
