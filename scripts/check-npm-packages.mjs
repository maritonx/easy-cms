// Packages that aren't on npm yet. The release publishes through trusted publishing (OIDC), which
// can't create a package: its first version has to be published by hand, and the package then
// set to trust the release workflow with "Allow npm publish" ticked (without it, only staged
// publishes), or the release fails for it (E404) and skips Docker and Studio. It can't see that
// setting, only that the package exists: the message says to check it. CI runs this on every pull request: a warning, so a new package can be merged; an error
// on the "Version Packages" pull request (--strict), before the release that would fail.
//
//   node scripts/check-npm-packages.mjs [--strict] [--root <dir>]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const rootAt = args.indexOf('--root')
const root = rootAt === -1 ? process.cwd() : args[rootAt + 1]
const REGISTRY = 'https://registry.npmjs.org'

/** The published packages of the workspace (packages/*, not private). */
function packages() {
  const dir = join(root, 'packages')
  return readdirSync(dir)
    .map((name) => join(dir, name, 'package.json'))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, 'utf8')))
    .filter((pkg) => pkg.name && !pkg.private)
    .map((pkg) => pkg.name)
    .sort()
}

/** Whether npm has the package; retried, since a network error must not pass as "missing". */
async function onNpm(name) {
  const url = `${REGISTRY}/${name.replace('/', '%2f')}`
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { accept: 'application/vnd.npm.install-v1+json' },
      })
      if (response.status === 404) return false
      if (response.ok) return true
      throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      if (attempt === 3) throw new Error(`${name}: npm didn't answer (${error.message})`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
    }
  }
}

const names = packages()
const missing = []
for (const name of names) if (!(await onNpm(name))) missing.push(name)

if (missing.length === 0) {
  console.log(`All ${names.length} packages are on npm.`)
  process.exit(0)
}

const level = strict ? 'error' : 'warning'
const steps = [
  'The release publishes with trusted publishing, which can only publish packages that exist and trust it. For each:',
  '  1. Publish a first version by hand: pnpm --filter <name> publish --access public --no-git-checks',
  '  2. On npmjs.com, Settings > Trusted Publisher > GitHub Actions: maritonx / easy-cms / release.yml, no environment',
  '  3. Under "Allowed actions", tick "Allow npm publish": without it the release may only stage, and npm answers E404',
  'Steps 2 and 3 in one command: npx npm@12 trust github <name> --file release.yml --repo maritonx/easy-cms --allow-publish -y',
  '(CONTRIBUTING.md, Releases.)',
]
for (const name of missing)
  console.log(
    `::${level} title=Not on npm yet::${name} has never been published; the release would fail for it.`,
  )
console.log(
  `\n${missing.length} of ${names.length} packages are not on npm yet: ${missing.join(', ')}`,
)
console.log(steps.join('\n'))
process.exit(strict ? 1 : 0)
