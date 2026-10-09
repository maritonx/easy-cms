import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/** `prepack` of every published package: no `workspace:` ranges unless the packer rewrites them. */
const script = resolve(import.meta.dirname, '../../../scripts/check-publish.mjs')
const dirs: string[] = []
// Without the agent of the package manager running the tests. Windows keeps environment names in
// any case and the child would see two of them: `NPM_CONFIG_USER_AGENT` from pnpm would win.
const inherited = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'npm_config_user_agent'),
)

function pack(manifest: object, userAgent: string) {
  const dir = mkdtempSync(join(tmpdir(), 'check-publish-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  return spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...inherited, npm_config_user_agent: userAgent },
  })
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const plugin = {
  name: '@easy-cms/plugin-x',
  peerDependencies: { '@easy-cms/core': 'workspace:^' },
  devDependencies: { vitest: '^5.0.0' },
}

describe('check-publish', () => {
  it('stops npm and Yarn 1, which publish workspace: ranges as they are', () => {
    for (const agent of [
      'npm/11.6.2 node/v22.20.0 darwin x64',
      'yarn/1.22.22 npm/? node/v22.20.0',
      '',
    ]) {
      const result = pack(plugin, agent)
      expect(result.status, result.stderr).toBe(1)
      expect(result.stderr).toContain('peerDependencies: @easy-cms/core@workspace:^')
      expect(result.stderr).toContain('pnpm --filter @easy-cms/plugin-x publish')
    }
  })

  it('lets pnpm, Yarn 2+ and Bun through: they rewrite the ranges', () => {
    for (const agent of [
      'pnpm/10.12.1 npm/? node/v22.20.0 darwin x64',
      'yarn/4.5.0 npm/? node/v22.20.0',
      'bun/1.3.0 npm/? node/v22.20.0',
    ])
      expect(pack(plugin, agent).status).toBe(0)
  })

  it('lets any package manager pack a package without workspace: ranges', () => {
    expect(pack({ name: 'x', dependencies: { jiti: '^2.7.0' } }, 'npm/11.6.2').status).toBe(0)
  })
})
