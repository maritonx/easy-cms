import type { DatabaseInitArgs } from '@easy-cms/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

// What the adapter asks postgres.js for; no server is needed.
const { client } = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock('postgres', () => ({ default: client.mockReturnValue({ end: async () => {} }) }))
vi.mock('@easy-cms/drizzle', async (original) => ({
  ...(await original<typeof import('@easy-cms/drizzle')>()),
  connectDatabase: async () => ({}),
}))
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => ({}) }))

const { postgres } = await import('../src/index.js')

async function optionsFor(options: Parameters<typeof postgres>[0]) {
  client.mockClear()
  await postgres(options).init({ cwd: '.' } as DatabaseInitArgs)
  return client.mock.calls[0]?.[1]
}

describe('postgres.js options', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('leaves what is not set to the URL and the PG* variables', async () => {
    vi.stubEnv('PGAPPNAME', '')
    const options = await optionsFor({ url: 'postgres://db/cms?prepare=false' })
    expect(options).toMatchObject({ max: 10, connection: { application_name: 'easy-cms' } })
    for (const key of ['prepare', 'idle_timeout', 'connect_timeout'])
      expect(options).not.toHaveProperty(key)
    expect(options.connection).not.toHaveProperty('statement_timeout')
  })

  it('passes the pool options, timeouts in seconds', async () => {
    const options = await optionsFor({
      url: 'postgres://db/cms',
      max: 4,
      prepare: false,
      statementTimeoutMs: 15_000,
      idleTimeoutMs: 20_000,
      connectTimeoutMs: 2_500,
      applicationName: 'blog',
    })
    expect(options).toMatchObject({
      max: 4,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 2.5,
      connection: { application_name: 'blog', statement_timeout: 15_000 },
    })
  })

  it('plans each query for its values, unless statements are not prepared', async () => {
    const plan = async (options: Parameters<typeof postgres>[0]) =>
      (await optionsFor(options)).connection.plan_cache_mode
    expect(await plan({ url: 'postgres://db/cms' })).toBe('force_custom_plan')
    expect(await plan({ url: 'postgres://db/cms', prepare: false })).toBeUndefined()
    expect(await plan({ url: 'postgres://db/cms?prepare=false' })).toBeUndefined()
    // Behind PgBouncer with prepared statements: set on the role instead.
    expect(await plan({ url: 'postgres://db/cms', customPlans: false })).toBeUndefined()
  })

  it('names the connections after PGAPPNAME when it is set', async () => {
    vi.stubEnv('PGAPPNAME', 'cms-worker')
    const options = await optionsFor({ url: 'postgres://db/cms' })
    expect(options.connection.application_name).toBe('cms-worker')
  })
})
