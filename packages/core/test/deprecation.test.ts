import { afterEach, describe, expect, it, vi } from 'vitest'
import { warnDeprecated } from '../src/index.js'
import { warnDeprecated as fromPlugin } from '../src/plugin.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('warnDeprecated', () => {
  it('emits a DeprecationWarning once per code', () => {
    const emit = vi.spyOn(process, 'emitWarning').mockImplementation(() => {})
    warnDeprecated('TEST_DEP001', 'old is now new')
    warnDeprecated('TEST_DEP001', 'old is now new')
    fromPlugin('TEST_DEP001', 'old is now new')
    warnDeprecated('TEST_DEP002', 'other is now another')
    expect(emit.mock.calls).toEqual([
      ['old is now new', { type: 'DeprecationWarning', code: 'TEST_DEP001' }],
      ['other is now another', { type: 'DeprecationWarning', code: 'TEST_DEP002' }],
    ])
  })
})
