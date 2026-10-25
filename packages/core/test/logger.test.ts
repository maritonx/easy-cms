import { afterEach, describe, expect, it, vi } from 'vitest'
import { auditContext } from '../src/audit.js'
import { consoleLogger, jsonLogger } from '../src/index.js'
import { isJsonLogger, logFormat } from '../src/internal.js'

function capture() {
  const lines: { line: Record<string, unknown>; level: string }[] = []
  const logger = jsonLogger((line, level) => lines.push({ line: JSON.parse(line), level }))
  return { logger, lines }
}

describe('jsonLogger', () => {
  it('writes one object per line with the time, level and message', () => {
    const { logger, lines } = capture()
    logger.info('started', { port: 4000 })
    logger.warn('careful')
    expect(lines).toEqual([
      {
        level: 'info',
        line: {
          time: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
          level: 'info',
          name: 'easy-cms',
          message: 'started',
          port: 4000,
        },
      },
      { level: 'warn', line: expect.objectContaining({ level: 'warn', message: 'careful' }) },
    ])
    expect(isJsonLogger(logger)).toBe(true)
    expect(isJsonLogger(consoleLogger)).toBe(false)
  })

  it('adds the request id or job run id, and the error with its stack', () => {
    const { logger, lines } = capture()
    auditContext.run({ requestId: 'req-1', runId: 'run-1' }, () =>
      logger.error('failed', { error: new TypeError('boom') }),
    )
    logger.error('odd', { error: 'not an Error' })
    expect(lines[0]?.line).toMatchObject({
      requestId: 'req-1',
      runId: 'run-1',
      error: {
        name: 'TypeError',
        message: 'boom',
        stack: expect.stringContaining('TypeError: boom'),
      },
    })
    expect(lines[1]?.line).toMatchObject({ error: { message: 'not an Error' } })
    expect(lines[1]?.line).not.toHaveProperty('requestId')
  })

  it('still writes a line when a detail is not serializable', () => {
    const { logger, lines } = capture()
    const loop: Record<string, unknown> = {}
    loop.self = loop
    logger.info('loop', { loop })
    expect(lines[0]?.line).toMatchObject({ message: 'loop', loop: '[unserializable]' })
  })
})

describe('consoleLogger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prints an error with its stack after the line', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogger.error('failed', { error: new Error('boom') })
    expect(error.mock.calls[0]?.[0]).toMatch(/^\[easy-cms\] failed\nError: boom\n/)
  })
})

describe('logFormat', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('takes EASY_CMS_LOG_FORMAT over the config, and pretty by default', () => {
    vi.stubEnv('EASY_CMS_LOG_FORMAT', '')
    expect(logFormat(undefined)).toBe('pretty')
    expect(logFormat({ format: 'json' })).toBe('json')
    vi.stubEnv('EASY_CMS_LOG_FORMAT', 'pretty')
    expect(logFormat({ format: 'json' })).toBe('pretty')
    vi.stubEnv('EASY_CMS_LOG_FORMAT', 'json')
    expect(logFormat(undefined)).toBe('json')
  })
})
