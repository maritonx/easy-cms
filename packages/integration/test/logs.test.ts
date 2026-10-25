import { createEasyCMS, createRestHandler, defineConfig, jsonLogger } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, SECRET, tempProject } from './helpers.js'

const CRON = 'logs-test-cron-secret-0123456789abcdef'
const config = defineConfig({
  secret: SECRET,
  cronSecret: CRON,
  db: db(),
  collections: [
    {
      slug: 'posts',
      access: { read: () => true },
      fields: [{ name: 'title', type: 'text' }],
    },
  ],
  endpoints: [
    {
      path: '/boom',
      method: 'get',
      handler: () => {
        throw new Error('endpoint exploded')
      },
    },
  ],
  jobs: [{ name: 'test:log', every: 3600, run: ({ cms }) => cms.logger.info('job ran') }],
})

async function setup(logs: { requests?: boolean } = {}) {
  const lines: Record<string, unknown>[] = []
  const cms = await createEasyCMS(
    { ...config, logs },
    {
      cwd: tempProject(),
      scheduler: false,
      logger: jsonLogger((line) => lines.push(JSON.parse(line))),
    },
  )
  const handle = createRestHandler(cms)
  const call = (path: string, headers: Record<string, string> = {}) =>
    handle(new Request(`http://cms.test/api/cms${path}`, { headers }))
  return { cms, lines, call }
}

describe('request ids and JSON logs', () => {
  it('gives every response a request id, keeping a plain one from the proxy', async () => {
    const { cms, call } = await setup()
    const generated = (await call('/posts')).headers.get('x-request-id')
    expect(generated).toMatch(/^[0-9a-f-]{36}$/)
    expect((await call('/posts')).headers.get('x-request-id')).not.toBe(generated)
    const kept = await call('/posts', { 'x-request-id': 'lb-7f3a.42' })
    expect(kept.headers.get('x-request-id')).toBe('lb-7f3a.42')
    const replaced = await call('/posts', { 'x-request-id': 'bad id <script>' })
    expect(replaced.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    // Errors too.
    expect((await call('/nothing-here')).headers.get('x-request-id')).toBeTruthy()
    await cms.destroy()
  })

  it('logs a line per request, without the query string', async () => {
    const { cms, lines, call } = await setup()
    await call('/posts?where[title][equals]=secret', { 'x-request-id': 'req-a' })
    expect(lines.at(-1)).toMatchObject({
      level: 'info',
      name: 'easy-cms',
      message: 'GET /api/cms/posts 200',
      requestId: 'req-a',
      method: 'GET',
      path: '/api/cms/posts',
      status: 200,
      durationMs: expect.any(Number),
    })
    expect(JSON.stringify(lines)).not.toContain('secret')
    await cms.destroy()

    const quiet = await setup({ requests: false })
    await quiet.call('/posts')
    expect(quiet.lines.filter((line) => 'status' in line)).toEqual([])
    await quiet.cms.destroy()
  })

  it("puts the request id and the error's stack on errors logged during the request", async () => {
    const { cms, lines, call } = await setup()
    const response = await call('/boom', { 'x-request-id': 'req-b' })
    expect(response.status).toBe(500)
    expect(lines.find((line) => line.level === 'error')).toMatchObject({
      message: 'REST request failed: endpoint exploded',
      requestId: 'req-b',
      error: { message: 'endpoint exploded', stack: expect.stringContaining('endpoint exploded') },
    })
    await cms.destroy()
  })

  it('gives a run of the jobs its own id, with the request id of the cron call', async () => {
    const { cms, lines, call } = await setup()
    await call('/jobs/run', { authorization: `Bearer ${CRON}`, 'x-request-id': 'cron-1' })
    const ran = lines.find((line) => line.message === 'job ran')
    expect(ran).toMatchObject({
      requestId: 'cron-1',
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })

    await cms.runJobs(new Date(Date.now() + 7_200_000))
    const again = lines.filter((line) => line.message === 'job ran').at(-1)
    expect(again).not.toHaveProperty('requestId')
    expect(again?.runId).not.toBe(ran?.runId)
    await cms.destroy()
  })
})
