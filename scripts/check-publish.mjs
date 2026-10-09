// Runs before a package is packed (`prepack`). npm and Yarn 1 copy `workspace:` ranges into the
// published package.json as they are, and nobody can install the result; pnpm, Yarn 2+ and Bun
// turn them into version ranges. So packing with anything else stops here.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']

/** Whether the package manager running the script rewrites `workspace:` ranges when it packs. */
function rewritesWorkspaceRanges(userAgent = '') {
  const [name, version = ''] = (userAgent.split(' ')[0] ?? '').split('/')
  if (name === 'pnpm' || name === 'bun') return true
  if (name === 'yarn') return Number.parseInt(version, 10) >= 2
  return false
}

/** Dependencies that name a `workspace:` range, as `field: name@range`. */
function workspaceRanges(manifest) {
  const found = []
  for (const field of FIELDS)
    for (const [name, range] of Object.entries(manifest[field] ?? {}))
      if (String(range).startsWith('workspace:')) found.push(`${field}: ${name}@${range}`)
  return found
}

// Always runs: a check for "is this the main module" misses on Windows (drive letter case) and
// would let everything through.
const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
// biome-ignore lint/suspicious/noUndeclaredEnvVars: set by the package manager; turbo never runs this
const agent = process.env.npm_config_user_agent ?? ''
const found = workspaceRanges(manifest)
if (found.length && !rewritesWorkspaceRanges(agent)) {
  console.error(
    [
      `${manifest.name} can't be packed with ${agent.split(' ')[0] || 'this package manager'}:`,
      ...found.map((f) => `  ${f}`),
      'These would be published as they are, and nobody could install the package.',
      `Publish with pnpm instead: pnpm --filter ${manifest.name} publish`,
    ].join('\n'),
  )
  process.exit(1)
}
