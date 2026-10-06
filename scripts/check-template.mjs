// Tries templates/next-starter with this repository's packages, as a deploy would use it:
//   node scripts/check-template.mjs               build (migrate, sample content, next build), start, check pages
//   node scripts/check-template.mjs --migrations <name>   create a migration for the template's config
// The template lists npm versions; here they are swapped for tarballs of the local packages.
import { execFileSync, spawn } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const template = join(root, 'templates/next-starter')
const work = mkdtempSync(join(tmpdir(), 'easy-cms-template-'))
const packs = join(work, 'packs')
const run = (cmd, args, cwd, env = {}) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })

const migrations = process.argv[2] === '--migrations' ? process.argv[3] : undefined
if (process.argv[2] === '--migrations' && !migrations) {
  console.error('Usage: node scripts/check-template.mjs --migrations <name>')
  process.exit(1)
}

try {
  cpSync(template, work, {
    recursive: true,
    filter: (src) => !/[/\\](node_modules|\.next|\.pglite)([/\\]|$)/.test(src),
  })
  mkdirSync(packs)

  // Every published package of the repository, as a tarball.
  const tarballs = {}
  for (const dir of readdirSync(join(root, 'packages'))) {
    const pkg = JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'))
    if (pkg.private) continue
    const before = new Set(readdirSync(packs))
    run('pnpm', ['pack', '--pack-destination', packs], join(root, 'packages', dir))
    const file = readdirSync(packs).find((f) => !before.has(f))
    tarballs[pkg.name] = `file:./packs/${file}`
  }
  const pkgFile = join(work, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  for (const name of Object.keys(pkg.dependencies))
    if (tarballs[name]) pkg.dependencies[name] = tarballs[name]
  // Packages that depend on each other get the local ones too.
  pkg.overrides = tarballs
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2))
  run('npm', ['install', '--no-audit', '--no-fund'], work)

  if (migrations) {
    run('npx', ['easy-cms', 'migrate:create', migrations], work)
    rmSync(join(template, 'easy-cms'), { recursive: true, force: true })
    cpSync(join(work, 'easy-cms'), join(template, 'easy-cms'), { recursive: true })
    console.log(`Migrations copied to ${join(template, 'easy-cms/migrations')}`)
  } else {
    // A deploy without a database server: PGlite in .pglite, the code a deployer would set.
    const env = {
      EASY_CMS_SETUP_CODE: 'check-template',
      DATABASE_URL: '',
      NETLIFY_DATABASE_URL: '',
    }
    run('npm', ['run', 'build'], work, env)
    const port = 3300
    const server = spawn('npx', ['next', 'start', '--port', String(port)], {
      cwd: work,
      stdio: 'inherit',
      env: { ...process.env, ...env, NODE_ENV: 'production' },
    })
    try {
      const base = `http://localhost:${port}`
      let init
      for (let i = 0; i < 60 && !init; i++) {
        init = await fetch(`${base}/api/cms/users/init`)
          .then((r) => (r.ok ? r.json() : undefined))
          .catch(() => undefined)
        if (!init) await new Promise((r) => setTimeout(r, 1000))
      }
      const check = (ok, what) => {
        if (!ok) throw new Error(`Template check failed: ${what}`)
        console.log(`✓ ${what}`)
      }
      check(init?.hasUsers === false && init?.setupCode === true, 'asks for the setup code')
      const home = await (await fetch(base)).text()
      check(home.includes('Welcome to your new CMS'), 'shows the sample posts')
      check((await fetch(`${base}/admin`)).ok, 'serves the admin')
      check((await fetch(`${base}/posts/content-as-code`)).ok, 'serves a post')
    } finally {
      server.kill()
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
