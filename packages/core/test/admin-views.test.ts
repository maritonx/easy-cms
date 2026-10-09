import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/index.js'
import { baseConfig } from './helpers.js'

/** Pages (`admin.pages`) and dashboard widgets (`admin.dashboard`). */
describe('admin pages and widgets', () => {
  it('apply defaults', async () => {
    const config = await resolveConfig(
      baseConfig({
        admin: {
          pages: [{ path: 'stats', label: 'Stats', component: 'ecms-stats' }],
          dashboard: [{ component: 'ecms-stats-widget' }],
        },
      }),
    )
    expect(config.admin.pages).toHaveLength(1)
    expect(config.admin.dashboard).toEqual([{ component: 'ecms-stats-widget' }])
  })

  it('reject mistakes', async () => {
    const bad = (admin: unknown) => resolveConfig(baseConfig({ admin: admin as never }))
    await expect(
      bad({ pages: [{ path: 'Stats', label: 'Stats', component: 'ecms-stats' }] }),
    ).rejects.toThrow(/admin\.pages\[0\]\.path: must be lowercase letters/)
    await expect(
      bad({
        pages: [
          { path: 'stats', label: 'A', component: 'ecms-a' },
          { path: 'stats', label: 'B', component: 'ecms-b' },
        ],
      }),
    ).rejects.toThrow(/"stats" is used by another page/)
    await expect(
      bad({ pages: [{ path: 'stats', label: 'Stats', component: 'stats' }] }),
    ).rejects.toThrow(/admin\.pages\[0\]\.component/)
    await expect(bad({ pages: [{ path: 'stats', component: 'ecms-stats' }] })).rejects.toThrow(
      /admin\.pages\[0\]\.label/,
    )
    await expect(
      bad({ pages: [{ path: 's', label: 'S', component: 'ecms-s', group: 'reports.weekly' }] }),
    ).rejects.toThrow(/no menu group "reports.weekly"/)
    await expect(
      bad({ pages: [{ path: 's', label: 'S', component: 'ecms-s', icon: 'rocket-ship' }] }),
    ).rejects.toThrow(/unknown icon/)
    await expect(
      bad({ dashboard: [{ component: 'ecms-w', width: 'third', access: true }] }),
    ).rejects.toThrow(/width: must be "half" or "full"[\s\S]*access: must be a function/)
  })
})
