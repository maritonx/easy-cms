import {
  type Config,
  ConfigError,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  jsonLogger,
} from '@easy-cms/core'
import { metrics, SpanKind, trace } from '@opentelemetry/api'
import {
  AggregationTemporality,
  MeterProvider,
  MetricReader,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DIALECT, db, open, SECRET, tempProject } from './helpers.js'

// OpenTelemetry (#179, ADR-0057): spans and metrics through @opentelemetry/api, sent wherever the
// app's SDK sends them; names of routes and collections, never values.

class TestReader extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE })
  }
  protected async onForceFlush() {}
  protected async onShutdown() {}
}

const spans = new InMemorySpanExporter()
const reader = new TestReader()
const tracerProvider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] })
const meterProvider = new MeterProvider({ readers: [reader] })

beforeAll(() => {
  tracerProvider.register()
  metrics.setGlobalMeterProvider(meterProvider)
})
afterAll(async () => {
  await tracerProvider.shutdown()
  await meterProvider.shutdown()
  trace.disable()
  metrics.disable()
})
beforeEach(() => spans.reset())

const config = (extra: Partial<Config> = {}) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    telemetry: true,
    collections: [
      {
        slug: 'posts',
        access: { read: () => true },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'body', type: 'textarea' },
        ],
      },
    ],
    ...extra,
  } as Config)

const BASE = 'http://cms.test/api/cms'

/** A metric's data points as `{ attributes, value }`. */
async function points(name: string) {
  const { resourceMetrics } = (await reader.collect()) as { resourceMetrics: ResourceMetrics }
  const metric = resourceMetrics.scopeMetrics
    .flatMap((s) => s.metrics)
    .find((m) => m.descriptor.name === name)
  return (metric?.dataPoints ?? []).map((p) => ({
    attributes: p.attributes,
    value: typeof p.value === 'number' ? p.value : (p.value as { count: number }).count,
  }))
}

describe('telemetry (#179)', () => {
  it('traces a request through the Local API to the database, without values', async () => {
    const cms = await open(config())
    await cms.create('posts', { title: 'secret title', body: 'secret body' })
    spans.reset()
    const handle = createRestHandler(cms)
    const res = await handle(new Request(`${BASE}/posts?where[title][equals]=secret%20title`))
    expect(res.status).toBe(200)

    const finished = spans.getFinishedSpans()
    const request = finished.find((s) => s.name === 'easy-cms GET /api/cms/:collection')
    const find = finished.find((s) => s.name === 'easy-cms find posts')
    const query = finished.find((s) => s.name === 'db find posts')
    expect(request?.kind).toBe(SpanKind.SERVER)
    expect(request?.attributes).toMatchObject({
      'http.request.method': 'GET',
      'http.route': '/api/cms/:collection',
      'http.response.status_code': 200,
    })
    expect(find?.parentSpanContext?.spanId).toBe(request?.spanContext().spanId)
    expect(query?.parentSpanContext?.spanId).toBe(find?.spanContext().spanId)
    expect(query?.kind).toBe(SpanKind.CLIENT)
    expect(query?.attributes).toMatchObject({
      'db.system.name': DIALECT === 'sqlite' ? 'sqlite' : 'postgresql',
      'db.operation.name': 'find',
      'db.collection.name': 'posts',
    })
    // No values from the query, the documents or the URL.
    const attributes = JSON.stringify(finished.map((s) => [s.name, s.attributes]))
    expect(attributes).not.toContain('secret')

    const byId = await handle(new Request(`${BASE}/posts/1`))
    expect(byId.status).toBe(200)
    expect(spans.getFinishedSpans().map((s) => s.name)).toContain(
      'easy-cms GET /api/cms/:collection/:id',
    )
    await cms.destroy()
  })

  it("runs inside the framework's span, and marks errors", async () => {
    const cms = await open(config())
    const handle = createRestHandler(cms)
    const tracer = trace.getTracer('framework')
    await tracer.startActiveSpan('GET /api/cms/[...path]', async (outer) => {
      await handle(new Request(`${BASE}/nothing-here`))
      outer.end()
    })
    const finished = spans.getFinishedSpans()
    const outer = finished.find((s) => s.name === 'GET /api/cms/[...path]')
    const inner = finished.find((s) => s.name.startsWith('easy-cms GET /api/cms/'))
    expect(inner?.kind).toBe(SpanKind.INTERNAL)
    expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId)
    expect(inner?.attributes['http.response.status_code']).toBe(404)

    await expect(cms.create('posts', { title: 5 as never })).rejects.toThrow()
    const failed = spans.getFinishedSpans().find((s) => s.name === 'easy-cms create posts')
    expect(failed?.status.code).toBe(2)
    expect(failed?.attributes['error.type']).toBe('VALIDATION_ERROR')
    await cms.destroy()
  })

  it('puts the trace id on JSON log lines', async () => {
    const lines: Record<string, unknown>[] = []
    const cms = await createEasyCMS(config(), {
      cwd: tempProject(),
      schema: 'push',
      scheduler: false,
      logger: jsonLogger((line) => void lines.push(JSON.parse(line))),
    })
    await createRestHandler(cms)(new Request(`${BASE}/posts`))
    const request = spans
      .getFinishedSpans()
      .find((s) => s.name === 'easy-cms GET /api/cms/:collection')
    const line = lines.find((l) => l.path === '/api/cms/posts')
    expect(line?.traceId).toBe(request?.spanContext().traceId)
    expect(line?.spanId).toBe(request?.spanContext().spanId)
    await cms.destroy()
  })

  it('measures requests, database calls, jobs and queues', async () => {
    const cms = await open(
      config({
        outbox: true,
        jobs: [
          { name: 'tick', run: () => {} },
          {
            name: 'boom',
            run: () => {
              throw new Error('down')
            },
          },
        ],
      }),
    )
    await createRestHandler(cms)(new Request(`${BASE}/posts`))
    await cms.runJobs()

    expect(await points('http.server.request.duration')).toContainEqual({
      attributes: {
        'http.request.method': 'GET',
        'http.route': '/api/cms/:collection',
        'http.response.status_code': 200,
      },
      value: expect.any(Number),
    })
    const db = await points('db.client.operation.duration')
    expect(db.some((p) => p.attributes['db.collection.name'] === 'posts')).toBe(true)
    const runs = await points('easy_cms.jobs.runs')
    expect(runs).toContainEqual({ attributes: { job: 'tick', result: 'ok' }, value: 1 })
    expect(runs).toContainEqual({ attributes: { job: 'boom', result: 'failed' }, value: 1 })
    expect(await points('easy_cms.queue.size')).toContainEqual({
      attributes: { queue: 'outbox', state: 'pending' },
      value: 0,
    })
    expect(spans.getFinishedSpans().map((s) => s.name)).toEqual(
      expect.arrayContaining(['easy-cms jobs.run', 'easy-cms job tick', 'easy-cms job boom']),
    )
    await cms.destroy()
  })

  it('stays off unless asked, and can trace without metrics', async () => {
    const off = await open(config({ telemetry: false }))
    await off.find('posts')
    expect(spans.getFinishedSpans()).toEqual([])
    await off.destroy()

    const metricsOnly = await open(config({ telemetry: { traces: false } }))
    await metricsOnly.find('posts')
    expect(spans.getFinishedSpans()).toEqual([])
    await metricsOnly.destroy()

    const error = await open(config({ telemetry: { logs: true } as never })).catch((e) => e)
    expect(error).toBeInstanceOf(ConfigError)
    expect((error as ConfigError).issues.map((i) => i.path)).toEqual(['telemetry.logs'])
  })
})
