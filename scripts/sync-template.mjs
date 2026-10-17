// After `changeset version`: the template uses the version being released. A prerelease (e.g.
// 1.0.0-rc.0) is skipped: the Deploy buttons clone the template, and stay on the stable release.
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
const { version } = JSON.parse(readFileSync(`${root}packages/core/package.json`, 'utf8'))
if (version.includes('-')) {
  console.log(`templates/next-starter: left as it is for the prerelease ${version}`)
  process.exit(0)
}
const file = `${root}templates/next-starter/package.json`
const pkg = JSON.parse(readFileSync(file, 'utf8'))
for (const name of Object.keys(pkg.dependencies))
  if (name.startsWith('@easy-cms/') || name === 'easy-cms') pkg.dependencies[name] = `^${version}`
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`templates/next-starter: @easy-cms packages at ^${version}`)
